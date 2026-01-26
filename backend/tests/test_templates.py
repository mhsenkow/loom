"""
Unit tests for template execution.

Tests each template to ensure it works with basic models and dependencies.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any, Dict, List, Optional

from app.services.module_executor import run_module
from app.services.ollama_client import OllamaClient
from app.services.vector_store import VectorStore


# Mock template structure matching the frontend
class TemplateCell:
    """Represents a single cell in a template."""
    def __init__(
        self,
        type: str,
        label: str,
        content: str = "",
        model_slot: str = "A",
        input_mode: str = "previous",
        read_mode: Optional[str] = None,
        condition_type: Optional[str] = None,
        condition_value: Optional[str] = None,
        on_pass: Optional[str] = None,
        on_fail: Optional[str] = None,
        loop_back_to: Optional[int] = None,
        loop_back_max: Optional[int] = None,
        fetch_method: Optional[str] = None,
        fetch_headers: Optional[str] = None,
        fetch_body: Optional[str] = None,
    ):
        self.type = type
        self.label = label
        self.content = content
        self.model_slot = model_slot
        self.input_mode = input_mode
        self.read_mode = read_mode
        self.condition_type = condition_type
        self.condition_value = condition_value
        self.on_pass = on_pass
        self.on_fail = on_fail
        self.loop_back_to = loop_back_to
        self.loop_back_max = loop_back_max
        self.fetch_method = fetch_method
        self.fetch_headers = fetch_headers
        self.fetch_body = fetch_body


class Template:
    """Represents a complete template."""
    def __init__(self, id: str, name: str, cells: List[TemplateCell]):
        self.id = id
        self.name = name
        self.cells = cells


# Template definitions (extracted from frontend)
TEMPLATES = [
    # Simple thinking template
    Template("steelman", "Steel Man", [
        TemplateCell("data_input", "CLAIM", "Should I quit my job to start a company?"),
        TemplateCell("ai_processor", "FOR", "Strongest argument FOR. Best evidence, most charitable interpretation. Make it compelling.", "A", "previous"),
        TemplateCell("ai_processor", "AGAINST", "Strongest argument AGAINST. Real risks, what could go wrong. Be harsh.", "B", "previous"),
        TemplateCell("ai_processor", "VERDICT", "Read both arguments above. Weigh them. What's the honest answer? What would change it?", "B", "all"),
        TemplateCell("log_entry", "DECISION", input_mode="previous"),
    ]),
    
    # Simple writing template
    Template("memo", "One-Pager", [
        TemplateCell("data_input", "TOPIC", "Proposal to switch from Slack to Discord for company chat"),
        TemplateCell("ai_processor", "DRAFT", "Write a one-page memo: CONTEXT (why now), PROBLEM (what's broken), SOLUTION (what to do), TRADEOFFS (costs), ASK (decision needed).", "A", "previous"),
        TemplateCell("ai_processor", "EDIT", "Cut it in half. Remove weasel words. Make every sentence earn its place. Target ~300 words.", "B", "previous"),
        TemplateCell("log_entry", "MEMO", input_mode="previous"),
    ]),
    
    # Template with conditional
    Template("five-whys-root-gate", "Five Whys (Root? Gate)", [
        TemplateCell("data_input", "PROBLEM", "Our best engineer just quit"),
        TemplateCell("ai_processor", "DIG", "Ask \"why\" 5 times. Each answer becomes the next question. Stop at the systemic cause.", "B", "previous"),
        TemplateCell("conditional", "ROOT?", condition_type="ai_check", condition_value="Is this the actual root cause, or is it still a symptom of something deeper? Could we ask \"why\" one more time meaningfully? Answer only YES or NO.", on_fail="Max revisions reached.", input_mode="previous", loop_back_to=2, loop_back_max=3),
        TemplateCell("ai_processor", "FIX", "What action addresses the ROOT, not symptoms?", "A", "previous"),
        TemplateCell("log_entry", "ROOT CAUSE", input_mode="previous"),
    ]),
    
    # Template with web fetch
    Template("fetch-red-team", "Fetch & Red Team", [
        TemplateCell("data_input", "URL", "https://example.com/op-ed-or-article"),
        TemplateCell("web_fetch", "FETCH", "{{input}}", fetch_method="GET", input_mode="previous"),
        TemplateCell("ai_processor", "CLAIM", "Extract the main argument or claim from this text in one sentence.", "B", "previous"),
        TemplateCell("ai_processor", "DESTROY", "You're the opposition. Tear this claim apart. Find every weakness.", "B", "previous"),
        TemplateCell("ai_processor", "DEFEND", "Address each attack. Strengthen or admit the limitation.", "A", "all"),
        TemplateCell("log_entry", "BATTLE-TESTED", input_mode="previous"),
    ]),
    
    # Template with data loader
    Template("seattle-wages", "Seattle Wage Analysis", [
        TemplateCell("data_loader", "LOAD", "City_of_Seattle_Wage_Data.csv", read_mode="stats", input_mode="none"),
        TemplateCell("ai_processor", "FINDINGS", "From these stats: What stands out? Highest/lowest paid? Any surprises?", "A", "previous"),
        TemplateCell("ai_processor", "QUESTIONS", "What follow-up analysis would be interesting? Gender gaps? Department comparisons?", "B", "previous"),
        TemplateCell("log_entry", "ANALYSIS", input_mode="previous"),
    ]),
    
    # Template with vector index
    Template("knowledge-base", "Knowledge Base Builder", [
        TemplateCell("data_input", "FILE 1", "documents/guide.pdf"),
        TemplateCell("vector_index", "INDEX 1", "{{input}}", input_mode="previous"),
        TemplateCell("data_input", "FILE 2", "documents/research.txt"),
        TemplateCell("vector_index", "INDEX 2", "{{input}}", input_mode="previous"),
        TemplateCell("data_input", "FILE 3", "documents/notes.md"),
        TemplateCell("vector_index", "INDEX 3", "{{input}}", input_mode="previous"),
        TemplateCell("log_entry", "INDEXED", input_mode="previous"),
    ]),
    
    # Template with vector search
    Template("rag-qa", "RAG Q&A", [
        TemplateCell("data_input", "QUESTION", "What are the main findings about machine learning?"),
        TemplateCell("vector_search", "SEARCH", "{{input}}", input_mode="previous"),
        TemplateCell("ai_processor", "ANSWER", "Based on the search results above, provide a comprehensive answer. Include relevant quotes and citations.", "A", "previous"),
        TemplateCell("log_entry", "ANSWER", input_mode="previous"),
    ]),
    
    # Template with image generation
    Template("idea-visual", "Idea → Visual", [
        TemplateCell("data_input", "IDEA", "Compound interest is the 8th wonder of the world"),
        TemplateCell("ai_processor", "METAPHOR", "One visual metaphor that captures this. Concrete: objects, setting, light. No abstract shapes.", "A", "previous"),
        TemplateCell("ai_processor", "PROMPT", "Turn it into a detailed image prompt. Photographic or illustration. One paragraph.", "A", "previous"),
        TemplateCell("image_gen", "VISUAL", "blurry, text, generic", input_mode="previous"),
        TemplateCell("log_entry", "ART", input_mode="previous"),
    ]),
    
    # Template with script execution
    Template("commit", "Commit Message", [
        TemplateCell("data_input", "CHANGES", "Added error handling to user auth, fixed null pointer in checkout"),
        TemplateCell("ai_processor", "ANALYZE", "Type (feat/fix/refactor), scope, summary. Breaking changes?", "C", "previous"),
        TemplateCell("ai_processor", "MESSAGE", "Write conventional commit:\n<type>(<scope>): <subject>\n\n<body>", "C", "previous"),
        TemplateCell("log_entry", "COMMIT", input_mode="previous"),
    ]),
    
    # Template with conditional contains check
    Template("cold-email", "Cold Email", [
        TemplateCell("data_input", "GOAL", "Get a meeting with VP of Engineering at Stripe to discuss partnership"),
        TemplateCell("conditional", "HAS_CONTEXT", condition_type="contains", condition_value="@", on_fail="[FILTERED: need email address]", input_mode="previous"),
        TemplateCell("ai_processor", "RESEARCH", "What would this person care about? What's their likely pain? What makes you credible?", "B", "previous"),
        TemplateCell("ai_processor", "DRAFT", "Write the email. Short. Specific value prop. Clear ask. No fluff.", "A", "previous"),
        TemplateCell("ai_processor", "SUBJECT", "Write 5 subject lines. Pick the one that would make YOU open it.", "A", "previous"),
        TemplateCell("log_entry", "EMAIL", input_mode="previous"),
    ]),
    
    # Template with conditional length check
    Template("length-filter", "Length Filter", [
        TemplateCell("data_input", "TEXT", "Paste long text here..."),
        TemplateCell("conditional", "CHECK_LENGTH", condition_type="length", condition_value="5000", on_fail="[FILTERED: text too long]", input_mode="previous"),
        TemplateCell("ai_processor", "SUMMARIZE", "Summarize this text.", "A", "previous"),
        TemplateCell("log_entry", "SUMMARY", input_mode="previous"),
    ]),
    
    # Additional templates - Thinking category
    Template("inversion", "Inversion", [
        TemplateCell("data_input", "GOAL", "Launch a successful product"),
        TemplateCell("ai_processor", "FAIL", "How to GUARANTEE failure? List every way to screw this up.", "B", "previous"),
        TemplateCell("ai_processor", "AVOID", "Flip each failure into a success rule. These are your non-negotiables.", "A", "previous"),
        TemplateCell("log_entry", "SUCCESS PATH", input_mode="previous"),
    ]),
    
    Template("second-order", "Second Order", [
        TemplateCell("data_input", "ACTION", "We're going to raise prices by 20%"),
        TemplateCell("ai_processor", "FIRST", "Immediate effects. What happens right away?", "C", "previous"),
        TemplateCell("ai_processor", "THEN", "Second order: How do customers adapt? Competitors? What feedback loops start?", "B", "previous"),
        TemplateCell("ai_processor", "EQUILIBRIUM", "Review the first and second order effects. Where does this settle? Net: worth it?", "B", "all"),
        TemplateCell("log_entry", "ANALYSIS", input_mode="previous"),
    ]),
    
    Template("fence", "Chesterton's Fence", [
        TemplateCell("data_input", "TO REMOVE", "This legacy approval process that slows everything down"),
        TemplateCell("ai_processor", "WHY", "Why was this created? What problem? Who benefits? What breaks without it?", "B", "previous"),
        TemplateCell("ai_processor", "SAFE CHANGE", "Given this context, how to get what you want while preserving the original function?", "A", "all"),
        TemplateCell("log_entry", "APPROACH", input_mode="previous"),
    ]),
    
    Template("five-whys", "Five Whys", [
        TemplateCell("data_input", "PROBLEM", "Our best engineer just quit"),
        TemplateCell("ai_processor", "DIG", "Ask \"why\" 5 times. Each answer becomes the next question. Find the systemic cause.", "B", "previous"),
        TemplateCell("ai_processor", "FIX", "What action addresses the ROOT, not symptoms?", "A", "previous"),
        TemplateCell("log_entry", "ROOT CAUSE", input_mode="previous"),
    ]),
    
    Template("first-principles", "First Principles", [
        TemplateCell("data_input", "PROBLEM", "Electric car batteries are too expensive"),
        TemplateCell("ai_processor", "ASSUMPTIONS", "What does everyone assume? List every \"that's just how it is.\"", "B", "previous"),
        TemplateCell("ai_processor", "PHYSICS", "What's actually TRUE? What are the fundamental constraints?", "B", "previous"),
        TemplateCell("ai_processor", "REBUILD", "Given the problem and the physics, design from fundamentals only. Ignore convention.", "A", "all"),
        TemplateCell("log_entry", "BREAKTHROUGH", input_mode="previous"),
    ]),
    
    Template("premortem", "Pre-Mortem", [
        TemplateCell("data_input", "PLAN", "We're launching the new feature next month"),
        TemplateCell("ai_processor", "OBITUARY", "It's 6 months later. Project is dead. Write the post-mortem. What killed it?", "B", "previous"),
        TemplateCell("ai_processor", "PREVENT", "For each cause of death: what action NOW would prevent it?", "A", "previous"),
        TemplateCell("log_entry", "SAFEGUARDS", input_mode="previous"),
    ]),
    
    Template("red-team", "Red Team", [
        TemplateCell("data_input", "IDEA", "We should expand into the European market"),
        TemplateCell("ai_processor", "DESTROY", "You're the opposition. Tear this apart. Find every weakness.", "B", "previous"),
        TemplateCell("ai_processor", "DEFEND", "Review the original idea and the attacks. Address each attack. Strengthen or admit the limitation.", "A", "all"),
        TemplateCell("log_entry", "BATTLE-TESTED", input_mode="previous"),
    ]),
    
    # Writing templates
    Template("explain", "Explain Complex Thing", [
        TemplateCell("data_input", "CONCEPT", "Explain how transformers (the AI architecture) work"),
        TemplateCell("ai_processor", "SIMPLE", "Explain to a smart 12-year-old. Analogies. No jargon. Build up step by step.", "A", "previous"),
        TemplateCell("ai_processor", "GAPS", "What did that explanation skip? What would a curious person ask next?", "B", "previous"),
        TemplateCell("ai_processor", "COMPLETE", "Fill the gaps without losing clarity.", "A", "previous"),
        TemplateCell("log_entry", "EXPLANATION", input_mode="previous"),
    ]),
    
    Template("thread", "Twitter Thread", [
        TemplateCell("data_input", "INSIGHT", "Most productivity advice is backwards - you should do less, not optimize more"),
        TemplateCell("ai_processor", "HOOK", "Write 5 opening tweets. Controversial, specific, makes people want to read more.", "A", "previous"),
        TemplateCell("ai_processor", "THREAD", "Build the thread: hook → story/evidence → counterintuitive insight → takeaway. 8-12 tweets.", "A", "previous"),
        TemplateCell("ai_processor", "SHARPEN", "Make each tweet punchier. Remove filler. Add one specific example.", "B", "previous"),
        TemplateCell("log_entry", "THREAD", input_mode="previous"),
    ]),
    
    Template("compress", "Compress", [
        TemplateCell("data_input", "SOURCE", "Paste long text here..."),
        TemplateCell("ai_processor", "PARA", "Compress to ONE paragraph. What's the core?", "B", "previous"),
        TemplateCell("ai_processor", "SENTENCE", "Now ONE sentence.", "B", "previous"),
        TemplateCell("ai_processor", "WORD", "Now ONE word that captures the essence.", "B", "previous"),
        TemplateCell("log_entry", "COMPRESSED", input_mode="previous"),
    ]),
    
    # Code templates
    Template("debug", "Debug", [
        TemplateCell("data_input", "BUG", "Error: \"Cannot read property 'map' of undefined\" on line 42"),
        TemplateCell("ai_processor", "HYPOTHESES", "5 likely causes, ranked. What would confirm each?", "B", "previous"),
        TemplateCell("ai_processor", "FIX", "For the most likely cause: show the exact fix.", "A", "previous"),
        TemplateCell("log_entry", "SOLUTION", input_mode="previous"),
    ]),
    
    Template("review", "Code Review", [
        TemplateCell("data_input", "CODE", "Paste code to review..."),
        TemplateCell("ai_processor", "ISSUES", "Bugs, edge cases, code smells. Be specific with line numbers.", "B", "previous"),
        TemplateCell("ai_processor", "IMPROVED", "Show the refactored version with comments explaining changes.", "A", "previous"),
        TemplateCell("log_entry", "REVIEW", input_mode="previous"),
    ]),
    
    Template("architect", "Architect", [
        TemplateCell("data_input", "REQUIREMENTS", "Build a URL shortener that handles 10k requests/second"),
        TemplateCell("ai_processor", "DESIGN", "High-level architecture. Components, how they connect. ASCII diagram.", "A", "previous"),
        TemplateCell("ai_processor", "TRADEOFFS", "What could go wrong? Scaling bottlenecks? What decisions need more thought?", "B", "previous"),
        TemplateCell("log_entry", "ARCHITECTURE", input_mode="previous"),
    ]),
    
    # Script templates
    Template("pr-desc", "PR Description", [
        TemplateCell("data_input", "CHANGES", "Describe what you changed and why"),
        TemplateCell("ai_processor", "PR", "Write PR description:\n## Summary\n## Changes\n## Testing\n## Screenshots (if applicable)", "A", "previous"),
        TemplateCell("log_entry", "PR DESC", input_mode="previous"),
    ]),
    
    Template("sql", "SQL Builder", [
        TemplateCell("data_input", "QUESTION", "Find all users who signed up last month and made at least 3 purchases"),
        TemplateCell("ai_processor", "SQL", "Write the SQL. Use clear aliases. Add comments.", "A", "previous"),
        TemplateCell("ai_processor", "OPTIMIZE", "Any performance concerns? Suggest indexes.", "B", "previous"),
        TemplateCell("log_entry", "QUERY", input_mode="previous"),
    ]),
    
    # Knowledge templates
    Template("document-research", "Document Research", [
        TemplateCell("vector_index", "INDEX", "research-paper.pdf", input_mode="none"),
        TemplateCell("data_input", "TOPIC", "neural network architectures"),
        TemplateCell("vector_search", "SEARCH", "{{input}}", input_mode="previous"),
        TemplateCell("ai_processor", "ANALYZE", "Review the search results. What are the key insights? What patterns emerge?", "A", "previous"),
        TemplateCell("ai_processor", "SYNTHESIZE", "Synthesize the findings into a coherent summary with main points and implications.", "B", "all"),
        TemplateCell("log_entry", "RESEARCH", input_mode="previous"),
    ]),
    
    Template("fact-checker", "Fact Checker", [
        TemplateCell("data_input", "CLAIM", "Machine learning models require massive datasets to work"),
        TemplateCell("vector_search", "SEARCH", "{{input}}", input_mode="previous"),
        TemplateCell("ai_processor", "VERIFY", "Based on the search results, verify the claim. Is it accurate? What do the sources say?", "B", "previous"),
        TemplateCell("ai_processor", "EVIDENCE", "Provide specific evidence from the search results supporting or refuting the claim.", "A", "all"),
        TemplateCell("log_entry", "VERIFICATION", input_mode="previous"),
    ]),
    
    # Data templates
    Template("api-fetch-analyze", "Fetch & Analyze API", [
        TemplateCell("web_fetch", "FETCH", "https://api.github.com/repos/vercel/next.js/releases/latest", fetch_method="GET", input_mode="none"),
        TemplateCell("ai_processor", "ANALYZE", "Summarize this API response. What are the key details?", "A", "previous"),
        TemplateCell("log_entry", "SUMMARY", input_mode="previous"),
    ]),
    
    Template("conditional-route", "Smart Router", [
        TemplateCell("data_input", "MESSAGE", "What is the weather today?"),
        TemplateCell("conditional", "IS_QUESTION", condition_type="contains", condition_value="?", on_fail="[FILTERED: not a question]", input_mode="previous"),
        TemplateCell("ai_processor", "ANSWER", "Answer the question concisely.", "C", "previous"),
        TemplateCell("log_entry", "RESPONSE", input_mode="previous"),
    ]),
]


class TemplateExecutor:
    """Executes templates with mocked dependencies."""
    
    def __init__(self):
        self.ollama = AsyncMock(spec=OllamaClient)
        self.vector_store = AsyncMock(spec=VectorStore)
        self.file_loader = MagicMock()
        self.image_gen = AsyncMock()
        
        # Setup default mock behaviors
        self.ollama.chat = AsyncMock(return_value="Mock AI response")
        self.vector_store.query = AsyncMock(return_value=[
            {"content": "Mock search result", "similarity": 0.95, "metadata": {"file_path": "test.pdf"}}
        ])
        self.file_loader.read_file = MagicMock(return_value={"content": "Mock file content"})
        self.image_gen.generate = AsyncMock(return_value={"image": "mock_image_data"})
    
    def gather_input(self, cell_index: int, cells: List[TemplateCell], outputs: Dict[int, str]) -> str:
        """Gather input for a cell based on its inputMode."""
        cell = cells[cell_index]
        
        if cell_index == 0 or cell.input_mode == "none":
            return cell.content or ""
        
        if cell.input_mode == "previous":
            return outputs.get(cell_index - 1, cells[cell_index - 1].content or "")
        
        # 'all' mode
        context_parts = []
        for i in range(cell_index):
            prev_output = outputs.get(i, cells[i].content or "")
            if prev_output:
                context_parts.append(f"[{cells[i].label}]\n{prev_output}")
        return "\n\n---\n\n".join(context_parts)
    
    def evaluate_conditional(self, cell: TemplateCell, input_value: str) -> bool:
        """Evaluate a conditional cell."""
        if cell.condition_type == "contains":
            return cell.condition_value in input_value
        elif cell.condition_type == "length":
            max_length = int(cell.condition_value)
            return len(input_value) <= max_length
        elif cell.condition_type == "regex":
            import re
            pattern = cell.condition_value
            return bool(re.search(pattern, input_value))
        elif cell.condition_type == "keyword":
            keywords = cell.condition_value.lower().split()
            input_lower = input_value.lower()
            return any(kw in input_lower for kw in keywords)
        elif cell.condition_type == "ai_check":
            # For testing, simulate AI check - return True if input contains "YES"
            return "YES" in input_value.upper()
        return False
    
    async def execute_cell(
        self,
        cell: TemplateCell,
        input_value: str,
        model: str = "llama3.1:8b"
    ) -> str:
        """Execute a single cell."""
        # Handle template variable substitution
        content = cell.content.replace("{{input}}", input_value)
        
        if cell.type == "data_input":
            return cell.content or input_value
        
        if cell.type == "log_entry":
            return input_value
        
        if cell.type == "ai_processor":
            prompt = f"{content}\n\n---\n\n{input_value}" if content.strip() else input_value
            return await self.ollama.chat(prompt, model=model)
        
        if cell.type == "script_execution":
            if "{{input}}" in content:
                return content.replace("{{input}}", input_value)
            return content or input_value
        
        if cell.type == "data_loader":
            path = content.strip()
            if not path:
                raise ValueError("No file path specified")
            result = self.file_loader.read_file(path, "auto", 100000)
            return result.get("content", "")
        
        if cell.type == "image_gen":
            prompt = input_value or content or "an image"
            neg = content if input_value and content else ""
            result = await self.image_gen.generate(
                prompt=prompt,
                model=model or "sdxl",
                negative_prompt=neg,
                width=1024,
                height=1024,
                steps=30,
            )
            return result.get("image", "")
        
        if cell.type == "vector_index":
            file_path = input_value or content or ""
            if not file_path.strip():
                raise ValueError("No file path specified")
            # Mock indexing - just return success message
            return f"✅ Indexed '{file_path}'\n📄 10 chunks created\n🆔 ID: mock-id"
        
        if cell.type == "vector_search":
            query = input_value or content or ""
            if not query.strip():
                raise ValueError("No search query specified")
            results = await self.vector_store.query(query_text=query, n_results=5)
            if not results:
                return f"🔍 No results found for: '{query}'"
            output_lines = [f"🔍 Found {len(results)} results for: '{query}'\n"]
            for i, result in enumerate(results, 1):
                similarity = result.get("similarity", 0) or 0
                content_preview = (result.get("content") or "")[:200]
                metadata = result.get("metadata", {})
                source = metadata.get("file_path") or metadata.get("source", "unknown")
                output_lines.append(f"\n[{i}] Similarity: {similarity:.2%}")
                output_lines.append(f"📄 Source: {source}")
                output_lines.append(f"💬 Preview: {content_preview}...")
            return "\n".join(output_lines)
        
        if cell.type == "conditional":
            passed = self.evaluate_conditional(cell, input_value)
            if passed:
                return cell.on_pass or input_value
            else:
                return cell.on_fail or ""
        
        if cell.type == "web_fetch":
            # Mock web fetch - just return mock HTML content
            return f"<html><body>Mock content from {content}</body></html>"
        
        return input_value
    
    async def execute_template(self, template: Template, max_iterations: int = 100) -> Dict[str, Any]:
        """Execute a complete template."""
        outputs: Dict[int, str] = {}
        loop_counts: Dict[int, int] = {}
        iteration = 0
        
        i = 0
        while i < len(template.cells) and iteration < max_iterations:
            iteration += 1
            cell = template.cells[i]
            
            # Gather input
            input_value = self.gather_input(i, template.cells, outputs)
            
            # Execute cell
            try:
                result = await self.execute_cell(cell, input_value)
                outputs[i] = result
                
                # Handle conditional loop-back
                if cell.type == "conditional" and cell.loop_back_to:
                    passed = self.evaluate_conditional(cell, input_value)
                    if not passed:
                        count = loop_counts.get(i, 0)
                        max_loops = cell.loop_back_max or 3
                        if count >= max_loops:
                            outputs[i] = cell.on_fail or ""
                            i += 1
                            continue
                        loop_counts[i] = count + 1
                        i = cell.loop_back_to - 2  # 1-based to 0-based, -1 for next increment
                        continue
                
                i += 1
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e),
                    "cell_index": i,
                    "cell_label": cell.label,
                    "cell_type": cell.type,
                }
        
        return {
            "success": True,
            "outputs": outputs,
            "final_output": outputs.get(len(template.cells) - 1, ""),
        }


@pytest.mark.asyncio
@pytest.mark.parametrize("template", TEMPLATES)
async def test_template_execution(template: Template):
    """Test that each template executes without errors."""
    executor = TemplateExecutor()
    result = await executor.execute_template(template)
    
    assert result["success"], (
        f"Template '{template.name}' ({template.id}) failed: {result.get('error', 'Unknown error')}\n"
        f"Failed at cell {result.get('cell_index', 'unknown')} ({result.get('cell_label', 'unknown')}) "
        f"of type {result.get('cell_type', 'unknown')}"
    )
    
    # Verify we got some output
    assert result.get("final_output") is not None, f"Template '{template.name}' produced no final output"
    
    # Verify all cells executed (we should have outputs for all cells)
    expected_cell_count = len(template.cells)
    actual_output_count = len(result.get("outputs", {}))
    assert actual_output_count == expected_cell_count, (
        f"Template '{template.name}' expected {expected_cell_count} cells to execute, "
        f"but only {actual_output_count} produced outputs. "
        f"Outputs: {list(result.get('outputs', {}).keys())}"
    )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
