# Cloud Orchestration and QDC Lane

**Last Updated:** February 12, 2026

This document describes the current state of model orchestration, quick cloud routing, provider integration, and the QDC async execution lane.

## Current State Summary

- Local-first chat remains the default.
- The orchestrator can auto-select models per turn and emits model-switch events.
- `/quick` uses a dedicated fast/low-cost selection path.
- Cloud provider metadata includes quick-lane suitability and free-tier hints.
- QDC is integrated as an async **job lane** (not direct chat-completions).
- Terminal supports conversational action confirmation (`yes`, `edit: ...`, `no`) for image/music/speech/QDC actions.

## Model Orchestration

### Backend

- `backend/app/services/orchestrator.py`
  - Intent profile inference (`code`, `reasoning`, `creative`, `fast`, `general`)
  - Optional tiny router model stage
  - Weighted scoring using cost/speed/quality + task affinity
  - Stickiness (`min_switch_delta`) to reduce thrashing
- `backend/app/main.py`
  - Persists last auto-selected model per socket session
  - Emits `orchestrator_event` with `model_selected`/`model_switched`

### Frontend

- `frontend/src/components/terminal/TerminalFeed.tsx`
  - Displays model-switch system messages
  - Uses backend quick-model suggestion for `/quick`

## Quick Lane

### Provider catalog + scoring

- `backend/app/services/provider_manager.py`
  - Unified local/cloud model list
  - Model metadata fields: `is_free`, `cost_tier`, `supports_quick`, provider capability flags
  - `suggest_quick_model(active_model)` prefers:
    1. free/cheap cloud quick models
    2. tiny local model fallback

### API

- `GET /api/providers/quick-model?active_model=...`
  - Returns `{ model, provider_type, provider, reason }`

### Command

- `/quick <question>`
  - Uses backend selection first; falls back to local heuristic if unavailable.

## Providers

### Current provider registry

- OpenAI
- Anthropic
- Gemini
- Mistral
- DeepSeek
- OpenRouter (includes free-tier-friendly catalog fallback)
- Qualcomm QDC connector entry

### Capability metadata

Providers now expose:

- `supports_chat`
- `supports_quick`
- `free_tier_available`
- `notes`

## QDC Async Job Lane

### Important behavior

- QDC is currently connected as an async job system.
- It is **not** used for token-streaming chat completions.

### Service + router

- `backend/app/services/qdc_service.py`
  - Artifact upload bookkeeping
  - Async job create/run/status/log/result
  - Rerun and cancel support
  - Socket event emission callback support
- `backend/app/routers/qdc.py`
  - `/api/qdc/status`
  - `/api/qdc/upload`
  - `/api/qdc/jobs` (create/list)
  - `/api/qdc/jobs/{id}`
  - `/api/qdc/jobs/{id}/logs`
  - `/api/qdc/jobs/{id}/results`
  - `/api/qdc/jobs/{id}/rerun`
  - `/api/qdc/jobs/{id}/cancel`

### Socket events

- `qdc_job_event`
  - Job status/progress updates are forwarded to terminal feed.

### Current mode

- `LOOM_QDC_MODE=mock` (default/current)
- `LOOM_QDC_MOCK_STEP_S` controls simulated progress pacing.

The mock lane is intentional for UX integration and orchestration testing. Live Qualcomm API calls can replace internals of `qdc_service` without changing UX contracts.

## Conversational Action Assist

In terminal chat (non-slash input), LOOM can detect intents for:

- image generation
- music generation
- speech mode
- QDC remote job

Flow:

1. LOOM proposes action
2. User replies `yes`, `edit: ...`, or `no`
3. Action executes and progress/results appear inline

## Circuit Node Support

### New module types

- `qdc_upload`
- `qdc_run`
- `qdc_status`
- `qdc_results`

### Files

- Backend enum: `backend/app/models/module.py`
- Backend execution: `backend/app/services/module_executor.py`
- Frontend enum/UI wiring:
  - `frontend/src/types/module.ts`
  - `frontend/src/components/circuit/CellTypes.ts`
  - `frontend/src/components/circuit/CircuitBoard.tsx`
  - `frontend/src/components/circuit/ModuleNode.tsx`
  - `frontend/src/components/circuit/NotebookCell.tsx`
  - `frontend/src/hooks/useCircuitRunner.ts`

## Known Limitations

- QDC backend is mock-mode; no live Qualcomm job submission yet.
- QDC does not currently stream completion tokens for chat turns.
- Conversational intent detection is heuristic and intentionally simple.

## Next Integration Step

- Implement live QDC API client calls inside `qdc_service.py`:
  - token validation
  - artifact upload
  - remote run submission
  - polling/log retrieval
  - result extraction mapping into existing terminal/circuit contracts
