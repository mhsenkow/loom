# Folder Context Feature - Strategic Product Plan

**Feature:** Enable "looking at a folder" for focused code project conversations  
**Goal:** Allow users to have AI conversations about improving code projects with full context  
**Date:** January 27, 2026

---

## Executive Summary

**Recommendation:** Implement a **hybrid approach** combining:
1. **Right-side micro-app panel** (primary UI) - for folder selection and management
2. **Automatic indexing** - index selected folder into vector store
3. **Smart context injection** - automatically include relevant code in chat context
4. **Configurable parameters** - user control over indexing and context methods

**Why this approach:**
- Leverages existing vector store infrastructure
- Non-intrusive UI (slides in like ImageAnalysisPanel)
- Flexible - supports both quick folder selection and deep configuration
- Scales to large codebases via smart chunking

---

## Product Decisions

### ✅ Decision 1: UI Location - Right-Side Panel

**Recommendation:** **Right-side micro-app panel** (similar to ImageAnalysisPanel)

**Rationale:**
- ✅ Consistent with existing UI patterns (ImageAnalysisPanel, ImageGenerationPanel)
- ✅ Doesn't clutter main chat interface
- ✅ Can be collapsed/hidden when not needed
- ✅ Provides space for folder tree, file list, and controls
- ❌ Alternative: Inline folder picker would clutter chat input area
- ❌ Alternative: Left sidebar would conflict with SessionPanel

**Implementation:**
- Slide-in panel from right (like ImageAnalysisPanel)
- Collapsible/expandable
- Shows folder tree, selected files, indexing status
- Quick actions: "Index Folder", "Clear Context", "View Indexed Files"

---

### ✅ Decision 2: File Reading Methods

**Recommendation:** **Multiple methods with smart defaults**

**Methods to Support:**

1. **Full Index (Default for Code)**
   - Index entire folder into vector store
   - Use semantic search to retrieve relevant files per query
   - Best for: Large codebases, exploratory questions
   - **Chunking strategy:** Function/class-level chunks for code files

2. **Selected Files**
   - User manually selects specific files
   - Include full content in context (with truncation for large files)
   - Best for: Focused conversations on specific files
   - **Truncation:** First 10KB + last 1KB for large files

3. **AST-Based (Advanced)**
   - Parse code structure, extract functions/classes
   - Include only relevant code units
   - Best for: Deep code analysis, refactoring suggestions
   - **Requires:** Tree-sitter or similar parser

4. **Git-Aware (Future)**
   - Only index changed files (git diff)
   - Include git history context
   - Best for: Code review workflows

**Default Behavior:**
- **Code projects:** Full Index (vector store)
- **Small folders (< 50 files):** Selected Files (full content)
- **User can override** via panel controls

---

### ✅ Decision 3: Parameter Controls

**Recommendation:** **Progressive disclosure** - simple defaults, advanced options available

**Simple Mode (Default):**
- Folder path input
- "Index Folder" button
- Auto-detects file types
- Uses smart defaults:
  - Chunk size: 1000 chars
  - Overlap: 200 chars
  - Code chunking: Function/class boundaries
  - Max file size: 1MB (skip larger files)

**Advanced Mode (Expandable):**
- **File Filters:**
  - Include/exclude patterns (`.gitignore` support)
  - File type filters (`.py`, `.ts`, `.js`, etc.)
  - Max file size limit
  - Max files to index

- **Indexing Options:**
  - Chunk size (default: 1000)
  - Chunk overlap (default: 200)
  - Chunking strategy (sentence, function, class, fixed)
  - Collection name (for multiple projects)

- **Context Injection:**
  - Number of relevant chunks to include (default: 5)
  - Similarity threshold (default: 0.0)
  - Include file paths in context (default: yes)
  - Include line numbers (default: yes for code)

