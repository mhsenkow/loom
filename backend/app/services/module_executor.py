"""
Backend executor for circuit board modules.
Runs: data_input, log_entry, ai_processor, script_execution, data_loader, image_gen, vector_index, vector_search.
"""

from typing import Any, Optional

from app.services.ollama_client import OllamaClient
from app.services.file_loader import file_loader, FileReadMode
from app.services.local_image_gen import local_image_gen
from app.services.document_indexer import DocumentIndexer
from app.services.vector_store import VectorStore


def _input_str(inputs: dict[str, Any]) -> str:
    v = inputs.get("input") or inputs.get("default") or ""
    return str(v) if v is not None else ""


async def run_module(
    module_type: str,
    content: str,
    inputs: dict[str, Any],
    *,
    ollama: OllamaClient,
    model: Optional[str] = None,
    vector_store: Optional[VectorStore] = None,
) -> str:
    """
    Execute a single module and return its output string.
    Raises on error.
    """
    model = model or "llama3.1:8b"
    inp = _input_str(inputs)

    if module_type == "data_input":
        return content or inp

    if module_type == "log_entry":
        return inp

    if module_type == "ai_processor":
        prompt = f"{content}\n\n---\n\n{inp}" if content.strip() else inp
        return await ollama.chat(prompt, model=model)

    if module_type == "script_execution":
        if "{{input}}" in content:
            return content.replace("{{input}}", inp)
        return content or inp

    if module_type == "data_loader":
        path = (content or "").strip()
        if not path:
            raise ValueError("No file path specified")
        mode: FileReadMode = "auto"
        max_chars = 100_000
        try:
            result = file_loader.read_file(path, mode, max_chars)
            return result.get("content", "")
        except FileNotFoundError as e:
            raise ValueError(str(e))
        except Exception as e:
            raise RuntimeError(f"File load error: {e}")

    if module_type == "image_gen":
        prompt = inp or content or "an image"
        neg = content if inp and content else ""
        try:
            result = await local_image_gen.generate(
                prompt=prompt,
                model=model or "sdxl",
                negative_prompt=neg,
                width=1024,
                height=1024,
                steps=30,
            )
            return result.get("image", "")
        except Exception as e:
            raise RuntimeError(f"Image generation failed: {e}")

    if module_type == "vector_index":
        # Index a file into the vector store
        # Content should be file path, or use input if provided
        file_path = (inp or content or "").strip()
        if not file_path:
            raise ValueError("No file path specified. Enter a file path in the cell content or connect from previous cell.")
        
        if not vector_store:
            raise RuntimeError("Vector store not available")
        
        try:
            indexer = DocumentIndexer(vector_store)
            result = await indexer.index_file(
                file_path=file_path,
                chunk_strategy="sentence",
            )
            
            if result.get("success"):
                chunk_count = result.get("chunk_count", 0)
                file_id = result.get("file_id", "")
                return f"✅ Indexed '{file_path}'\n📄 {chunk_count} chunks created\n🆔 ID: {file_id}"
            else:
                error = result.get("error", "Unknown error")
                raise RuntimeError(f"Indexing failed: {error}")
        except FileNotFoundError as e:
            raise ValueError(f"File not found: {file_path}")
        except Exception as e:
            raise RuntimeError(f"Vector indexing failed: {e}")

    if module_type == "vector_search":
        # Search the vector store
        # Content should be search query, or use input if provided
        query = (inp or content or "").strip()
        if not query:
            raise ValueError("No search query specified. Enter a query in the cell content or connect from previous cell.")
        
        if not vector_store:
            raise RuntimeError("Vector store not available")
        
        if not vector_store.is_connected():
            raise RuntimeError("Vector store is not connected")
        
        try:
            # Get number of results from inputs or default to 5
            n_results = inputs.get("n_results", 5)
            if isinstance(n_results, str):
                try:
                    n_results = int(n_results)
                except:
                    n_results = 5
            
            # Use the FILES collection by default for file-based searches
            collection = inputs.get("collection") or VectorStore.COLLECTION_FILES
            
            print(f"[LOOM] Vector search: query='{query[:50]}...', n_results={n_results}, collection={collection}")
            
            results = await vector_store.query(
                query_text=query,
                n_results=n_results,
                collection_name=collection,
            )
            
            print(f"[LOOM] Vector search returned {len(results)} results")
            
            if not results:
                return f"🔍 No results found for: '{query}'\n\nMake sure you have indexed some documents first using the INDEX cell."
            
            # Format results nicely
            output_lines = [f"🔍 Found {len(results)} results for: '{query}'\n"]
            
            for i, result in enumerate(results, 1):
                similarity = result.get("similarity", 0) or 0
                content_preview = (result.get("content") or "")[:200]
                metadata = result.get("metadata", {})
                source = metadata.get("file_path") or metadata.get("source", "unknown")
                
                output_lines.append(f"\n[{i}] Similarity: {similarity:.2%}")
                output_lines.append(f"📄 Source: {source}")
                output_lines.append(f"💬 Preview: {content_preview}...")
            
            # Also include full content for RAG context
            full_context = "\n\n---\n\n".join([
                f"[{i+1}] {r.get('content', '')}" 
                for i, r in enumerate(results)
            ])
            
            return "\n".join(output_lines) + "\n\n---\n\n" + full_context
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Vector search failed: {e}")

    # markdown, conditional, web_fetch, etc. – pass-through
    return inp
