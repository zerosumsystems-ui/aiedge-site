#!/usr/bin/env python3
"""
Sync Claude Vault markdown files to the aiedge.trade /api/vault endpoint.

Usage:
    python3 scripts/sync_vault.py                     # local dev
    python3 scripts/sync_vault.py https://aiedge.trade # production
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).parent))
from _sync_auth import add_auth_header  # noqa: E402

VAULT_DIR = Path.home() / "Claude Vault"
DEFAULT_URL = "http://localhost:3000"

SKIP_FOLDERS = {".obsidian", ".git", ".trash"}


def extract_title(content: str) -> str:
    """Extract title from first # heading, or use filename."""
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            # Strip the # and any trailing " — subtitle"
            title = line[2:].strip()
            # Keep the full title including " — " parts
            return title
    return ""


def extract_wiki_links(content: str) -> list[str]:
    """Extract all [[target]] and [[target|display]] wiki-link targets."""
    return list(set(re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", content)))


def path_to_slug(path: Path, vault_root: Path) -> str:
    """Convert a file path to a URL-friendly slug."""
    rel = path.relative_to(vault_root)
    # Remove .md extension, keep folder structure
    parts = list(rel.parts)
    parts[-1] = parts[-1].replace(".md", "")
    return "/".join(parts)


def path_to_folder(path: Path, vault_root: Path) -> str:
    """Get the folder path relative to vault root."""
    rel = path.relative_to(vault_root)
    return str(rel.parent) if rel.parent != Path(".") else ""


def collect_notes(vault_dir: Path) -> list[dict]:
    """Walk the vault directory and collect all markdown notes."""
    notes = []

    for md_file in sorted(vault_dir.rglob("*.md")):
        # Skip hidden/system folders
        if any(part in SKIP_FOLDERS for part in md_file.parts):
            continue

        content = md_file.read_text(encoding="utf-8")
        title = extract_title(content) or md_file.stem

        notes.append({
            "slug": path_to_slug(md_file, vault_dir),
            "title": title,
            "folder": path_to_folder(md_file, vault_dir),
            "filename": md_file.name,
            "content": content,
            "wikiLinks": extract_wiki_links(content),
        })

    return notes


def sync(base_url: str):
    """Collect vault notes and POST to the API."""
    if not VAULT_DIR.is_dir():
        print(f"ERROR: Vault directory not found: {VAULT_DIR}")
        sys.exit(1)

    notes = collect_notes(VAULT_DIR)
    payload = {
        "notes": notes,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "noteCount": len(notes),
    }

    url = f"{base_url.rstrip('/')}/api/vault"
    data = json.dumps(payload).encode("utf-8")

    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_auth_header(req)

    print(f"Syncing {len(notes)} notes to {url}...")

    try:
        with urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"OK — {result.get('noteCount', '?')} notes synced")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    sync(base)
