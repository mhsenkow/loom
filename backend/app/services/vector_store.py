"""
ChromaDB vector store service for semantic search and memory
Enhanced with embedding generation, text chunking, and RAG support
"""

import chromadb
from chromadb.config import Settings
from typing import Optional, List, Dict, Any, Literal
import os
import re
import asyncio
from datetime import datetime
import hashlib


class TextChunker:
    """
    Smart text chunking for document processing
    Supports multiple chunking strategies
    """
    
    @staticmethod
    def chunk_text(
        text: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        strategy: Literal["fixed", "sentence", "paragraph"] = "sentence",
    ) -> List[Dict[str, Any]]:
        """
        Chunk text into smaller pieces for embedding
        
        Args:
            text: Text to chunk
            chunk_size: Target size of each chunk (characters)
            chunk_overlap: Overlap between chunks (characters)
            strategy: Chunking strategy
        
        Returns:
            List of chunks with metadata
        """
        if strategy == "fixed":
            return TextChunker._chunk_fixed(text, chunk_size, chunk_overlap)
        elif strategy == "sentence":
            return TextChunker._chunk_sentence(text, chunk_size, chunk_overlap)
        elif strategy == "paragraph":
            return TextChunker._chunk_paragraph(text, chunk_size, chunk_overlap)
        else:
            return TextChunker._chunk_fixed(text, chunk_size, chunk_overlap)
    
    @staticmethod
    def _chunk_fixed(text: str, chunk_size: int, overlap: int) -> List[Dict[str, Any]]:
        """Fixed-size chunking"""
        chunks = []
        start = 0
        chunk_num = 0
        
        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]
            
            chunks.append({
                "text": chunk_text,
                "chunk_index": chunk_num,
                "start": start,
                "end": min(end, len(text)),
            })
            
            start = end - overlap
            chunk_num += 1
        
        return chunks
    
    @staticmethod
    def _chunk_sentence(text: str, chunk_size: int, overlap: int) -> List[Dict[str, Any]]:
        """Sentence-aware chunking"""
        # Split by sentence endings
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks = []
        current_chunk = []
        current_size = 0
        chunk_num = 0
        start_pos = 0
        
        for sentence in sentences:
            sentence_size = len(sentence)
            
            if current_size + sentence_size > chunk_size and current_chunk:
                # Save current chunk
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "chunk_index": chunk_num,
                    "start": start_pos,
                    "end": start_pos + len(chunk_text),
                })
                
                # Start new chunk with overlap
                overlap_text = chunk_text[-overlap:] if len(chunk_text) > overlap else chunk_text
                current_chunk = [overlap_text, sentence] if overlap_text else [sentence]
                current_size = len(' '.join(current_chunk))
                start_pos = start_pos + len(chunk_text) - len(overlap_text) if overlap_text else start_pos + len(chunk_text)
                chunk_num += 1
            else:
                current_chunk.append(sentence)
                current_size += sentence_size + 1  # +1 for space
        
        # Add final chunk
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            chunks.append({
                "text": chunk_text,
                "chunk_index": chunk_num,
                "start": start_pos,
                "end": start_pos + len(chunk_text),
            })
        
        return chunks
    
    @staticmethod
    def _chunk_paragraph(text: str, chunk_size: int, overlap: int) -> List[Dict[str, Any]]:
        """Paragraph-aware chunking"""
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = []
        current_size = 0
        chunk_num = 0
        start_pos = 0
        
        for para in paragraphs:
            para_size = len(para)
            
            if current_size + para_size > chunk_size and current_chunk:
                chunk_text = '\n\n'.join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "chunk_index": chunk_num,
                    "start": start_pos,
                    "end": start_pos + len(chunk_text),
                })
                
                # Overlap handling
                overlap_text = chunk_text[-overlap:] if len(chunk_text) > overlap else chunk_text
                current_chunk = [overlap_text, para] if overlap_text else [para]
                current_size = len('\n\n'.join(current_chunk))
                start_pos = start_pos + len(chunk_text) - len(overlap_text) if overlap_text else start_pos + len(chunk_text)
                chunk_num += 1
            else:
                current_chunk.append(para)
                current_size += para_size + 2  # +2 for \n\n
        
        if current_chunk:
            chunk_text = '\n\n'.join(current_chunk)
            chunks.append({
                "text": chunk_text,
                "chunk_index": chunk_num,
                "start": start_pos,
                "end": start_pos + len(chunk_text),
            })
        
        return chunks


