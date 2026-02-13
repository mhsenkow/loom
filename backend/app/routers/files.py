"""
File operations API endpoints for DATA cells
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal

from app.services.file_loader import file_loader, FileReadMode

router = APIRouter()


class SetDataFolderRequest(BaseModel):
    path: str
    create: bool = False


class ReadFileRequest(BaseModel):
    path: str
    mode: FileReadMode = 'auto'
    max_chars: int = 100000


@router.post("/folder")
async def set_data_folder(request: SetDataFolderRequest):
    """Set the data folder path, optionally creating it"""
    success = file_loader.set_data_folder(request.path, create=request.create)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid folder path or could not create folder")
    return {
        "status": "ok",
        "path": file_loader.get_data_folder(),
    }


@router.get("/folder")
async def get_data_folder():
    """Get current data folder path"""
    path = file_loader.get_data_folder()
    return {
        "path": path,
        "configured": path is not None,
    }


@router.get("/list")
async def list_files(subfolder: str = "", extensions: Optional[str] = None):
    """
    List files in the data folder
    extensions: comma-separated list of extensions to filter (e.g., "csv,json,txt")
    """
    if not file_loader.get_data_folder():
        raise HTTPException(status_code=400, detail="Data folder not configured")
    
    ext_list = extensions.split(',') if extensions else None
    files = file_loader.list_files(subfolder, ext_list)
    
    return {
        "folder": file_loader.get_data_folder(),
        "subfolder": subfolder,
        "files": files,
    }


@router.post("/read")
async def read_file(request: ReadFileRequest):
    """Read a file with the specified mode"""
    try:
        result = file_loader.read_file(
            request.path,
            request.mode,
            request.max_chars,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/{file_path:path}")
async def preview_file(file_path: str, lines: int = 20):
    """Quick preview of a file (first N lines)"""
    try:
        result = file_loader.read_file(file_path, 'lines', max_chars=10000)
        content = result['content']
        
        # Limit to N lines
        content_lines = content.split('\n')
        if len(content_lines) > lines:
            content = '\n'.join(content_lines[:lines]) + f'\n... ({len(content_lines)} total lines)'
        
        return {
            'content': content,
            'type': result['type'],
            'path': file_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
class WriteFileRequest(BaseModel):
    path: str
    content: str
    mode: Literal["overwrite", "append"] = "overwrite"


@router.post("/write")
async def write_file(request: WriteFileRequest):
    """Write content to a file"""
    try:
        result = file_loader.write_file(
            request.path,
            request.content,
            request.mode,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
