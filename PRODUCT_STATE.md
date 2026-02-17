# LOOM Product State & Strategic Guidance

**Last Updated:** February 13, 2026  
**VP of Product:** AI Advisor

---

## Product Overview

**LOOM** is your **home-base app** — the central place you operate from (terminal, circuits, sessions, AI). It is local-first and desktop-class with a retro terminal aesthetic. Other communication surfaces (Slack, Discord, Telegram, WhatsApp, etc.) are treated as **optional connections** to that home base: inbound feeds or outbound posts, not the primary interface. You come to LOOM to work; channels can connect in when you want them.

It combines:
- Terminal-based notebook interface with session management
- Circuit board (node-graph) for building AI processing pipelines
- Local AI via Ollama (LLMs + Vision models)
- Vector memory via ChromaDB for RAG and document indexing
- Image analysis and generation capabilities
- Music generation and speech interaction capabilities
- Cloud provider connectivity with quick-lane routing
- QDC async remote job lane
- File processing and document indexing

**Target Users:** Power users, developers, researchers, knowledge workers who want local-first AI tools with full control over their data.

---

## Current Product State

### ✅ Fully Working Features
- Terminal feed with session management (save/load/restore)
- Circuit board with node-based workflows
- AI chat with Ollama integration
- Vector store with ChromaDB (INDEX/SEARCH cells)
- File processing and indexing (PDFs, text files)
- Image analysis with vision models (LLaVA, BakLLaVA, Moondream)
- Circuit templates and persistence
- Session save/load/restore
- Mobile-friendly chat interface (`/chat` endpoint)
- Intent-aware model orchestration with auto model switching
- Fast cloud lane command (`/quick`) with free/cheap preference
- Conversational action confirmation (`yes` / `edit:` / `no`) for image/music/speech/QDC
- QDC async job APIs + terminal event stream
- Circuit QDC nodes (`qdc_upload`, `qdc_run`, `qdc_status`, `qdc_results`)
- QDC package-and-ship flows (`/qdc package`, `/qdc package-model`, `/qdc ship`, `/qdc ship-model`, `/qdc relay`)
- Goal/memory/mission + maintenance command utilities in terminal UX
- Electron unsaved-circuit close guard + full-screen/maximize state bridge
- Expanded CRT controls (noise, bloom, jitter, scan drift)

### 🚧 In Development
- Enhanced RAG workflows
- More circuit templates
- Advanced image generation features
- Performance optimizations
- Live Qualcomm QDC API backend integration (current lane is mock-backed)

### 📋 Planned Features
- **Channel connectors** — Optional in/out connections to Slack, Discord, Telegram, etc., so the home base can ingest or push to those channels without making them the primary UI.
- Multi-user support
- Cloud sync (optional)
- Plugin system
- Advanced visualization tools

---

## Technical Architecture

**Frontend:**
- Electron + React + TypeScript + Vite
- Tailwind CSS (retro terminal theme)
- Tiptap (headless editor)
- React Flow (node graph)
- Socket.IO Client

**Backend:**
- Python 3.10+ with FastAPI + Socket.IO
- Ollama (local LLMs + vision models)
- ChromaDB (vector store for RAG)
- SQLite (circuit and session persistence)
- PyMuPDF (PDF processing)
- Diffusers (image generation)
- Provider registry + cloud model catalog
- Async QDC lane service and router

**Key Services:**
- `ollama_client` - LLM inference
- `vector_store` - ChromaDB integration
- `file_loader` - Document processing
- `module_executor` - Circuit execution
- `local_image_gen` - Image generation
- `orchestrator` - Intent-based model routing
- `provider_manager` - Unified local/cloud model listing + quick-lane selection
- `qdc_service` - Async remote job orchestration
- `storage` - Persistence layer

---

## Product Metrics & Health

### Current Status: **STABLE / EXPANDING CLOUD LANES** ✅
- Core features functional
- Local-first architecture working
- Good documentation coverage
- Active development ongoing

### Key Strengths
1. **Unique positioning**: Retro aesthetic + local-first AI is distinctive
2. **Complete stack**: Full pipeline from ingestion → processing → output
3. **Extensibility**: Circuit-based architecture allows for flexible workflows
4. **Privacy-focused**: Everything runs locally
5. **Progressive cloud support**: Optional cloud lanes without breaking local-first defaults

