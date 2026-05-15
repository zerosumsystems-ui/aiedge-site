"""Shared auth helper for sync_*.py scripts.

All scripts that POST to aiedge.trade /api/* must send an
`Authorization: Bearer <SYNC_SECRET>` header. Import and call:

    from _sync_auth import add_auth_header
    add_auth_header(req)

Raises SystemExit(1) with a clear message if SYNC_SECRET is unset,
so scripts fail fast rather than silently posting without auth.
"""

from __future__ import annotations

import os
import sys
from urllib.request import Request


def add_auth_header(req: Request) -> None:
    secret = os.environ.get("SYNC_SECRET")
    if not secret:
        print(
            "ERROR: SYNC_SECRET env var not set. Export it in your shell "
            "(e.g. `export SYNC_SECRET=...`) before running sync scripts.",
            file=sys.stderr,
        )
        sys.exit(1)
    req.add_header("Authorization", f"Bearer {secret}")
