"""
ChromaDB vector store service for semantic search and memory
"""

import chromadb
from chromadb.config import Settings
from typing import Optional
import os


class VectorStore:
    """
    Vector store for module embeddings and semantic search
    Uses ChromaDB for local persistent storage
    """
    
    def __init__(
        self,
        persist_directory: Optional[str] = None,
        collection_name: str = "loom_modules",
    ):
        self.persist_directory = persist_directory or os.path.join(
            os.path.dirname(__file__), 
            "..", "..", "data", "chromadb"
        )
        self.collection_name = collection_name
        self._client: Optional[chromadb.Client] = None
        self._collection = None
        
        self._initialize()
    
    def _initialize(self):
        """Initialize ChromaDB client and collection"""
        try:
            # Ensure persist directory exists
            os.makedirs(self.persist_directory, exist_ok=True)
            
            # Create persistent client
            self._client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True,
                ),
            )
            
            # Get or create collection
            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "Loom module embeddings"},
            )
            
            print(f"[LOOM] VectorStore initialized: {self.persist_directory}")
            
        except Exception as e:
            print(f"[LOOM] VectorStore initialization error: {e}")
            self._client = None
            self._collection = None
    
    def is_connected(self) -> bool:
        """Check if vector store is connected"""
        return self._client is not None and self._collection is not None
    
    def add(
        self,
        document_id: str,
        content: str,
        embedding: Optional[list[float]] = None,
        metadata: Optional[dict] = None,
    ) -> bool:
        """
        Add a document to the vector store
        
        Args:
            document_id: Unique identifier for the document
            content: Text content of the document
            embedding: Pre-computed embedding (if None, ChromaDB will compute)
            metadata: Additional metadata to store
        """
        if not self.is_connected():
            return False
        
        try:
            add_kwargs = {
                "ids": [document_id],
                "documents": [content],
            }
            
            if embedding:
                add_kwargs["embeddings"] = [embedding]
            
            if metadata:
                add_kwargs["metadatas"] = [metadata]
            
            self._collection.add(**add_kwargs)
            return True
            
        except Exception as e:
            print(f"[LOOM] VectorStore add error: {e}")
            return False
    
    def update(
        self,
        document_id: str,
        content: Optional[str] = None,
        embedding: Optional[list[float]] = None,
        metadata: Optional[dict] = None,
    ) -> bool:
        """Update an existing document"""
        if not self.is_connected():
            return False
        
        try:
            update_kwargs = {"ids": [document_id]}
            
            if content:
                update_kwargs["documents"] = [content]
            
            if embedding:
                update_kwargs["embeddings"] = [embedding]
            
            if metadata:
                update_kwargs["metadatas"] = [metadata]
            
            self._collection.update(**update_kwargs)
            return True
            
        except Exception as e:
            print(f"[LOOM] VectorStore update error: {e}")
            return False
    
    def delete(self, document_id: str) -> bool:
        """Delete a document from the store"""
        if not self.is_connected():
            return False
        
        try:
            self._collection.delete(ids=[document_id])
            return True
        except Exception as e:
            print(f"[LOOM] VectorStore delete error: {e}")
            return False
    
    def query(
        self,
        query_text: Optional[str] = None,
        query_embedding: Optional[list[float]] = None,
        n_results: int = 5,
        where: Optional[dict] = None,
    ) -> list[dict]:
        """
        Query the vector store for similar documents
        
        Args:
            query_text: Text to search for
            query_embedding: Pre-computed embedding to search with
            n_results: Number of results to return
            where: Filter conditions
        """
        if not self.is_connected():
            return []
        
        try:
            query_kwargs = {"n_results": n_results}
            
            if query_text:
                query_kwargs["query_texts"] = [query_text]
            elif query_embedding:
                query_kwargs["query_embeddings"] = [query_embedding]
            else:
                return []
            
            if where:
                query_kwargs["where"] = where
            
            results = self._collection.query(**query_kwargs)
            
            # Format results
            formatted = []
            if results and results.get("ids"):
                for i, doc_id in enumerate(results["ids"][0]):
                    formatted.append({
                        "id": doc_id,
                        "content": results["documents"][0][i] if results.get("documents") else None,
                        "metadata": results["metadatas"][0][i] if results.get("metadatas") else None,
                        "distance": results["distances"][0][i] if results.get("distances") else None,
                    })
            
            return formatted
            
        except Exception as e:
            print(f"[LOOM] VectorStore query error: {e}")
            return []
    
    def get(self, document_id: str) -> Optional[dict]:
        """Get a specific document by ID"""
        if not self.is_connected():
            return None
        
        try:
            result = self._collection.get(ids=[document_id])
            
            if result and result.get("ids"):
                return {
                    "id": result["ids"][0],
                    "content": result["documents"][0] if result.get("documents") else None,
                    "metadata": result["metadatas"][0] if result.get("metadatas") else None,
                }
            
            return None
            
        except Exception as e:
            print(f"[LOOM] VectorStore get error: {e}")
            return None
    
    def count(self) -> int:
        """Get the number of documents in the store"""
        if not self.is_connected():
            return 0
        
        try:
            return self._collection.count()
        except Exception as e:
            print(f"[LOOM] VectorStore count error: {e}")
            return 0
    
    def reset(self) -> bool:
        """Reset the collection (delete all documents)"""
        if not self.is_connected():
            return False
        
        try:
            self._client.delete_collection(self.collection_name)
            self._collection = self._client.create_collection(
                name=self.collection_name,
                metadata={"description": "Loom module embeddings"},
            )
            return True
        except Exception as e:
            print(f"[LOOM] VectorStore reset error: {e}")
            return False
