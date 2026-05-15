# scripts/

Python tooling for the AIedge data + ML pipeline, grouped by role.

## Layout

| Folder | Role |
|---|---|
| `live/` | The Fly-deployed real-time pipeline — the live-bars aggregator, the live TFO runner, and the TFO detector/feature modules they share. `Dockerfile.live-bars` ships this folder. |
| `ml/` | Offline model training, backtesting, and corpus validation. |
| `backfill/` | One-shot historical / corpus backfill jobs. |
| `sync/` | Jobs that push scanner + audit data to the live site. |
| `build/` | Page-data builders that generate JSON under `public/`. |

`probe_databento_entitlements.py` and `requirements-ml.txt` stay at the
root — the probe is a standalone diagnostic, and the requirements file is
referenced by the SessionStart hook.

## Import convention

Each script puts its own directory on `sys.path`, so bare imports
(`from tfo_detector import ...`) resolve to same-folder siblings. Scripts
in `ml/` and `backfill/` that need the TFO modules add `scripts/live/` to
the path explicitly — see `backfill/backfill_tfo_candidates.py` for the
pattern.

Scripts that need the repo root compute it with
`Path(__file__).resolve().parents[2]` (the file is two levels below the
repo root: `scripts/<group>/<file>.py`).
