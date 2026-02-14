"""
Remote control endpoints for mobile/remote access
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import subprocess
import os
import platform
import psutil
from pathlib import Path
from app.services.share_service import share_service

router = APIRouter()


def _assert_remote_api_enabled() -> None:
    if share_service.is_active():
        raise HTTPException(
            status_code=423,
            detail="Remote command and filesystem endpoints are disabled while public chat sharing is active."
        )


@router.get("/test")
async def test_remote():
    """Test endpoint to verify remote router is working"""
    blocked = share_service.is_active()
    return {
        "status": "ok" if not blocked else "limited",
        "message": "Remote router is active" if not blocked else "Remote endpoints are temporarily disabled while sharing.",
        "disabled_while_sharing": blocked,
        "endpoints": [
            "/api/remote/system/status",
            "/api/remote/system/processes",
            "/api/remote/files/list",
            "/api/remote/files/read",
            "/api/remote/command"
        ]
    }


class CommandRequest(BaseModel):
    command: str
    cwd: Optional[str] = None
    timeout: int = 30


class FileListRequest(BaseModel):
    path: str
    show_hidden: bool = False


@router.post("/command")
async def execute_command(request: CommandRequest):
    """
    Execute a shell command remotely (with safety restrictions)
    """
    _assert_remote_api_enabled()
    # Safety: Block dangerous commands
    dangerous_commands = ['rm -rf', 'format', 'del /f', 'shutdown', 'reboot', 'sudo rm']
    command_lower = request.command.lower()
    
    for dangerous in dangerous_commands:
        if dangerous in command_lower:
            raise HTTPException(
                status_code=403,
                detail=f"Command blocked for safety: {dangerous}"
            )
    
    try:
        cwd = request.cwd or os.getcwd()
        if not os.path.exists(cwd):
            raise HTTPException(status_code=400, detail=f"Directory does not exist: {cwd}")
        
        # Execute command
        result = subprocess.run(
            request.command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=request.timeout,
        )
        
        return {
            "status": "success" if result.returncode == 0 else "error",
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "command": request.command,
            "cwd": cwd,
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Command timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system/status")
async def get_system_status():
    """Get detailed system status"""
    _assert_remote_api_enabled()
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Get running processes count
        processes = len(psutil.pids())
        
        # Get network stats
        net_io = psutil.net_io_counters()
        
        return {
            "cpu": {
                "percent": cpu_percent,
                "count": psutil.cpu_count(logical=True),
                "cores": psutil.cpu_count(logical=False),
            },
            "memory": {
                "total_gb": round(memory.total / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "percent": memory.percent,
            },
            "disk": {
                "total_gb": round(disk.total / (1024**3), 2),
                "used_gb": round(disk.used / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "percent": round((disk.used / disk.total) * 100, 1),
            },
            "processes": processes,
            "network": {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
            },
            "platform": platform.system(),
            "hostname": platform.node(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system/processes")
async def get_processes(limit: int = 20):
    """Get top processes by CPU usage"""
    _assert_remote_api_enabled()
    try:
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                proc_info = proc.info
                proc_info['cpu_percent'] = proc.cpu_percent()
                proc_info['memory_percent'] = proc.memory_percent()
                processes.append(proc_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        # Sort by CPU and return top N
        processes.sort(key=lambda x: x.get('cpu_percent', 0), reverse=True)
        return {"processes": processes[:limit]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/list")
async def list_directory(request: FileListRequest):
    """List files in a directory"""
    _assert_remote_api_enabled()
    try:
        path = Path(request.path).expanduser()
        
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
        
        if not path.is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")
        
        items = []
        for item in path.iterdir():
            if not request.show_hidden and item.name.startswith('.'):
                continue
            
            try:
                stat = item.stat()
                items.append({
                    "name": item.name,
                    "path": str(item),
                    "type": "directory" if item.is_dir() else "file",
                    "size": stat.st_size if item.is_file() else None,
                    "modified": stat.st_mtime,
                })
            except (PermissionError, OSError):
                continue
        
        # Sort: directories first, then by name
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        
        return {
            "path": str(path),
            "items": items,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/read")
async def read_file(file_path: str, lines: Optional[int] = None):
    """Read a file (optionally limit to N lines)"""
    _assert_remote_api_enabled()
    try:
        path = Path(file_path).expanduser()
        
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"File does not exist: {path}")
        
        if not path.is_file():
            raise HTTPException(status_code=400, detail=f"Path is not a file: {path}")
        
        # Safety: limit file size
        max_size = 10 * 1024 * 1024  # 10MB
        if path.stat().st_size > max_size:
            raise HTTPException(status_code=413, detail="File too large (max 10MB)")
        
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            if lines:
                content_lines = []
                for i, line in enumerate(f):
                    if i >= lines:
                        break
                    content_lines.append(line)
                content = ''.join(content_lines)
                if i >= lines - 1:
                    content += f"\n... (showing first {lines} lines)"
            else:
                content = f.read()
        
        return {
            "path": str(path),
            "content": content,
            "size": path.stat().st_size,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
