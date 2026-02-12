"""
Backend executor for circuit board modules.
Runs: data_input, log_entry, ai_processor, script_execution, data_loader, image_gen, vector_index, vector_search,
qdc_upload, qdc_run, qdc_status, qdc_results.
"""

import logging
from typing import Any, Optional

from app.services.ollama_client import OllamaClient
from app.services.file_loader import file_loader, FileReadMode
from app.services.local_image_gen import local_image_gen
from app.services.document_indexer import DocumentIndexer
from app.services.vector_store import VectorStore
from app.services.qdc_service import qdc_service

logger = logging.getLogger("loom.module_executor")


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
    provider_manager: Any = None,
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
        # Support {{input}} placeholder for explicit input insertion
        if content and "{{input}}" in content:
            prompt = content.replace("{{input}}", inp)
        elif content.strip():
            prompt = f"{content}\n\n---\n\n{inp}"
        else:
            prompt = inp
        # Route through provider_manager (handles cloud models) or fall back to Ollama
        if provider_manager is not None:
            return await provider_manager.chat(prompt, model)
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
            
            logger.debug(
                "vector_search_started query_preview=%s n_results=%s collection=%s",
                query[:80],
                n_results,
                collection,
            )
            
            results = await vector_store.query(
                query_text=query,
                n_results=n_results,
                collection_name=collection,
            )
            
            logger.debug("vector_search_completed result_count=%s", len(results))
            
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
            logger.exception("vector_search_failed query_preview=%s", query[:80])
            raise RuntimeError(f"Vector search failed: {e}")

    if module_type == "qdc_upload":
        artifact_path = (inp or content or "").strip()
        if not artifact_path:
            raise ValueError("No artifact path specified for QDC upload")
        artifact = await qdc_service.upload_artifact(artifact_path)
        return (
            f"📡 QDC artifact uploaded\n"
            f"ID: {artifact['id']}\n"
            f"Path: {artifact['path']}\n"
            f"Size: {artifact['size_bytes']} bytes"
        )

    if module_type == "qdc_run":
        if content and "{{input}}" in content:
            prompt = content.replace("{{input}}", inp)
        elif content.strip():
            prompt = f"{content}\n\n---\n\n{inp}" if inp else content
        else:
            prompt = inp
        if not prompt.strip():
            raise ValueError("No prompt specified for QDC run")

        artifact_id = str(inputs.get("artifact_id") or "").strip() or None
        artifact_path = str(inputs.get("artifact_path") or "").strip() or None
        target = str(inputs.get("target") or "auto").strip() or "auto"
        priority = str(inputs.get("priority") or "normal").strip() or "normal"
        sid = str(inputs.get("sid") or "").strip() or None

        job = await qdc_service.create_job(
            prompt=prompt,
            artifact_id=artifact_id,
            artifact_path=artifact_path,
            target=target,
            priority=priority,
            sid=sid,
        )

        wait_for_completion = bool(inputs.get("wait_for_completion", False))
        if wait_for_completion:
            timeout_s_raw = inputs.get("timeout_s", 240)
            try:
                timeout_s = float(timeout_s_raw)
            except (TypeError, ValueError):
                timeout_s = 240.0
            final = await qdc_service.wait_for_job(job["id"], timeout_s=max(1.0, timeout_s))
            return (
                f"📡 QDC job completed\n"
                f"ID: {final['id']}\n"
                f"Status: {final['status']}\n"
                f"Result: {final.get('result', {}).get('summary', 'n/a')}"
            )

        return (
            f"📡 QDC job started\n"
            f"ID: {job['id']}\n"
            f"Status: {job['status']}\n"
            f"Track with qdc_status/qdc_results."
        )

    if module_type == "qdc_status":
        job_id = (inp or content or "").strip()
        if not job_id:
            raise ValueError("No QDC job id specified")
        job = qdc_service.get_job(job_id)
        if not job:
            raise ValueError(f"QDC job not found: {job_id}")
        return (
            f"📡 QDC job status\n"
            f"ID: {job['id']}\n"
            f"Status: {job['status']}\n"
            f"Target: {job['target']}\n"
            f"Updated: {job['updated_at']}"
        )

    if module_type == "qdc_results":
        job_id = (inp or content or "").strip()
        if not job_id:
            raise ValueError("No QDC job id specified")
        result = qdc_service.get_job_result(job_id)
        if not result:
            return f"📡 QDC job {job_id} has no results yet."
        summary = str(result.get("summary") or "")
        return (
            f"📡 QDC job result\n"
            f"ID: {job_id}\n"
            f"{summary}"
        )

    # markdown, conditional, web_fetch, etc. – pass-through
    return inp
