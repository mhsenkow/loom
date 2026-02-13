"""
System operations API endpoints for SHELL_EXEC cells.
"""

import asyncio
import logging
import subprocess
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("loom.api.system")


class ShellExecRequest(BaseModel):
    command: str
    cwd: Optional[str] = None
    timeout: int = 30


@router.post("/exec")
async def exec_shell_command(request: ShellExecRequest):
    """
    Execute a shell command.
    WARNING: This allows arbitrary command execution.
    """
    command = request.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    logger.info("shell_exec command=%s cwd=%s", command, request.cwd)

    try:
        # Run the command asynchronously
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=request.cwd,
        )

        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=request.timeout)
        except asyncio.TimeoutError:
            process.kill()
            raise HTTPException(status_code=408, detail=f"Command timed out after {request.timeout}s")

        return {
            "stdout": stdout.decode().strip(),
            "stderr": stderr.decode().strip(),
            "exit_code": process.returncode,
        }

    except Exception as e:
        logger.exception("shell_exec_failed command=%s", command)
        raise HTTPException(status_code=500, detail=str(e))