**UI Design:**
```
┌─────────────────────────────────────┐
│ 📁 Folder Context                   │
├─────────────────────────────────────┤
│ [Select Folder...] [Browse]         │
│                                     │
│ Selected: /path/to/project         │
│ Files: 47 code files               │
│                                     │
│ [Index Folder] [Clear Context]     │
│                                     │
│ ▼ Advanced Options                  │
│   • File filters                    │
│   • Indexing settings              │
│   • Context injection               │
└─────────────────────────────────────┘
```

---

### ✅ Decision 4: Integration with Chat

**Recommendation:** **Automatic context injection** when folder is indexed

**How it works:**
1. User selects folder and clicks "Index Folder"
2. Backend indexes all code files into vector store (collection: `loom_code_context`)
3. When user sends chat message, automatically:
   - Search vector store for relevant code chunks
   - Inject top N chunks into prompt context
   - Include file paths and line numbers

**User Control:**
- Toggle: "Enable folder context" (checkbox in panel)
- Can disable per-message (future: `/no-context` command)
- Can switch between folders (only one active at a time)

**Context Format:**
```
[Code Context from: /path/to/project]

[File: src/main.py:45-60]
def process_data(data):
    """Process incoming data"""
    ...

[File: src/utils.py:12-25]
class DataProcessor:
    def __init__(self):
        ...
```

---

## Technical Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Backend:**
1. **New Router:** `app/routers/code_context.py`
   - `POST /api/code-context/index-folder` - Index folder
   - `GET /api/code-context/status` - Get indexing status
   - `DELETE /api/code-context/clear` - Clear indexed context
   - `GET /api/code-context/files` - List indexed files

2. **Enhanced DocumentIndexer:**
   - Add code-specific chunking (function/class boundaries)
   - Support `.gitignore` patterns
   - File type detection for code files

3. **Chat Integration:**
   - Modify `chat()` handler to check for active code context
   - Auto-inject code context when available
   - Add `use_code_context` flag to chat data

**Frontend:**
1. **New Component:** `CodeContextPanel.tsx`
   - Folder picker (native file dialog)
   - Indexing progress indicator
   - File list with counts
   - Toggle for enabling/disabling

2. **TerminalFeed Integration:**
   - Add panel state management
   - Pass `use_code_context` flag to chat handler
   - Show indicator when context is active

### Phase 2: Advanced Features (Week 2)

1. **AST-Based Chunking:**
   - Integrate tree-sitter for code parsing
   - Extract functions/classes as chunks
   - Preserve code structure in context

2. **File Selection UI:**
   - Tree view of folder structure
   - Checkboxes for individual files
   - Preview selected files

3. **Advanced Parameters:**
   - Expandable advanced options panel
   - Save/load configuration presets

### Phase 3: Polish & Optimization (Week 3)

1. **Performance:**
   - Incremental indexing (only new/changed files)
   - Background indexing for large folders
   - Progress indicators

2. **UX Improvements:**
   - Keyboard shortcuts
   - Quick folder switching
   - Context preview before sending

---

## User Experience Flow

### Scenario: User wants to improve a code project

1. **User opens LOOM terminal**
2. **Clicks folder icon** (new button in CommandInput area)
3. **CodeContextPanel slides in from right**
4. **User selects project folder** (`/Users/dev/my-project`)
5. **Clicks "Index Folder"**
   - Shows progress: "Indexing 47 files..."
   - Backend indexes all `.py`, `.ts`, `.js` files
   - Stores in vector store collection `loom_code_context`
6. **Panel shows:**
   - ✅ "47 files indexed"
   - "Context: ENABLED" (toggle on)
7. **User types in chat:**
   - "How can I improve error handling in this codebase?"
8. **System automatically:**
   - Searches vector store for relevant code chunks
   - Finds error handling code in 3 files
   - Injects context into prompt
   - AI responds with specific suggestions referencing actual code
9. **User can:**
   - Ask follow-up questions (context persists)
   - Click "Clear Context" to disable
   - Switch to different folder

