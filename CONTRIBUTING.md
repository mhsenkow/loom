# Contributing to LOOM

Contributions are welcome. This document explains how to get set up and submit changes.

## Development setup

- **Prerequisites:** Node.js 18+, Python 3.10+, Ollama (see [README.md](README.md)).
- **Run locally:** `make notebook-open` (or `./start`). Frontend: http://localhost:5173, backend: http://localhost:8000.
- **Run with Docker:** `make dock-notebook`. Single app at http://localhost:8000.

## Making changes

1. Fork the repo and create a branch.
2. Backend: from `backend/`, run tests with `pytest` (optional: use the project’s venv).
3. Frontend: from `frontend/`, run `npm run test` and `npm run build` (or rely on CI).
4. Keep the retro terminal aesthetic and local-first defaults where relevant.

## Submitting changes

- Open a pull request against `main` (or the default branch).
- Describe what you changed and why; reference any related issues.
- Ensure CI passes (TypeScript, build, and any backend tests that run in CI).

## Docs and design

- Feature docs live in the repo root (e.g. `CHROMADB_INTEGRATION.md`, `CLOUD_ORCHESTRATION_AND_QDC.md`).
- Design tokens and UI philosophy: see README “Design Philosophy” and `WPF_DESIGN_TOKENS.md` if present.

Thanks for contributing.
