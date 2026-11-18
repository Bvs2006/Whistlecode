from __future__ import annotations

import os
from pathlib import Path

DEFAULT_SANDBOX = Path(__file__).resolve().parents[2] / "data" / "sandbox"
MAX_TEXT_BYTES = 1_000_000


class FilesystemScopeError(Exception):
    pass


def sandbox_root() -> Path:
    configured = os.getenv("WHISTLECODE_SANDBOX_DIR", "").strip()
    root = Path(configured).expanduser() if configured else DEFAULT_SANDBOX
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    marker = root / ".whistlecode-sandbox"
    if not marker.exists():
        marker.write_text("WhistleCode sandbox. Only files inside this folder are visible to tools.\n", encoding="utf-8")
    return root


def resolve_sandbox_path(relative_path: str | None) -> Path:
    root = sandbox_root()
    raw = (relative_path or "").strip()
    if raw in {"", "."}:
        return root
    candidate_input = Path(raw)
    if candidate_input.is_absolute():
        candidate = candidate_input.resolve()
    else:
        candidate = (root / candidate_input).resolve()
    if candidate != root and root not in candidate.parents:
        raise FilesystemScopeError("That path is outside the approved sandbox folder.")
    return candidate


def list_directory(relative_path: str | None = "") -> dict:
    target = resolve_sandbox_path(relative_path)
    if not target.exists() or not target.is_dir():
        raise FilesystemScopeError("Folder does not exist inside the sandbox.")
    entries = []
    for child in sorted(target.iterdir(), key=lambda item: item.name.lower()):
        if child.name == ".whistlecode-sandbox":
            continue
        entries.append({
            "name": child.name,
            "kind": "directory" if child.is_dir() else "file",
            "bytes": child.stat().st_size if child.is_file() else None,
        })
    return {"path": str(target), "entries": entries}


def read_text(relative_path: str) -> dict:
    target = resolve_sandbox_path(relative_path)
    if not target.is_file():
        raise FilesystemScopeError("File does not exist inside the sandbox.")
    size = target.stat().st_size
    if size > MAX_TEXT_BYTES:
        raise FilesystemScopeError("File is larger than the 1 MB text read limit.")
    return {"path": str(target), "bytes": size, "text": target.read_text(encoding="utf-8")}


def write_text(relative_path: str, text: str) -> dict:
    if not relative_path or Path(relative_path).name in {"", ".", ".."}:
        raise FilesystemScopeError("A file name inside the sandbox is required.")
    encoded = text.encode("utf-8")
    if len(encoded) > MAX_TEXT_BYTES:
        raise FilesystemScopeError("Refusing to write more than 1 MB of text.")
    target = resolve_sandbox_path(relative_path)
    if target == sandbox_root():
        raise FilesystemScopeError("Choose a file name inside the sandbox.")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(encoded)
    if not target.is_file():
        raise FilesystemScopeError("File write did not create a file.")
    return {"path": str(target), "bytes": target.stat().st_size}
