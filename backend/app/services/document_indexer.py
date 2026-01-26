"""
Document indexing service for automatic file processing and vector storage
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import hashlib

from app.services.file_loader import file_loader
from app.services.vector_store import VectorStore


class DocumentIndexer:
    """
    Service for indexing documents into the vector store
    Automatically processes files and creates searchable embeddings
    """
    
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store
        self._indexed_files: Dict[str, Dict[str, Any]] = {}  # Track indexed files
    
    def _generate_file_id(self, file_path: str) -> str:
        """Generate a unique ID for a file"""
        # Use hash of absolute path for consistency
        abs_path = os.path.abspath(file_path)
        return f"file_{hashlib.md5(abs_path.encode()).hexdigest()}"
    
    async def index_file(
        self,
        file_path: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        chunk_strategy: str = "sentence",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Index a file into the vector store
        
        Args:
            file_path: Path to the file (relative to data folder or absolute)
            chunk_size: Size of chunks for large files
            chunk_overlap: Overlap between chunks
            chunk_strategy: Chunking strategy
            metadata: Additional metadata
        
        Returns:
            Indexing result with file_id and chunk count
        """
        try:
            # Handle absolute paths directly
            file_path_obj = Path(file_path).expanduser()
            is_absolute = file_path_obj.is_absolute()
            
            if is_absolute:
                # Read absolute path directly
                if not file_path_obj.exists():
                    return {
                        "success": False,
                        "error": f"File not found: {file_path}",
                    }
                if not file_path_obj.is_file():
                    return {
                        "success": False,
                        "error": f"Not a file: {file_path}",
                    }
                
                # Read file content directly
                try:
                    with open(file_path_obj, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    # Try binary mode for non-text files
                    with open(file_path_obj, 'rb') as f:
                        content = f.read().decode('utf-8', errors='replace')
                
                # Determine file type
                ext = file_path_obj.suffix.lower()
                file_type_map = {
                    '.txt': 'text', '.md': 'markdown', '.json': 'json',
                    '.csv': 'csv', '.tsv': 'csv', '.pdf': 'pdf',
                    '.py': 'code', '.js': 'code', '.ts': 'code',
                    '.tsx': 'code', '.jsx': 'code', '.html': 'code',
                    '.css': 'code', '.sql': 'code', '.sh': 'code',
                }
                file_type = file_type_map.get(ext, 'text')
                file_size = file_path_obj.stat().st_size
                
                file_info = {
                    'content': content,
                    'type': file_type,
                    'size': file_size,
                }
            else:
                # Use file_loader for relative paths (requires data folder)
                file_info = file_loader.read_file(file_path, mode='auto')
            
            content = file_info.get('content', '')
            
            if not content:
                return {
                    "success": False,
                    "error": "File is empty or could not be read",
                }
            
            # Generate file ID
            file_id = self._generate_file_id(file_path)
            
            # Prepare metadata
            file_metadata = {
                "source": "file",
                "file_path": file_path,
                "file_type": file_info.get('type', 'unknown'),
                "file_size": file_info.get('size', 0),
                "indexed_at": datetime.now().isoformat(),
                **(metadata or {}),
            }
            
            # Determine if chunking is needed
            needs_chunking = len(content) > chunk_size * 2
            
            if needs_chunking:
                # Chunk and index
                chunk_count = await self.vector_store.add_document_chunked(
                    document_id=file_id,
                    content=content,
                    metadata=file_metadata,
                    collection_name=VectorStore.COLLECTION_FILES,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    chunk_strategy=chunk_strategy,
                )
            else:
                # Index as single document
                success = await self.vector_store.add(
                    document_id=file_id,
                    content=content,
                    metadata=file_metadata,
                    collection_name=VectorStore.COLLECTION_FILES,
                )
                chunk_count = 1 if success else 0
            
            # Track indexed file
            self._indexed_files[file_id] = {
                "file_path": file_path,
                "chunk_count": chunk_count,
                "indexed_at": datetime.now().isoformat(),
            }
            
            return {
                "success": True,
                "file_id": file_id,
                "chunk_count": chunk_count,
                "file_path": file_path,
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }
    
    async def index_text(
        self,
        text: str,
        document_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        collection_name: str = VectorStore.COLLECTION_FILES,
        chunk: bool = True,
    ) -> Dict[str, Any]:
        """
        Index raw text content
        
        Args:
            text: Text content to index
            document_id: Optional document ID (will generate if not provided)
            metadata: Additional metadata
            collection_name: Collection to index into
            chunk: Whether to chunk large texts
        
        Returns:
            Indexing result
        """
        try:
            if not document_id:
                # Generate ID from text hash
                text_hash = hashlib.md5(text.encode()).hexdigest()
                document_id = f"text_{text_hash}"
            
            text_metadata = {
                "source": "text",
                "indexed_at": datetime.now().isoformat(),
                **(metadata or {}),
            }
            
            if chunk and len(text) > 2000:
                chunk_count = await self.vector_store.add_document_chunked(
                    document_id=document_id,
                    content=text,
                    metadata=text_metadata,
                    collection_name=collection_name,
                )
            else:
                success = await self.vector_store.add(
                    document_id=document_id,
                    content=text,
                    metadata=text_metadata,
                    collection_name=collection_name,
                )
                chunk_count = 1 if success else 0
            
            return {
                "success": True,
                "document_id": document_id,
                "chunk_count": chunk_count,
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }
    
    async def reindex_file(self, file_path: str, **kwargs) -> Dict[str, Any]:
        """
        Reindex a file (delete old and index again)
        
        Args:
            file_path: Path to file
            **kwargs: Same as index_file
        
        Returns:
            Indexing result
        """
        file_id = self._generate_file_id(file_path)
        
        # Delete existing chunks
        deleted = self.vector_store.delete_by_metadata(
            where={"document_id": file_id},
            collection_name=VectorStore.COLLECTION_FILES,
        )
        
        # Reindex
        result = await self.index_file(file_path, **kwargs)
        result["deleted_chunks"] = deleted
        
        return result
    
    def get_indexed_files(self) -> List[Dict[str, Any]]:
        """Get list of indexed files"""
        return list(self._indexed_files.values())
    
    def is_indexed(self, file_path: str) -> bool:
        """Check if a file is already indexed"""
        file_id = self._generate_file_id(file_path)
        return file_id in self._indexed_files
    
    async def index_directory(
        self,
        directory_path: str = "",
        extensions: Optional[List[str]] = None,
        recursive: bool = True,
    ) -> Dict[str, Any]:
        """
        Index all files in a directory
        
        Args:
            directory_path: Subdirectory path (empty for root)
            extensions: List of extensions to include (e.g., ['txt', 'md', 'pdf'])
            recursive: Whether to recurse into subdirectories
        
        Returns:
            Summary of indexing results
        """
        files = file_loader.list_files(directory_path, extensions)
        
        results = {
            "total": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "files": [],
        }
        
        for file_info in files:
            if file_info.get('is_dir'):
                if recursive:
                    # Recursively index subdirectory
                    sub_results = await self.index_directory(
                        directory_path=file_info.get('path', ''),
                        extensions=extensions,
                        recursive=True,
                    )
                    results["total"] += sub_results["total"]
                    results["success"] += sub_results["success"]
                    results["failed"] += sub_results["failed"]
                    results["skipped"] += sub_results["skipped"]
                continue
            
            results["total"] += 1
            file_path = file_info.get('path', '')
            
            # Skip if already indexed
            if self.is_indexed(file_path):
                results["skipped"] += 1
                continue
            
            # Index file
            index_result = await self.index_file(file_path)
            
            if index_result.get("success"):
                results["success"] += 1
            else:
                results["failed"] += 1
            
            results["files"].append({
                "path": file_path,
                "success": index_result.get("success", False),
                "chunk_count": index_result.get("chunk_count", 0),
            })
        
        return results
