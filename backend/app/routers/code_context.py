"""
Code Context Router - Folder indexing for code project conversations
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import os
import hashlib
from datetime import datetime

from app.services.vector_store import VectorStore
from app.routers.search import get_vector_store

router = APIRouter()

# Singleton for code context state
_code_context_state = {
    "active": False,
    "folder_path": None,
    "collection_name": "loom_code_context",
    "files_indexed": 0,
}

# Document indexer will be initialized with vector_store dependency


class IndexFolderRequest(BaseModel):
    folder_path: str
    file_patterns: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None
    chunk_size: int = 1000
    chunk_overlap: int = 200
    chunking_strategy: str = "function"  # function, sentence, fixed
    max_file_size: int = 1048576  # 1MB


@router.post("/index-folder")
async def index_folder(
    request: IndexFolderRequest,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Index a folder for code context
    """
    folder_path = Path(request.folder_path).expanduser().resolve()
    
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder not found: {folder_path}")
    
    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {folder_path}")
    
    # Default file patterns for code
    file_patterns = request.file_patterns or ["*.py", "*.ts", "*.js", "*.tsx", "*.jsx", "*.rs", "*.go", "*.java", "*.cpp", "*.c", "*.h"]
    exclude_patterns = request.exclude_patterns or ["node_modules", ".git", "__pycache__", "venv", ".venv", "dist", "build"]
    
    collection_name = _code_context_state["collection_name"]
    
    try:
        # Index files in the folder
        import fnmatch
        files_indexed = 0
        chunks_created = 0
        
        # Walk directory and index matching files
        for root, dirs, files in os.walk(folder_path):
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if not any(fnmatch.fnmatch(d, pattern) for pattern in exclude_patterns)]
            
            for file in files:
                file_path = Path(root) / file
                
                # Check file size
                if file_path.stat().st_size > request.max_file_size:
                    continue
                
                # Check if file matches patterns
                matches_pattern = any(fnmatch.fnmatch(file, pattern) for pattern in file_patterns)
                if not matches_pattern:
                    continue
                
                # Check if excluded
                if any(fnmatch.fnmatch(str(file_path.relative_to(folder_path)), pattern) for pattern in exclude_patterns):
                    continue
                
                # Read file content
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    # Try binary mode for non-text files
                    with open(file_path, 'rb') as f:
                        content = f.read().decode('utf-8', errors='replace')
                
                if not content.strip():
                    continue
                
                # Generate file ID
                file_id = f"code_{hashlib.md5(str(file_path).encode()).hexdigest()}"
                
                # Prepare metadata
                file_metadata = {
                    "source": "code_context",
                    "file_path": str(file_path.relative_to(folder_path)),
                    "full_path": str(file_path),
                    "file_type": file_path.suffix.lower(),
                    "indexed_at": datetime.now().isoformat(),
                }
                
                # Index using vector store directly with custom collection
                needs_chunking = len(content) > request.chunk_size * 2
                
                if needs_chunking:
                    chunk_count = await vector_store.add_document_chunked(
                        document_id=file_id,
                        content=content,
                        metadata=file_metadata,
                        collection_name=collection_name,
                        chunk_size=request.chunk_size,
                        chunk_overlap=request.chunk_overlap,
                        chunk_strategy=request.chunking_strategy,
                    )
                else:
                    success = await vector_store.add(
                        document_id=file_id,
                        content=content,
                        metadata=file_metadata,
                        collection_name=collection_name,
                    )
                    chunk_count = 1 if success else 0
                
                if chunk_count > 0:
                    files_indexed += 1
                    chunks_created += chunk_count
        
        # Update state
        _code_context_state["active"] = True
        _code_context_state["folder_path"] = str(folder_path)
        _code_context_state["files_indexed"] = files_indexed
        
        return {
            "success": True,
            "folder_path": str(folder_path),
            "files_indexed": files_indexed,
            "chunks_created": chunks_created,
            "collection": collection_name,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")


@router.get("/status")
async def get_status():
    """
    Get current code context status
    """
    return {
        "active": _code_context_state["active"],
        "folder_path": _code_context_state["folder_path"],
        "files_indexed": _code_context_state["files_indexed"],
        "collection": _code_context_state["collection_name"],
    }


@router.delete("/clear")
async def clear_context(
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Clear indexed code context
    """
    try:
        collection_name = _code_context_state["collection_name"]
        if vector_store.is_connected():
            # Reset the collection (delete all documents)
            vector_store.reset(collection_name=collection_name)
        
        # Reset state
        _code_context_state["active"] = False
        _code_context_state["folder_path"] = None
        _code_context_state["files_indexed"] = 0
        
        return {"success": True, "message": "Code context cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear context: {str(e)}")


@router.get("/files")
async def list_indexed_files(
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    List indexed files (metadata from vector store)
    """
    # This would require querying the vector store for metadata
    # For now, return basic info
    return {
        "files": [],
        "count": _code_context_state["files_indexed"],
    }