### Areas for Growth
1. **User onboarding**: Could benefit from guided tutorials
2. **Template library**: Expand pre-built circuit templates
3. **Performance**: Optimize for larger document sets
4. **Community**: Build user base and template sharing

---

## Strategic Priorities

### Immediate (Next 1-2 Weeks)
- [x] QDC async lane UX wiring (terminal + API + events)
- [x] Quick cloud lane routing (`/quick`)
- [x] Conversational action-confirm flow for media and remote jobs
- [ ] Replace QDC mock backend with live Qualcomm API calls
- [ ] Expand onboarding/tooltips for non-technical users

### Short-term (Next 1-3 Months)
- [ ] Enhanced RAG workflows (in progress)
- [ ] Expanded template library
- [ ] Performance optimizations
- [ ] User onboarding improvements

### Medium-term (3-6 Months)
- [ ] Plugin system architecture
- [ ] Advanced visualization tools
- [ ] Community features (template sharing?)

### Long-term (6+ Months)
- [ ] Multi-user support
- [ ] Optional cloud sync
- [ ] Enterprise features (if applicable)

---

## Product Decisions Log

### February 13, 2026: QDC Packaging + Interaction Refinements

**Decision:** Extend QDC from "upload/run" into a package-first workflow while tightening UX and routing reliability.

**Delivered:**
- QDC packaging endpoints and service flow (`/api/qdc/package`, `/api/qdc/package-and-run`)
- QDC terminal packaging commands (`/qdc package`, `/qdc ship`, model variants, relay)
- Local-first model target resolution for cloud/local name collisions
- Structured conversation prompt context + profile memory/goals scaffolding
- Unsaved circuit close safeguards in Electron shell

**Status:** Implemented (still mock-backed for live QDC execution internals).

**See:** `CLOUD_ORCHESTRATION_AND_QDC.md`, `CHANGELOG.md`.

---

### February 12, 2026: Cloud Lane and QDC Integration

**Decision:** Expand optional cloud capability while preserving local-first interaction defaults.

**Delivered:**
- Intent-aware model orchestration with session stickiness
- `/quick` command path for fast/cheap model selection
- Provider metadata/capabilities surfaced in setup UI
- QDC async job lane (upload/run/status/log/result) integrated into terminal and circuit nodes
- Conversational action confirmation flow for easier non-technical use

**Rationale:**
- Keeps local privacy and responsiveness as the base
- Adds optional offload path for lower-priority or remote-heavy tasks
- Maintains a single conversational UX rather than forcing users into mode-switch workflows

**Status:** Implemented with mock-backed QDC execution; live QDC API backend is next.

**See:** `CLOUD_ORCHESTRATION_AND_QDC.md` for implementation-level details.

---

### January 27, 2026: Folder Context Feature

**Decision:** Implement folder context for code project conversations

**Approach:**
- Right-side micro-app panel (consistent with existing UI patterns)
- Multiple file reading methods (Full Index, Selected Files, AST-Based)
- Progressive disclosure of parameters (simple defaults, advanced options)
- Automatic context injection via vector store RAG

**Rationale:**
- Leverages existing vector store infrastructure
- Non-intrusive UI that matches current design patterns
- Flexible enough for both quick use and deep configuration
- Enables core use case: focused conversations about code improvements

**Status:** Phase 1 implemented (router + panel + chat injection). Advanced indexing optimization and e2e hardening remain.

**See:** `FOLDER_CONTEXT_STRATEGY.md` for full details

---

## User Feedback & Insights

*This section will be populated with user feedback and insights as they come in.*

---

## Competitive Landscape

**Direct Competitors:**
- Obsidian (note-taking, but not AI-native)
- Notion AI (cloud-based, not local-first)
- Local-first AI tools (growing category)

**LOOM's Differentiation:**
- Retro aesthetic (unique in AI tool space)
- Circuit-based workflow builder
- Fully local-first (privacy advantage)
- Desktop-class application (not just web)

---

## Next Steps

**Awaiting user input to:**
1. Provide current status updates
2. Share user feedback
3. Discuss strategic priorities
4. Review metrics/analytics
5. Make product decisions

---

## Notes

*This document will be updated as new information is provided.*