---

## API Design

### Backend Endpoints

```python
# Index a folder
POST /api/code-context/index-folder
{
  "folder_path": "/path/to/project",
  "options": {
    "file_patterns": ["*.py", "*.ts", "*.js"],
    "exclude_patterns": ["node_modules", ".git"],
    "chunk_size": 1000,
    "chunk_overlap": 200,
    "chunking_strategy": "function",  # or "sentence", "fixed"
    "max_file_size": 1048576,  # 1MB
    "collection_name": "loom_code_context"
  }
}

# Get indexing status
GET /api/code-context/status
Response: {
  "active": true,
  "folder_path": "/path/to/project",
  "files_indexed": 47,
  "collection": "loom_code_context",
  "indexed_at": "2026-01-27T10:30:00Z"
}

# Clear context
DELETE /api/code-context/clear

# List indexed files
GET /api/code-context/files
Response: {
  "files": [
    {"path": "src/main.py", "chunks": 12, "size": 45678},
    ...
  ]
}
```

### Chat Integration

```typescript
// In TerminalFeed.tsx
const sendChat = (prompt: string, model: string) => {
  socket.emit('chat', {
    prompt,
    model,
    use_code_context: codeContextActive,  // NEW
    code_context_collection: 'loom_code_context',  // NEW
  })
}
```

---

## Competitive Analysis

**Similar Features:**
- **GitHub Copilot Chat:** Requires GitHub integration, cloud-based
- **Cursor AI:** Has "Codebase Indexing" feature (similar to this)
- **Codeium:** Folder context via sidebar

**LOOM's Differentiation:**
- ✅ Fully local (privacy-first)
- ✅ Retro aesthetic (unique in AI tools)
- ✅ Circuit-based workflows (can chain folder context with other operations)
- ✅ No cloud dependency

---

## Success Metrics

**Phase 1 Goals:**
- Users can index a folder in < 30 seconds
- Context retrieval adds < 2 seconds to chat response time
- 80% of code-related queries benefit from context

**Phase 2 Goals:**
- Support folders with 1000+ files
- AST-based chunking improves context relevance by 30%
- Users report "much better" code suggestions

---

## Risks & Mitigations

**Risk 1: Large folders slow down indexing**
- **Mitigation:** Background indexing, progress indicators, file size limits

**Risk 2: Context injection exceeds token limits**
- **Mitigation:** Smart chunk selection, configurable chunk count, truncation

**Risk 3: Users don't understand when context is active**
- **Mitigation:** Clear UI indicators, status messages, toggle visibility

**Risk 4: Privacy concerns (indexing sensitive code)**
- **Mitigation:** All local, no cloud sync, clear "Clear Context" action

---

## Next Steps

1. **Approve this strategy** ✅
2. **Create implementation tickets:**
   - [ ] Backend: Code context router
   - [ ] Backend: Enhanced document indexer for code
   - [ ] Backend: Chat integration with code context
   - [ ] Frontend: CodeContextPanel component
   - [ ] Frontend: TerminalFeed integration
   - [ ] Testing: End-to-end folder indexing flow

3. **Start with Phase 1** (Core Infrastructure)
4. **Gather user feedback** after Phase 1
5. **Iterate based on feedback** before Phase 2

---

## Questions for Discussion

1. **Should we support multiple folders simultaneously?**
   - Recommendation: Start with one, add multi-folder later if needed

2. **Should indexing happen automatically on folder selection?**
   - Recommendation: Manual "Index Folder" button (user control)

3. **How do we handle very large codebases (10k+ files)?**
   - Recommendation: File count limits, user confirmation, background processing

4. **Should we persist folder context across sessions?**
   - Recommendation: Yes, store in localStorage, restore on startup

---

**Status:** Ready for implementation  
**Priority:** High (enables core use case)  
**Estimated Effort:** 2-3 weeks (3 phases)
