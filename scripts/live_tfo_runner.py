"""Live TFO detection + inline scoring runner.

Plugs into scripts/live_bars_aggregator.py's `on_close` callback. As each
1min bar closes, this aggregates to 5min in-process. On every closed 5min
bar, runs scripts/tfo_detector.detect_tfo over the session so far; on a
fire, extracts features via scripts/tfo_features and predict_proba's the
joblib model. Inserts a fully-scored row into setup_candidates the
moment the setup is real.

Architectural invariants:
1. Detection + feature math are shared modules (tfo_detector,
   tfo_features). The model trained on backfill features sees identical
   features at live fire time. NEVER duplicate the math here.
2. Per-session de-dup is enforced by the unique constraint on
   setup_candidates (symbol, session_date, pattern, direction). A 409 is
   "already detected today" — log + skip.
3. Failures here NEVER crash the aggregator. The aggregator's primary
   mission is writing bars to Redis; this is a secondary feature.
4. Cold start: if the aggregator boots mid-session, the 5min buffer is
   empty. On the first 5min close per symbol after boot, fetch today's
   session-so-far from /api/bars to warm the buffer. Single robust path.
5. Supabase writes run in a background daemon thread so the live thread
   isn't blocked on HTTP latency.

Required env (read at construction):
    SUPABASE_URL                — e.g. https://YOUR.supabase.co
    SUPABASE_SERVICE_ROLE_KEY   — service role, bypasses RLS
    TFO_MODEL_PATH              — joblib model path (default /app/model.joblib)
    AIEDGE_BASE_URL             — for warm-up /api/bars calls
                                  (default https://www.aiedge.trade)

If any of these are missing (or model load fails), the runner logs and
disables itself. The aggregator keeps writing bars; the live scanner
just doesn't surface new fires until you fix the env.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, time as time_t
from pathlib import Path
from typing import Any

log = logging.getLogger("live_tfo")


# These imports must succeed for the runner to work. If sklearn/joblib
# isn't installed in the runtime image, the runner disables itself
# cleanly at construction.
_IMPORT_ERR: Exception | None = None
try:
    import numpy as np
    from joblib import load as joblib_load

    from tfo_detector import Bar5m, detect_tfo
    from tfo_features import extract_features_for_fire
except Exception as exc:  # pragma: no cover — env-dependent
    _IMPORT_ERR = exc


PATTERN = "tfo"
ET_TZ_NAME = "America/New_York"
# RTH bar-close epoch ranges (in ET): 9:35 first close (9:30+5m bar) to
# 16:00. Used only for "does this 1min bar belong to RTH" filtering.
RTH_OPEN = time_t(9, 30)
RTH_CLOSE = time_t(16, 0)


def _bar_5m_epoch(unix_seconds: int) -> int:
    """Return the 5-minute bucket-start epoch this 1min bar belongs to."""
    return (int(unix_seconds) // 300) * 300


def _session_date_et(unix_seconds: int) -> str:
    """Return the ET-aligned YYYY-MM-DD date string for a bar epoch.

    We key per-session state by this string so a fresh trading day clears
    yesterday's buffer automatically.
    """
    # Lazy zoneinfo import — keeps the runner importable in environments
    # without tzdata (the Fly container has it).
    from zoneinfo import ZoneInfo
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc).astimezone(ZoneInfo(ET_TZ_NAME))
    return dt.strftime("%Y-%m-%d")


def _is_rth(unix_seconds: int) -> bool:
    """Is this bar inside US equities regular trading hours (ET)?"""
    from zoneinfo import ZoneInfo
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc).astimezone(ZoneInfo(ET_TZ_NAME))
    # The bar's t is its open; RTH bars span 9:30 open ... 15:59 open
    # (last 5min bar closes at 16:00). A 9:30 bar.t passes; a 16:00 bar.t
    # does not (it's a post-RTH bar).
    return RTH_OPEN <= dt.time() < RTH_CLOSE


# ---------- per-symbol 5min aggregation ---------------------------------

class _FiveMinAggregator:
    """Buckets 1min bars into 5min bars and emits closed 5min bars.

    Pure in-process. We don't subscribe to a separate Databento schema
    because we already have the 1min stream — aggregating up costs
    nothing and keeps the data path single-source.
    """

    def __init__(self) -> None:
        self.current_bucket: int | None = None
        self.o: float = 0.0
        self.h: float = 0.0
        self.l: float = 0.0
        self.c: float = 0.0
        self.v: float = 0.0

    def push_1m(self, bar1m: dict) -> dict | None:
        """Add a 1min bar. Returns a closed 5min bar dict if this 1min
        bar rolled the 5min bucket, else None.

        bar1m shape: {t, o, h, l, c, v}.
        """
        bucket = _bar_5m_epoch(int(bar1m["t"]))
        if self.current_bucket is None:
            self.current_bucket = bucket
            self.o, self.h, self.l, self.c = float(bar1m["o"]), float(bar1m["h"]), float(bar1m["l"]), float(bar1m["c"])
            self.v = float(bar1m.get("v") or 0)
            return None

        if bucket > self.current_bucket:
            closed = {
                "t": self.current_bucket,
                "o": self.o,
                "h": self.h,
                "l": self.l,
                "c": self.c,
                "v": self.v,
            }
            self.current_bucket = bucket
            self.o, self.h, self.l, self.c = float(bar1m["o"]), float(bar1m["h"]), float(bar1m["l"]), float(bar1m["c"])
            self.v = float(bar1m.get("v") or 0)
            return closed

        # same 5min bucket — extend
        self.h = max(self.h, float(bar1m["h"]))
        self.l = min(self.l, float(bar1m["l"]))
        self.c = float(bar1m["c"])
        self.v += float(bar1m.get("v") or 0)
        return None


# ---------- the runner --------------------------------------------------

class TfoLiveRunner:
    """Owns: model, per-symbol 5min aggregators, per-symbol 5min RTH
    buffers (keyed by session date), per-(symbol, session, direction)
    "already inserted" set, and a background HTTP write thread.

    Thread model: detection runs synchronously on the live thread (it's
    microseconds — a pure function over <80 bars). The Supabase POST is
    fired into a daemon thread so the live stream isn't blocked on HTTP.
    """

    def __init__(
        self,
        *,
        supabase_url: str | None = None,
        supabase_key: str | None = None,
        model_path: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.enabled = False
        self.supabase_url = (supabase_url or os.environ.get("SUPABASE_URL") or "").rstrip("/")
        self.supabase_key = supabase_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.model_path = Path(model_path or os.environ.get("TFO_MODEL_PATH") or "/app/model.joblib")
        self.base_url = (base_url or os.environ.get("AIEDGE_BASE_URL") or "https://www.aiedge.trade").rstrip("/")

        if _IMPORT_ERR is not None:
            log.warning("TfoLiveRunner disabled — ML deps not importable: %s", _IMPORT_ERR)
            return
        if not self.supabase_url or not self.supabase_key:
            log.warning("TfoLiveRunner disabled — SUPABASE_URL / SERVICE_ROLE_KEY missing")
            return
        if not self.model_path.exists():
            log.warning("TfoLiveRunner disabled — model not found at %s", self.model_path)
            return

        try:
            bundle = joblib_load(self.model_path)
            self.model = bundle["model"]
            self.feature_columns: list[str] = bundle["feature_columns"]
            self.target: str = bundle["target"]
            self.model_version: str = bundle.get("model_version") or bundle.get("trained_at") or "unknown"
        except Exception as exc:
            log.warning("TfoLiveRunner disabled — model load failed: %s", exc)
            return

        # Per-symbol 5min aggregators
        self._aggs: dict[str, _FiveMinAggregator] = {}
        # Per-symbol session 5min RTH buffers, keyed by ET date so a fresh
        # day clears yesterday automatically.
        self._buffers: dict[str, tuple[str, list[dict]]] = {}
        # Per-(symbol, session_date, direction) "already inserted today"
        # set. Avoids re-POSTing the same setup on every subsequent 5min
        # close. Cleared along with the buffer on a new session.
        self._inserted: set[tuple[str, str, str]] = set()
        # Per-symbol "we've warmed the buffer this session" flag, to
        # avoid re-fetching /api/bars on every 5min close.
        self._warmed: set[tuple[str, str]] = set()

        self._lock = threading.Lock()

        self.enabled = True
        log.info(
            "TfoLiveRunner ENABLED: target=%s version=%s model=%s",
            self.target, self.model_version, self.model_path,
        )

    # ----- main entry point — called from aggregator on_close --------

    def on_1m_close(self, symbol: str, bar1m: dict) -> None:
        """Push a closed 1min bar. Aggregates to 5min in-process; on each
        closed 5min RTH bar, runs detection + scoring + insert.

        Never raises — failures are logged and dropped so the aggregator
        keeps writing bars regardless.
        """
        if not self.enabled:
            return
        try:
            self._on_1m_close_inner(symbol, bar1m)
        except Exception as exc:
            log.exception("TfoLiveRunner.on_1m_close(%s, t=%s) crashed: %s", symbol, bar1m.get("t"), exc)

    def _on_1m_close_inner(self, symbol: str, bar1m: dict) -> None:
        agg = self._aggs.setdefault(symbol, _FiveMinAggregator())
        closed_5m = agg.push_1m(bar1m)
        if closed_5m is None:
            return
        # Only act on RTH 5min bars. The 5min bar's t is its open epoch.
        if not _is_rth(int(closed_5m["t"])):
            return

        session_date = _session_date_et(int(closed_5m["t"]))
        buf_key = (symbol, session_date)
        with self._lock:
            existing = self._buffers.get(symbol)
            if existing is None or existing[0] != session_date:
                # New session — clear buffer + dedup state for this symbol.
                self._buffers[symbol] = (session_date, [])
                # Drop any inserted markers for this symbol from prior
                # sessions. (Other symbols' markers persist.)
                self._inserted = {x for x in self._inserted if x[0] != symbol or x[1] == session_date}
            session_date_now, buf = self._buffers[symbol]

            # Cold-start warm-up: if we have only the freshly-closed bar
            # and haven't warmed this (symbol, session) yet, fetch today's
            # session so far from /api/bars to populate the buffer.
            needs_warmup = len(buf) == 0 and buf_key not in self._warmed
            buf.append(closed_5m)
            buffer_snapshot = list(buf)
            already_inserted_keys = set(self._inserted)

        if needs_warmup:
            warmed = self._warm_buffer(symbol, session_date, closed_5m)
            if warmed:
                with self._lock:
                    sd, _ = self._buffers[symbol]
                    if sd == session_date:
                        self._buffers[symbol] = (session_date, warmed)
                        buffer_snapshot = list(warmed)
                    self._warmed.add(buf_key)

        if len(buffer_snapshot) < 4:  # detector needs at least pivot_window + 3 confirms
            return

        # Convert dict bars to Bar5m and run detector.
        bars5 = [
            Bar5m(t=int(b["t"]), o=float(b["o"]), h=float(b["h"]), l=float(b["l"]), c=float(b["c"]), v=float(b.get("v") or 0))
            for b in buffer_snapshot
        ]
        signals = detect_tfo(bars5)
        if not signals:
            return

        for sig in signals:
            key = (symbol, session_date, sig.direction)
            if key in already_inserted_keys:
                continue
            try:
                features = extract_features_for_fire(
                    buffer_snapshot,
                    fire_ts=sig.fire_ts,
                    pivot_index=sig.pivot_index,
                    consecutive_count=sig.consecutive_count,
                    strong_count=sig.strong_count,
                )
                if features is None:
                    log.warning(
                        "TfoLiveRunner: feature extraction returned None for %s %s %s",
                        symbol, session_date, sig.direction,
                    )
                    continue
                score = self._score(features, sig.direction)
            except Exception as exc:
                log.exception("TfoLiveRunner score path failed for %s %s: %s", symbol, session_date, exc)
                continue

            # Mark inserted *before* dispatch so a concurrent close on the
            # same symbol/session/direction doesn't try to insert twice.
            with self._lock:
                self._inserted.add(key)

            row = {
                "symbol": symbol,
                "session_date": session_date,
                "pattern": PATTERN,
                "direction": sig.direction,
                "fire_ts": sig.fire_ts,
                "pivot_index": sig.pivot_index,
                "fired_bar_index": sig.fired_bar_index,
                "consecutive_count": sig.consecutive_count,
                "strong_count": sig.strong_count,
                "score": sig.score,
                "strong_bar_ts": list(sig.strong_bar_timestamps),
                "status": "new",
                "source": "live",
                "features": features,
                "features_extracted_at": _now_iso(),
                "model_score": round(float(score), 6),
                "model_target": self.target,
                "model_version": self.model_version,
                "model_scored_at": _now_iso(),
            }
            threading.Thread(
                target=self._insert_candidate,
                args=(row,),
                daemon=True,
                name=f"tfo-insert-{symbol}-{session_date}-{sig.direction}",
            ).start()

    # ----- helpers ----------------------------------------------------

    def _score(self, features: dict, direction: str) -> float:
        x_row = []
        for col in self.feature_columns:
            if col == "dir_long":
                x_row.append(1 if direction == "long" else 0)
            else:
                v = features.get(col)
                if v is None:
                    raise ValueError(f"missing feature {col!r}")
                x_row.append(float(v))
        x = np.array([x_row], dtype=float)
        return float(self.model.predict_proba(x)[0, 1])

    def _warm_buffer(self, symbol: str, session_date: str, latest_5m: dict) -> list[dict] | None:
        """Cold-start: fetch today's RTH 5min bars from /api/bars so the
        detector has the morning's context (LOD/HOD lives in the first 4
        bars).

        Returns the merged buffer (fetched + the latest 5m bar we just
        appended), or None on any failure (we fall through to natural
        accumulation from this point onward).
        """
        try:
            qs = urllib.parse.urlencode({
                "ticker": symbol,
                "from": session_date,
                "to": session_date,
                "tf": "5min",
                "session": "rth",
                "limit": "200",
            })
            url = f"{self.base_url}/api/bars?{qs}"
            with urllib.request.urlopen(url, timeout=15) as r:
                payload = json.loads(r.read())
        except Exception as exc:
            log.warning("TfoLiveRunner: cold-start /api/bars(%s, %s) failed: %s", symbol, session_date, exc)
            return None

        fetched = payload.get("bars") or []
        # Stitch: keep fetched bars strictly before latest_5m.t, then
        # append latest_5m. /api/bars may itself include the closed bar
        # we just produced — dedupe by t.
        latest_t = int(latest_5m["t"])
        prior = [b for b in fetched if int(b["t"]) < latest_t]
        return prior + [latest_5m]

    def _insert_candidate(self, row: dict) -> None:
        """POST to setup_candidates. 409 (unique conflict) = backfill or
        another live insert beat us; that's not an error.
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
                        "TfoLiveRunner: inserted %s %s %s score=%.3f model=%.3f",
                        row["symbol"], row["session_date"], row["direction"],
                        row["score"], row["model_score"],
                    )
                else:
                    log.warning("TfoLiveRunner: insert %s -> %s", row["symbol"], r.status)
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                log.info(
                    "TfoLiveRunner: %s %s %s already exists (409, ok)",
                    row["symbol"], row["session_date"], row["direction"],
                )
            else:
                body = exc.read()[:200].decode("utf-8", errors="replace")
                log.warning("TfoLiveRunner: insert %s HTTPError %s: %s", row["symbol"], exc.code, body)
        except Exception as exc:
            log.warning("TfoLiveRunner: insert %s failed: %s", row["symbol"], exc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
