"""
Chat sharing service powered by Cloudflare Quick Tunnels.
"""

from __future__ import annotations

import queue
import re
import shutil
import subprocess
import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional


TRY_CLOUDFLARE_URL_RE = re.compile(r"https://[a-zA-Z0-9.-]+\.trycloudflare\.com")


class ShareService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: Optional[subprocess.Popen[str]] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._line_queue: "queue.Queue[str]" = queue.Queue()
        self._logs: Deque[str] = deque(maxlen=200)
        self._public_base_url: Optional[str] = None
        self._started_at: Optional[float] = None
        self._last_error: Optional[str] = None
        self._target_url: str = "http://127.0.0.1:8000"

    def _append_log(self, line: str) -> None:
        with self._lock:
            self._logs.append(line)

    def _stream_reader(self, process: subprocess.Popen[str]) -> None:
        if process.stdout is None:
            return
        try:
            for raw_line in process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                self._append_log(line)
                try:
                    self._line_queue.put_nowait(line)
                except queue.Full:
                    pass
        except Exception:
            # Process output reading is best-effort.
            return

    def _ensure_stale_process_cleared_locked(self) -> None:
        process = self._process
        if process is None:
            return
        if process.poll() is None:
            return
        self._process = None
        self._reader_thread = None
        self._public_base_url = None
        self._started_at = None
        if process.returncode not in (0, None):
            last_lines = list(self._logs)[-8:]
            suffix = f" | logs: {' || '.join(last_lines)}" if last_lines else ""
            self._last_error = f"cloudflared exited with code {process.returncode}{suffix}"

    def _format_status_locked(self) -> Dict[str, object]:
        self._ensure_stale_process_cleared_locked()
        is_active = self._process is not None and self._process.poll() is None and bool(self._public_base_url)
        public_chat_url = None
        if self._public_base_url:
            public_chat_url = f"{self._public_base_url.rstrip('/')}/chat"

        cloudflared_bin = shutil.which("cloudflared")
        return {
            "active": is_active,
            "provider": "cloudflare_quick_tunnel",
            "cloudflared_installed": bool(cloudflared_bin),
            "cloudflared_path": cloudflared_bin,
            "local_target_url": self._target_url,
            "local_chat_url": f"{self._target_url.rstrip('/')}/chat",
            "public_base_url": self._public_base_url,
            "public_chat_url": public_chat_url,
            "started_at": self._started_at,
            "last_error": self._last_error,
            "remote_api_blocked": bool(is_active),
            "status": "active" if is_active else "idle",
        }

    def is_active(self) -> bool:
        with self._lock:
            status = self._format_status_locked()
        return bool(status.get("active"))

    def get_status(self) -> Dict[str, object]:
        with self._lock:
            return self._format_status_locked()

    def start(self, target_url: str = "http://127.0.0.1:8000", startup_timeout_s: float = 22.0) -> Dict[str, object]:
        normalized_target = target_url.strip().rstrip("/") or "http://127.0.0.1:8000"
        cloudflared_bin = shutil.which("cloudflared")
        if not cloudflared_bin:
            raise RuntimeError(
                "cloudflared is not installed. Install it and retry. "
                "macOS: brew install cloudflared"
            )

        with self._lock:
            self._ensure_stale_process_cleared_locked()
            if self._process is not None and self._process.poll() is None and self._public_base_url:
                return self._format_status_locked()

            self._target_url = normalized_target
            self._public_base_url = None
            self._started_at = None
            self._last_error = None
            self._logs.clear()
            self._line_queue = queue.Queue()

            command = [cloudflared_bin, "tunnel", "--url", normalized_target]
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            self._process = process
            reader = threading.Thread(target=self._stream_reader, args=(process,), daemon=True)
            self._reader_thread = reader
            reader.start()

        deadline = time.time() + startup_timeout_s
        found_url: Optional[str] = None
        while time.time() < deadline:
            with self._lock:
                process = self._process
                if process is None:
                    break
                exit_code = process.poll()
                if exit_code is not None:
                    last_lines = list(self._logs)[-8:]
                    suffix = f" | logs: {' || '.join(last_lines)}" if last_lines else ""
                    self._last_error = f"cloudflared exited with code {exit_code}{suffix}"
                    self._process = None
                    self._reader_thread = None
                    break

            try:
                line = self._line_queue.get(timeout=0.25)
            except queue.Empty:
                continue

            match = TRY_CLOUDFLARE_URL_RE.search(line)
            if not match:
                continue
            found_url = match.group(0).rstrip("/")
            break

        if not found_url:
            self.stop()
            raise RuntimeError(
                "Timed out while waiting for Cloudflare tunnel URL. "
                "Ensure cloudflared can reach the internet and try again."
            )

        with self._lock:
            self._public_base_url = found_url
            self._started_at = time.time()
            self._last_error = None
            return self._format_status_locked()

    def stop(self) -> Dict[str, object]:
        process: Optional[subprocess.Popen[str]]
        with self._lock:
            process = self._process
            self._process = None
            self._reader_thread = None
            self._public_base_url = None
            self._started_at = None

        if process is not None and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=4)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass

        with self._lock:
            return self._format_status_locked()

    def recent_logs(self, limit: int = 20) -> List[str]:
        with self._lock:
            return list(self._logs)[-max(1, min(limit, 100)) :]


share_service = ShareService()

