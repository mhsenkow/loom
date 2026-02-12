import time
from pathlib import Path

from app.services.housekeeping import cleanup_generated_media


def _touch_with_age(path: Path, age_days: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x")
    old = time.time() - age_days * 24 * 60 * 60
    path.chmod(0o644)
    # Keep atime current, set mtime old.
    path.touch()
    import os
    os.utime(path, (time.time(), old))


def test_cleanup_generated_media_prunes_old_files(tmp_path: Path):
    data_dir = tmp_path / "data"
    old_image = data_dir / "images" / "old.png"
    new_image = data_dir / "images" / "new.png"
    old_music = data_dir / "music" / "old.wav"
    new_music = data_dir / "music" / "new.wav"
    keep_other = data_dir / "music" / "README.md"

    _touch_with_age(old_image, age_days=30)
    _touch_with_age(new_image, age_days=1)
    _touch_with_age(old_music, age_days=30)
    _touch_with_age(new_music, age_days=1)
    _touch_with_age(keep_other, age_days=30)

    result = cleanup_generated_media(data_dir, retention_days=14)

    assert result["images_deleted"] == 1
    assert result["music_deleted"] == 1
    assert not old_image.exists()
    assert new_image.exists()
    assert not old_music.exists()
    assert new_music.exists()
    # Not an allowed media extension, should be left alone.
    assert keep_other.exists()


def test_cleanup_generated_media_noop_for_non_positive_retention(tmp_path: Path):
    data_dir = tmp_path / "data"
    file_path = data_dir / "images" / "file.png"
    _touch_with_age(file_path, age_days=365)

    result = cleanup_generated_media(data_dir, retention_days=0)
    assert result == {"images_deleted": 0, "music_deleted": 0}
    assert file_path.exists()
