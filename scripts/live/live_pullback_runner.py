"""Live small-pullback detection runner.

Plugs into scripts/live/live_bars_aggregator.py's `on_close` callback.
As each 1min bar closes, this appends it to a per-symbol session buffer
and runs scripts/live/pullback_detector.detect_pullbacks over the
session so far. On a new fire it inserts a row into setup_candidates
with pattern='pullback' the moment the setup is real.

Why this is a separate runner from live_tfo_runner:

  - TFO is a once-per-session pattern (trend from the open). Small
    pullbacks recur intraday — many fires per symbol per day — so this
    runs the detector on EVERY 1min close, not on 5min closes, and
    de-dups per (symbol, session, direction, fire_ts) rather than
    per (symbol, session, direction).
  - The pullback detector is timeframe-agnostic and unscored in V1
    (no joblib model). model_score is left NULL; the scanner already
    renders that as "—".

Architectural invariants (mirrors live_tfo_runner):
1. Detection math is the shared pullback_detector module — never
   duplicate it here.
2. Per-fire de-dup is enforced by the unique constraint on
   setup_candidates (symbol, session_date, pattern, direction,
   fire_ts). A 409 is "already detected" — log + skip.
3. Failures here NEVER crash the aggregator. Bar-writing is the
   primary mission; this is a secondary feature.
4. Cold start: if the aggregator boots mid-session the buffer is
   empty. On the first 1min close per symbol after boot, fetch
   today's session-so-far from /api/bars to warm the buffer.
5. Supabase writes run in background daemon threads so the live
   thread isn't blocked on HTTP latency.

Required env (read at construction):
    SUPABASE_URL                — e.g. https://YOUR.supabase.co
    SUPABASE_SERVICE_ROLE_KEY   — service role, bypasses RLS
    AIEDGE_BASE_URL             — for warm-up /api/bars calls
                                  (default https://www.aiedge.trade)

If SUPABASE_URL / SERVICE_ROLE_KEY are missing the runner logs and
disables itself. The aggregator keeps writing bars regardless.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, time as time_t

from pullback_detector import Bar, detect_pullbacks

log = logging.getLogger("live_pullback")


PATTERN = "pullback"
TIMEFRAME = "1m"
ET_TZ_NAME = "America/New_York"
RTH_OPEN = time_t(9, 30)
RTH_CLOSE = time_t(16, 0)


def _session_date_et(unix_seconds: int) -> str:
    """ET-aligned YYYY-MM-DD for a bar epoch. Keying per-session state by
    this string clears yesterday's buffer automatically on a new day.
    """
    from zoneinfo import ZoneInfo
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc).astimezone(ZoneInfo(ET_TZ_NAME))
    return dt.strftime("%Y-%m-%d")


def _is_rth(unix_seconds: int) -> bool:
    """Is this bar's open inside US equities regular trading hours (ET)?"""
    from zoneinfo import ZoneInfo
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc).astimezone(ZoneInfo(ET_TZ_NAME))
    return RTH_OPEN <= dt.time() < RTH_CLOSE


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PullbackLiveRunner:
    """Owns: per-symbol session 1min RTH buffers (keyed by ET date) and a
    per-(symbol, session, direction, fire_ts) "already inserted" set.

    Detection runs synchronously on the live thread — it's a pure
    function over a few hundred bars. The Supabase POST is fired into a
    daemon thread so the live stream isn't blocked on HTTP.
    """

    def __init__(
        self,
        *,
        supabase_url: str | None = None,
        supabase_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.enabled = False
        self.supabase_url = (supabase_url or os.environ.get("SUPABASE_URL") or "").rstrip("/")
        self.supabase_key = supabase_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.base_url = (base_url or os.environ.get("AIEDGE_BASE_URL") or "https://www.aiedge.trade").rstrip("/")

        if not self.supabase_url or not self.supabase_key:
            log.warning("PullbackLiveRunner disabled — SUPABASE_URL / SERVICE_ROLE_KEY missing")
            return

        # Per-symbol session 1min RTH buffer, keyed by ET date so a fresh
        # day clears yesterday automatically.
        self._buffers: dict[str, tuple[str, list[dict]]] = {}
        # Per-(symbol, session_date, direction, fire_ts) "already inserted"
        # set. Cleared along with the buffer on a new session.
        self._inserted: set[tuple[str, str, str, int]] = set()
        # Per-(symbol, session) "buffer warmed" flag, to avoid re-fetching
        # /api/bars on every 1min close.
        self._warmed: set[tuple[str, str]] = set()
        self._lock = threading.Lock()

        self.enabled = True
        log.info("PullbackLiveRunner ENABLED: pattern=%s timeframe=%s", PATTERN, TIMEFRAME)

    # ----- main entry point — called from aggregator on_close --------

    def on_1m_close(self, symbol: str, bar1m: dict) -> None:
        """Push a closed 1min bar. Runs detection + insert on each closed
        1min RTH bar. Never raises — failures are logged and dropped so
        the aggregator keeps writing bars regardless.
        """
        if not self.enabled:
            return
        try:
            self._on_1m_close_inner(symbol, bar1m)
        except Exception as exc:
            log.exception("PullbackLiveRunner.on_1m_close(%s, t=%s) crashed: %s", symbol, bar1m.get("t"), exc)

    def _on_1m_close_inner(self, symbol: str, bar1m: dict) -> None:
        t = int(bar1m["t"])
        if not _is_rth(t):
            return

        session_date = _session_date_et(t)
        buf_key = (symbol, session_date)
        with self._lock:
            existing = self._buffers.get(symbol)
            if existing is None or existing[0] != session_date:
                # New session — clear buffer + dedup state for this symbol.
                self._buffers[symbol] = (session_date, [])
                self._inserted = {x for x in self._inserted if x[0] != symbol or x[1] == session_date}
            _, buf = self._buffers[symbol]

            # Cold-start warm-up: if the buffer is empty and we haven't
            # warmed this (symbol, session) yet, fetch today's session so
            # far from /api/bars before appending this bar.
            needs_warmup = len(buf) == 0 and buf_key not in self._warmed
            buf.append({"t": t, "o": float(bar1m["o"]), "h": float(bar1m["h"]),
                        "l": float(bar1m["l"]), "c": float(bar1m["c"]), "v": float(bar1m.get("v") or 0)})
            buffer_snapshot = list(buf)
            already_inserted = set(self._inserted)

        if needs_warmup:
            warmed = self._warm_buffer(symbol, session_date, buffer_snapshot[-1])
            if warmed:
                with self._lock:
                    sd, _ = self._buffers[symbol]
                    if sd == session_date:
                        self._buffers[symbol] = (session_date, warmed)
                        buffer_snapshot = list(warmed)
                    self._warmed.add(buf_key)

        bars = [
            Bar(t=int(b["t"]), o=float(b["o"]), h=float(b["h"]), l=float(b["l"]), c=float(b["c"]), v=float(b.get("v") or 0))
            for b in buffer_snapshot
        ]
        signals = detect_pullbacks(bars, timeframe=TIMEFRAME)
        if not signals:
            return

        for sig in signals:
            key = (symbol, session_date, sig.direction, sig.fire_ts)
            if key in already_inserted:
                continue
            # Mark inserted before dispatch so a concurrent close on the
            # same symbol doesn't try to insert the same fire twice.
            with self._lock:
                self._inserted.add(key)

            row = {
                "symbol": symbol,
                "session_date": session_date,
                "pattern": PATTERN,
                "direction": sig.direction,
                "fire_ts": sig.fire_ts,
                "fired_bar_index": sig.fire_index,
                "score": sig.score,
                "status": "new",
                "source": "live",
                # Pullback-specific geometry lives in the generic features
                # jsonb — the scanner reads it for the pullback columns.
                "features": {
                    "timeframe": sig.timeframe,
                    "entry_price": sig.entry_price,
                    "stop_price": sig.stop_price,
                    "impulse_atr": sig.impulse_atr,
                    "pullback_len": sig.pullback_len,
                    "retrace": sig.retrace,
                    "impulse_start_ts": sig.impulse_start_ts,
                    "impulse_top_ts": sig.impulse_top_ts,
                    "pullback_bar_timestamps": list(sig.pullback_bar_timestamps),
                },
                "features_extracted_at": _now_iso(),
            }
            threading.Thread(
                target=self._insert_candidate,
                args=(row,),
                daemon=True,
                name=f"pullback-insert-{symbol}-{session_date}-{sig.fire_ts}",
            ).start()

    # ----- helpers ----------------------------------------------------

    def _warm_buffer(self, symbol: str, session_date: str, latest_1m: dict) -> list[dict] | None:
        """Cold-start: fetch today's RTH 1min bars from /api/bars so the
        detector has the morning's context (EMA/ATR warm-up needs it).

        Returns the merged buffer (fetched + the latest bar we just
        appended), or None on any failure — we fall through to natural
        accumulation from this point onward.
        """
        try:
            qs = urllib.parse.urlencode({
                "ticker": symbol,
                "from": session_date,
                "to": session_date,
                "tf": "1min",
                "session": "rth",
                "limit": "1000",
            })
            url = f"{self.base_url}/api/bars?{qs}"
            with urllib.request.urlopen(url, timeout=15) as r:
                payload = json.loads(r.read())
        except Exception as exc:
            log.warning("PullbackLiveRunner: cold-start /api/bars(%s, %s) failed: %s", symbol, session_date, exc)
            return None

        fetched = payload.get("bars") or []
        latest_t = int(latest_1m["t"])
        prior = [b for b in fetched if int(b["t"]) < latest_t]
        return prior + [latest_1m]

    def _insert_candidate(self, row: dict) -> None:
        """POST to setup_candidates. 409 (unique conflict) = this fire was
        already inserted; that's not an error.
        """
        url = f"{self.supabase_url}/rest/v1/setup_candidates"
        req = urllib.request.Request(
            url,
            method="POST",
            data=json.dumps(row).encode("utf-8"),
            headers={
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal,resolution=ignore-duplicates",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                if 200 <= r.status < 300:
                    log.info(
                        "PullbackLiveRunner: inserted %s %s %s fire_ts=%s score=%.3f",
                        row["symbol"], row["session_date"], row["direction"],
                        row["fire_ts"], row["score"],
                    )
                else:
                    log.warning("PullbackLiveRunner: insert %s -> %s", row["symbol"], r.status)
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                log.info(
                    "PullbackLiveRunner: %s %s %s fire_ts=%s already exists (409, ok)",
                    row["symbol"], row["session_date"], row["direction"], row["fire_ts"],
                )
            else:
                body = exc.read()[:200].decode("utf-8", errors="replace")
                log.warning("PullbackLiveRunner: insert %s HTTPError %s: %s", row["symbol"], exc.code, body)
        except Exception as exc:
            log.warning("PullbackLiveRunner: insert %s failed: %s", row["symbol"], exc)