class VectorStore:
    """
    Enhanced vector store for semantic search and memory
    Uses ChromaDB for local persistent storage with Ollama embeddings
    """
    
    # Collection names for different content types
    COLLECTION_MODULES = "loom_modules"
    COLLECTION_FILES = "loom_files"
    COLLECTION_CONVERSATIONS = "loom_conversations"
    
    def __init__(
        self,
        persist_directory: Optional[str] = None,
        default_collection: str = COLLECTION_MODULES,
        embedding_model: str = "nomic-embed-text",
    ):
        self.persist_directory = persist_directory or os.path.join(
            os.path.dirname(__file__), 
            "..", "..", "data", "chromadb"
        )
        self.default_collection_name = default_collection
        self.embedding_model = embedding_model
        self._client: Optional[chromadb.Client] = None
        self._collections: Dict[str, Any] = {}
        self._ollama_client = None  # Will be set via set_ollama_client
        
        self._initialize()
    
    def set_ollama_client(self, ollama_client):
        """Set the Ollama client for embedding generation"""
        self._ollama_client = ollama_client
    
    def _initialize(self):
        """Initialize ChromaDB client and collections"""
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
            
            # Initialize default collection
            self._get_collection(self.default_collection_name)
            
            print(f"[LOOM] VectorStore initialized: {self.persist_directory}")
            
        except Exception as e:
            print(f"[LOOM] VectorStore initialization error: {e}")
            self._client = None
            self._collections = {}
    
    def _get_collection(self, collection_name: str):
        """Get or create a collection"""
        if not self._client:
            return None
        
        if collection_name not in self._collections:
            self._collections[collection_name] = self._client.get_or_create_collection(
                name=collection_name,
                metadata={"description": f"Loom {collection_name} embeddings"},
            )
        
        return self._collections[collection_name]
    
    def is_connected(self) -> bool:
        """Check if vector store is connected"""
        return self._client is not None
    
    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for text using Ollama
        
        Args:
            text: Text to embed
        
        Returns:
            Embedding vector or None if generation fails
        """
        if not self._ollama_client:
            print("[LOOM] generate_embedding: No Ollama client available")
            return None
        
        if not text or not text.strip():
            print("[LOOM] generate_embedding: Empty text provided")
            return None
        
        try:
            # Use async embed method if available, otherwise run sync
            if hasattr(self._ollama_client, 'embed'):
                print(f"[LOOM] Generating embedding using model: {self.embedding_model}")
                embedding = await self._ollama_client.embed(text, self.embedding_model)
                if embedding and len(embedding) > 0:
                    print(f"[LOOM] Successfully generated embedding of length: {len(embedding)}")
                    return embedding
                else:
                    print("[LOOM] Embedding generation returned empty result")
                    return None
            else:
                print("[LOOM] Ollama client does not have embed method")
                return None
        except Exception as e:
            print(f"[LOOM] Embedding generation error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    async def add(
        self,
        document_id: str,
        content: str,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        collection_name: Optional[str] = None,
        generate_embedding: bool = True,
    ) -> bool:
        """
        Add a document to the vector store
        
        Args:
            document_id: Unique identifier for the document
            content: Text content of the document
            embedding: Pre-computed embedding (if None, will generate or use ChromaDB default)
            metadata: Additional metadata to store
            collection_name: Collection to add to (defaults to default_collection)
            generate_embedding: If True and embedding is None, generate using Ollama
        
        Returns:
            True if successful, False otherwise
        """
        if not self.is_connected():
            return False
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return False
        
        try:
            # Generate embedding if needed - CRITICAL for semantic search
            if embedding is None and generate_embedding:
                if not self._ollama_client:
                    print(f"[LOOM] VectorStore add: No Ollama client available, cannot generate embedding for {document_id}")
                    # Still add without embedding, but warn
                    print("[LOOM] WARNING: Document added without embedding - semantic search may not work")
                else:
                    print(f"[LOOM] Generating embedding for document: {document_id}")
                    embedding = await self.generate_embedding(content)
                    if not embedding:
                        print(f"[LOOM] WARNING: Failed to generate embedding for {document_id} - document added without embedding")
            
            # Prepare metadata with defaults
            final_metadata = {
                "created_at": datetime.now().isoformat(),
                **(metadata or {}),
            }
            
            add_kwargs = {
                "ids": [document_id],
                "documents": [content],
                "metadatas": [final_metadata],
            }
            
            if embedding:
                add_kwargs["embeddings"] = [embedding]
                print(f"[LOOM] Adding document {document_id} with embedding")
            else:
                print(f"[LOOM] Adding document {document_id} without embedding (text search only)")
            
            collection.add(**add_kwargs)
            return True
            
        except Exception as e:
            print(f"[LOOM] VectorStore add error: {e}")
            return False
    
    async def add_document_chunked(
        self,
        document_id: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        collection_name: Optional[str] = None,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        chunk_strategy: Literal["fixed", "sentence", "paragraph"] = "sentence",
    ) -> int:
        """
        Add a document with automatic chunking
        
        Args:
            document_id: Base ID for the document (chunks will have _chunk_N suffix)
            content: Full document content
            metadata: Base metadata (will be added to each chunk)
            collection_name: Collection to add to
            chunk_size: Target chunk size
            chunk_overlap: Overlap between chunks
            chunk_strategy: Chunking strategy
        
        Returns:
            Number of chunks added
        """
        chunks = TextChunker.chunk_text(content, chunk_size, chunk_overlap, chunk_strategy)
        
        # Add each chunk
        for chunk in chunks:
            chunk_id = f"{document_id}_chunk_{chunk['chunk_index']}"
            chunk_metadata = {
                **(metadata or {}),
                "chunk_index": chunk['chunk_index'],
                "chunk_start": chunk['start'],
                "chunk_end": chunk['end'],
                "total_chunks": len(chunks),
                "document_id": document_id,
            }
            
            await self.add(
                chunk_id,
                chunk['text'],
                metadata=chunk_metadata,
                collection_name=collection_name,
            )
        
        return len(chunks)
    
    async def add_batch(
        self,
        documents: List[Dict[str, Any]],
        collection_name: Optional[str] = None,
        generate_embeddings: bool = True,
    ) -> int:
        """
        Add multiple documents in batch
        
        Args:
            documents: List of dicts with keys: id, content, metadata (optional), embedding (optional)
            collection_name: Collection to add to
            generate_embeddings: Whether to generate embeddings for documents without them
        
        Returns:
            Number of documents successfully added
        """
        if not self.is_connected():
            return 0
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return 0
        
        try:
            ids = []
            contents = []
            embeddings = []
            metadatas = []
            
            # Prepare batch
            for doc in documents:
                doc_id = doc.get('id')
                content = doc.get('content', '')
                embedding = doc.get('embedding')
                metadata = doc.get('metadata', {})
                
                if not doc_id or not content:
                    continue
                
                ids.append(doc_id)
                contents.append(content)
                
                # Generate embedding if needed
                if embedding is None and generate_embeddings and self._ollama_client:
                    embedding = await self.generate_embedding(content)
                
                if embedding:
                    embeddings.append(embedding)
                
                final_metadata = {
                    "created_at": datetime.now().isoformat(),
                    **metadata,
                }
                metadatas.append(final_metadata)
            
            if not ids:
                return 0
            
            # Add batch
            add_kwargs = {
                "ids": ids,
                "documents": contents,
                "metadatas": metadatas,
            }
            
            if embeddings and len(embeddings) == len(ids):
                add_kwargs["embeddings"] = embeddings
            
            collection.add(**add_kwargs)
            return len(ids)
            
        except Exception as e:
            print(f"[LOOM] VectorStore batch add error: {e}")
            return 0
    
    def update(
        self,
        document_id: str,
        content: Optional[str] = None,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        collection_name: Optional[str] = None,
    ) -> bool:
        """Update an existing document"""
        if not self.is_connected():
            return False
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return False
        
        try:
            update_kwargs = {"ids": [document_id]}
            
            if content:
                update_kwargs["documents"] = [content]
            
            if embedding:
                update_kwargs["embeddings"] = [embedding]
            
            if metadata:
                # Merge with existing metadata
                existing = self.get(document_id, collection_name)
                if existing and existing.get('metadata'):
                    metadata = {**existing['metadata'], **metadata}
                update_kwargs["metadatas"] = [metadata]
            
            collection.update(**update_kwargs)
            return True
            
        except Exception as e:
            print(f"[LOOM] VectorStore update error: {e}")
            return False
    
    def delete(self, document_id: str, collection_name: Optional[str] = None) -> bool:
        """Delete a document from the store"""
        if not self.is_connected():
            return False
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return False
        
        try:
            collection.delete(ids=[document_id])
            return True
        except Exception as e:
            print(f"[LOOM] VectorStore delete error: {e}")
            return False
    
    def delete_by_metadata(
        self,
        where: Dict[str, Any],
        collection_name: Optional[str] = None,
    ) -> int:
        """
        Delete documents matching metadata filter
        
        Args:
            where: Metadata filter conditions
            collection_name: Collection to delete from
        
        Returns:
            Number of documents deleted
        """
        if not self.is_connected():
            return 0
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return 0
        
        try:
            # Get matching IDs first
            results = collection.get(where=where)
            if not results or not results.get("ids"):
                return 0
            
            ids_to_delete = results["ids"]
            collection.delete(ids=ids_to_delete)
            return len(ids_to_delete)
        except Exception as e:
            print(f"[LOOM] VectorStore delete_by_metadata error: {e}")
            return 0
    
    async def query(
        self,
        query_text: Optional[str] = None,
        query_embedding: Optional[List[float]] = None,
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None,
        collection_name: Optional[str] = None,
        generate_embedding: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Query the vector store for similar documents
        
        Args:
            query_text: Text to search for
            query_embedding: Pre-computed embedding to search with
            n_results: Number of results to return
            where: Filter conditions for metadata
            collection_name: Collection to query
            generate_embedding: If True and query_embedding is None, generate from query_text
        
        Returns:
            List of matching documents with scores
        """
        if not self.is_connected():
            print("[LOOM] VectorStore query: Not connected")
            return []
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            print("[LOOM] VectorStore query: Collection not found")
            return []
        
        try:
            query_kwargs = {"n_results": n_results}
            
            # Generate embedding if needed - this is critical for semantic search
            if query_text and not query_embedding and generate_embedding:
                if not self._ollama_client:
                    print("[LOOM] VectorStore query: No Ollama client available for embedding generation")
                    return []
                
                print(f"[LOOM] Generating embedding for query: {query_text[:50]}...")
                query_embedding = await self.generate_embedding(query_text)
                
                if not query_embedding:
                    print("[LOOM] VectorStore query: Failed to generate embedding")
                    return []
                
                print(f"[LOOM] Generated embedding of length: {len(query_embedding)}")
            
            if query_embedding:
                query_kwargs["query_embeddings"] = [query_embedding]
            elif query_text:
                # Fallback to text search if no embedding (less effective)
                print("[LOOM] VectorStore query: Using text search fallback (no embedding)")
                query_kwargs["query_texts"] = [query_text]
            else:
                print("[LOOM] VectorStore query: No query text or embedding provided")
                return []
            
            if where:
                query_kwargs["where"] = where
            
            # Check collection count
            collection_count = collection.count()
            print(f"[LOOM] Querying collection '{collection_name or self.default_collection_name}' with {collection_count} documents")
            
            if collection_count == 0:
                print("[LOOM] VectorStore query: Collection is empty, no results possible")
                return []
            
            results = collection.query(**query_kwargs)
            
            # Format results with similarity scores
            formatted = []
            if results and results.get("ids") and len(results["ids"]) > 0 and len(results["ids"][0]) > 0:
                print(f"[LOOM] Found {len(results['ids'][0])} results")
                for i, doc_id in enumerate(results["ids"][0]):
                    distance = results["distances"][0][i] if results.get("distances") and len(results["distances"]) > 0 and len(results["distances"][0]) > i else None
                    # Convert distance to similarity score (1 - normalized distance)
                    similarity = 1.0 - distance if distance is not None else None
                    
                    content = results["documents"][0][i] if results.get("documents") and len(results["documents"]) > 0 and len(results["documents"][0]) > i else None
                    metadata = results["metadatas"][0][i] if results.get("metadatas") and len(results["metadatas"]) > 0 and len(results["metadatas"][0]) > i else None
                    
                    formatted.append({
                        "id": doc_id,
                        "content": content,
                        "metadata": metadata or {},
                        "distance": distance,
                        "similarity": similarity,
                    })
            else:
                print("[LOOM] VectorStore query: No results returned from ChromaDB")
            
            return formatted
            
        except Exception as e:
            print(f"[LOOM] VectorStore query error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def query_with_rerank(
        self,
        query_text: str,
        n_results: int = 10,
        final_n: int = 5,
        where: Optional[Dict[str, Any]] = None,
        collection_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Query and rerank results using keyword matching
        
        Args:
            query_text: Text to search for
            n_results: Initial number of results to fetch
            final_n: Final number of results after reranking
            where: Metadata filter
            collection_name: Collection to query
        
        Returns:
            Reranked results
        """
        # Get initial results
        results = await self.query(
            query_text=query_text,
            n_results=n_results,
            where=where,
            collection_name=collection_name,
        )
        
        if not results:
            return []
        
        # Simple keyword-based reranking
        query_keywords = set(query_text.lower().split())
        
        def rerank_score(result: Dict[str, Any]) -> float:
            content = (result.get("content") or "").lower()
            similarity = result.get("similarity", 0.0) or 0.0
            
            # Count keyword matches
            keyword_matches = sum(1 for keyword in query_keywords if keyword in content)
            keyword_score = keyword_matches / len(query_keywords) if query_keywords else 0
            
            # Combine semantic similarity with keyword matching
            combined_score = (similarity * 0.7) + (keyword_score * 0.3)
            
            return combined_score
        
        # Sort by combined score
        results.sort(key=rerank_score, reverse=True)
        
        return results[:final_n]
    
    def get(self, document_id: str, collection_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get a specific document by ID"""
        if not self.is_connected():
            return None
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return None
        
        try:
            result = collection.get(ids=[document_id])
            
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
    
    def get_all_chunks(self, document_id: str, collection_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all chunks for a document
        
        Args:
            document_id: Base document ID
            collection_name: Collection to query
        
        Returns:
            List of chunks sorted by chunk_index
        """
        results = self._get_collection(collection_name or self.default_collection_name).get(
            where={"document_id": document_id}
        )
        
        if not results or not results.get("ids"):
            return []
        
        chunks = []
        for i, doc_id in enumerate(results["ids"]):
            chunks.append({
                "id": doc_id,
                "content": results["documents"][i] if results.get("documents") else None,
                "metadata": results["metadatas"][i] if results.get("metadatas") else None,
            })
        
        # Sort by chunk_index
        chunks.sort(key=lambda x: x.get("metadata", {}).get("chunk_index", 0))
        
        return chunks
    
    def count(self, collection_name: Optional[str] = None) -> int:
        """Get the number of documents in the store"""
        if not self.is_connected():
            return 0
        
        collection = self._get_collection(collection_name or self.default_collection_name)
        if not collection:
            return 0
        
        try:
            return collection.count()
        except Exception as e:
            print(f"[LOOM] VectorStore count error: {e}")
            return 0
    
    def reset(self, collection_name: Optional[str] = None) -> bool:
        """Reset a collection (delete all documents)"""
        if not self.is_connected():
            return False
        
        target_collection = collection_name or self.default_collection_name
        
        try:
            self._client.delete_collection(target_collection)
            self._collections.pop(target_collection, None)
            self._get_collection(target_collection)
            return True
        except Exception as e:
            print(f"[LOOM] VectorStore reset error: {e}")
            return False
    
    async def search_for_rag(
        self,
        query: str,
        n_results: int = 5,
        collection_name: Optional[str] = None,
        min_similarity: float = 0.0,
    ) -> str:
        """
        Search and format results for RAG (Retrieval-Augmented Generation)
        
        Args:
            query: Search query
            n_results: Number of results to retrieve
            collection_name: Collection to search
            min_similarity: Minimum similarity threshold
        
        Returns:
            Formatted context string for RAG
        """
        results = await self.query(
            query_text=query,
            n_results=n_results,
            collection_name=collection_name,
        )
        
        # Filter by similarity threshold
        filtered = [
            r for r in results
            if r.get("similarity") is not None and r.get("similarity", 0) >= min_similarity
        ]
        
        if not filtered:
            return ""
        
        # Format as context
        context_parts = []
        for i, result in enumerate(filtered, 1):
            content = result.get("content", "")
            metadata = result.get("metadata", {})
            similarity = result.get("similarity", 0)
            
            source = metadata.get("source", metadata.get("document_id", "Unknown"))
            context_parts.append(
                f"[Source {i}: {source} (similarity: {similarity:.2f})]\n{content}\n"
            )
        
        return "\n---\n".join(context_parts)
