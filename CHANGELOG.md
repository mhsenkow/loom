# Changelog

All notable changes to LOOM are documented in this file.

## [Unreleased] - 2026-02-13

### Added
- QDC packaging flows:
  - `POST /api/qdc/package`
  - `POST /api/qdc/package-and-run`
  - terminal commands `/qdc package`, `/qdc package-model`, `/qdc ship`, `/qdc ship-model`, `/qdc relay`
- QDC packager internals in `qdc_service` with manifest generation, startup scripts, package-kind metadata, and max-file safety limit (`LOOM_QDC_MAX_PACKAGE_FILES`).
- Conversation profile utilities and tests (`conversationProfile`) for goal + memory prompt shaping.
- Local maintenance queue utilities and tests (`maintenanceQueue`) for actionable follow-up tracking.
- Memory vault utilities and tests (`memoryVault`) with tiering, TTL, relevance scoring, and legacy note sync.
- Download telemetry utility (`downloadTelemetry`) for model/image transfer UI instrumentation.
- Electron maximize/full-screen state bridge (`isMaximized`, `onMaximizedChange`) and unsaved-circuit close confirmation path.

### Changed
- Provider routing now resolves execution targets with local-first model disambiguation and Mistral alias normalization (`resolve_model_target`).
- Orchestrator/user-message extraction now handles the `Latest User Message:` prompt contract.
- Conversation prompt builder now emits structured context blocks and explicit single-reply policy guardrails.
- Local image model loading now ensures local snapshot download with progress callbacks and deterministic local directory usage.
- Image model listing now reports downloaded local models from the managed local model directory instead of legacy cache-only checks.
- CRT shell effects now support configurable noise, bloom, jitter, and scan drift controls.

### Security
- Removed live token material from `backend/data/cloud_providers.json` and restored placeholder values.

### Developer Experience
- Ignored generated QDC package artifacts via `.gitignore` (`backend/data/qdc_packages/`) to keep PRs clean.
- Expanded tests for provider target resolution and QDC package + run lifecycle.
