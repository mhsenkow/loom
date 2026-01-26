"""
Semantic search API endpoints for vector store queries
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os

from app.services.vector_store import VectorStore
from app.services.document_indexer import DocumentIndexer

router = APIRouter()

# Global vector store instance (will be set from main.py)
_vector_store_instance: Optional[VectorStore] = None


def set_vector_store(store: VectorStore):
    """Set the global vector store instance"""
    global _vector_store_instance
    _vector_store_instance = store


def get_vector_store() -> VectorStore:
    """Dependency to get vector store instance"""
    if _vector_store_instance is None:
        raise HTTPException(status_code=500, detail="VectorStore not initialized")
    return _vector_store_instance


class SearchRequest(BaseModel):
    query: str
    n_results: int = 5
    collection: Optional[str] = None
    min_similarity: float = 0.0
    where: Optional[Dict[str, Any]] = None
    rerank: bool = False


class IndexFileRequest(BaseModel):
    file_path: str
    chunk_size: int = 1000
    chunk_overlap: int = 200
    chunk_strategy: str = "sentence"
    metadata: Optional[Dict[str, Any]] = None


class IndexTextRequest(BaseModel):
    text: str
    document_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    collection: str = VectorStore.COLLECTION_FILES
    chunk: bool = True


class IndexDirectoryRequest(BaseModel):
    directory_path: str = ""
    extensions: Optional[List[str]] = None
    recursive: bool = True


@router.post("/search")
async def semantic_search(request: SearchRequest, vector_store: VectorStore = Depends(get_vector_store)):
    """
    Perform semantic search in the vector store
    
    Args:
        request: Search parameters
        vector_store: VectorStore instance (dependency injection)
    
    Returns:
        Search results with similarity scores
    """
    try:
        if request.rerank:
            results = await vector_store.query_with_rerank(
                query_text=request.query,
                n_results=min(request.n_results * 2, 20),
                final_n=request.n_results,
                where=request.where,
                collection_name=request.collection,
            )
        else:
            results = await vector_store.query(
                query_text=request.query,
                n_results=request.n_results,
                where=request.where,
                collection_name=request.collection,
            )
        
        # Filter by minimum similarity
        if request.min_similarity > 0:
            results = [
                r for r in results
                if r.get("similarity") is not None and r.get("similarity", 0) >= request.min_similarity
            ]
        
        return {
            "query": request.query,
            "results": results,
            "count": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def semantic_search_get(
    query: str,
    n_results: int = 5,
    collection: Optional[str] = None,
    min_similarity: float = 0.0,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """GET endpoint for semantic search"""
    
    try:
        results = await vector_store.query(
            query_text=query,
            n_results=n_results,
            collection_name=collection,
        )
        
        # Filter by minimum similarity
        if min_similarity > 0:
            results = [
                r for r in results
                if r.get("similarity") is not None and r.get("similarity", 0) >= min_similarity
            ]
        
        return {
            "query": query,
            "results": results,
            "count": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rag-context")
async def get_rag_context(
    query: str,
    n_results: int = 5,
    collection: Optional[str] = None,
    min_similarity: float = 0.0,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Get formatted context for RAG (Retrieval-Augmented Generation)
    
    Returns:
        Formatted context string ready for LLM prompt
    """
    
    try:
        context = await vector_store.search_for_rag(
            query=query,
            n_results=n_results,
            collection_name=collection,
            min_similarity=min_similarity,
        )
        
        return {
            "query": query,
            "context": context,
            "has_context": len(context) > 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index/file")
async def index_file(
    request: IndexFileRequest,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Index a file into the vector store
    
    Args:
        request: File indexing parameters
        vector_store: VectorStore instance
    
    Returns:
        Indexing result
    """
    
    try:
        indexer = DocumentIndexer(vector_store)
        result = await indexer.index_file(
            file_path=request.file_path,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
            chunk_strategy=request.chunk_strategy,
            metadata=request.metadata,
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Indexing failed"))
        
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index/text")
async def index_text(
    request: IndexTextRequest,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Index raw text content
    
    Args:
        request: Text indexing parameters
        vector_store: VectorStore instance
    
    Returns:
        Indexing result
    """
    
    try:
        indexer = DocumentIndexer(vector_store)
        result = await indexer.index_text(
            text=request.text,
            document_id=request.document_id,
            metadata=request.metadata,
            collection_name=request.collection,
            chunk=request.chunk,
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Indexing failed"))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index/directory")
async def index_directory(
    request: IndexDirectoryRequest,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Index all files in a directory
    
    Args:
        request: Directory indexing parameters
        vector_store: VectorStore instance
    
    Returns:
        Summary of indexing results
    """
    
    try:
        indexer = DocumentIndexer(vector_store)
        result = await indexer.index_directory(
            directory_path=request.directory_path,
            extensions=request.extensions,
            recursive=request.recursive,
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/index/{file_path:path}")
async def delete_indexed_file(
    file_path: str,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Delete indexed file from vector store
    
    Args:
        file_path: Path to the file
        vector_store: VectorStore instance
    
    Returns:
        Deletion result
    """
    
    try:
        import hashlib
        file_id = f"file_{hashlib.md5(os.path.abspath(file_path).encode()).hexdigest()}"
        
        deleted = vector_store.delete_by_metadata(
            where={"document_id": file_id},
            collection_name=VectorStore.COLLECTION_FILES,
        )
        
        return {
            "success": True,
            "file_path": file_path,
            "deleted_chunks": deleted,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats(
    collection: Optional[str] = None,
    vector_store: VectorStore = Depends(get_vector_store),
):
    """
    Get statistics about the vector store
    
    Args:
        collection: Collection name (optional)
        vector_store: VectorStore instance
    
    Returns:
        Statistics including document count
    """
    
    try:
        count = vector_store.count(collection_name=collection)
        
        stats = {
            "connected": vector_store.is_connected(),
            "document_count": count,
            "collection": collection or vector_store.default_collection_name,
        }
        
        # Add collection-specific stats if available
        if collection:
            stats["collection"] = collection
        
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collections")
async def list_collections(vector_store: VectorStore = Depends(get_vector_store)):
    """
    List all available collections
    
    Args:
        vector_store: VectorStore instance
    
    Returns:
        List of collections with counts
    """
    
    try:
        collections = [
            VectorStore.COLLECTION_MODULES,
            VectorStore.COLLECTION_FILES,
            VectorStore.COLLECTION_CONVERSATIONS,
        ]
        
        result = []
        for coll_name in collections:
            count = vector_store.count(collection_name=coll_name)
            result.append({
                "name": coll_name,
                "count": count,
            })
        
        return {
            "collections": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
