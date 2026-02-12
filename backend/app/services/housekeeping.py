from __future__ import annotations

import time
from pathlib import Path
from typing import Iterable


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MUSIC_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".json"}


def _prune_files(directory: Path, max_age_seconds: int, allowed_extensions: Iterable[str]) -> int:
    if not directory.exists():
        return 0

    now = time.time()
    deleted = 0
    allowed = set(allowed_extensions)

    for path in directory.iterdir():
        if not path.is_file():
            continue
        if path.suffix.lower() not in allowed:
            continue
        age_seconds = now - path.stat().st_mtime
        if age_seconds < max_age_seconds:
            continue
        path.unlink(missing_ok=True)
        deleted += 1

    return deleted


def cleanup_generated_media(data_dir: Path, retention_days: int) -> dict[str, int]:
    """
    Remove old generated media files from data directories.
    Returns deletion counts by category.
    """
    if retention_days <= 0:
        return {"images_deleted": 0, "music_deleted": 0}

    max_age_seconds = retention_days * 24 * 60 * 60
    images_dir = data_dir / "images"
    music_dir = data_dir / "music"

    images_deleted = _prune_files(images_dir, max_age_seconds, IMAGE_EXTENSIONS)
    music_deleted = _prune_files(music_dir, max_age_seconds, MUSIC_EXTENSIONS)

    return {
        "images_deleted": images_deleted,
        "music_deleted": music_deleted,
    }
