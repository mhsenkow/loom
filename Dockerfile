# LOOM — one image: frontend + backend. "Just a working app."
# Build: docker compose up --build
# Run:   docker compose up
# App:   http://localhost:8000 (Ollama on host at OLLAMA_HOST)

# ─── Stage 1: build frontend ───
FROM node:20-alpine AS frontend
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
# Same-origin API when served from backend (Docker)
ENV VITE_API_BASE_URL=
# Web app only (no Electron; we serve dist/ from the backend)
RUN npm run build:renderer

# ─── Stage 2: backend + serve frontend ───
FROM python:3.11-slim
WORKDIR /app/backend

# Backend deps (requirements-docker.txt lives in repo root as backend/requirements-docker.txt)
COPY backend/requirements-docker.txt requirements-docker.txt
RUN pip install --no-cache-dir -r requirements-docker.txt

COPY backend ./
# Serve built frontend from backend
COPY --from=frontend /app/frontend/dist ./frontend_dist

ENV LOOM_SERVE_FRONTEND=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "app.main:socket_app", "--host", "0.0.0.0", "--port", "8000"]
