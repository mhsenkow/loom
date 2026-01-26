#!/usr/bin/env bash
# Stop LOOM backend and frontend servers
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PID_FILE="$ROOT/.notebook.pids"

echo -e "${BLUE}==> Closing Notebook...${NC}"

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}No running Notebook instance found (no PID file)${NC}"
    echo -e "${YELLOW}Attempting to find and stop processes by port...${NC}"
    
    # Try to find processes by port
    BACKEND_PID=$(lsof -ti:8000 2>/dev/null || true)
    FRONTEND_PID=$(lsof -ti:5173 2>/dev/null || true)
    
    if [ -z "$BACKEND_PID" ] && [ -z "$FRONTEND_PID" ]; then
        echo -e "${YELLOW}No Notebook processes found running${NC}"
        exit 0
    fi
else
    # Read PIDs from file
    BACKEND_PID=$(head -n 1 "$PID_FILE" 2>/dev/null || true)
    FRONTEND_PID=$(sed -n '2p' "$PID_FILE" 2>/dev/null || true)
    # Check if we started Ollama (line starting with OLLAMA:)
    OLLAMA_LINE=$(grep "^OLLAMA:" "$PID_FILE" 2>/dev/null || true)
    if [ -n "$OLLAMA_LINE" ]; then
        OLLAMA_PID=$(echo "$OLLAMA_LINE" | cut -d: -f2)
    fi
fi

# Stop backend
if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo -e "${GREEN}==> Stopping backend (PID: $BACKEND_PID)...${NC}"
    kill "$BACKEND_PID" 2>/dev/null || true
    sleep 1
    # Force kill if still running
    kill -9 "$BACKEND_PID" 2>/dev/null || true
else
    echo -e "${YELLOW}Backend not running${NC}"
fi

# Stop frontend
if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo -e "${GREEN}==> Stopping frontend (PID: $FRONTEND_PID)...${NC}"
    kill "$FRONTEND_PID" 2>/dev/null || true
    sleep 1
    # Force kill if still running
    kill -9 "$FRONTEND_PID" 2>/dev/null || true
else
    echo -e "${YELLOW}Frontend not running${NC}"
fi

# Stop Ollama if we started it
if [ -n "${OLLAMA_PID:-}" ] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
    echo -e "${GREEN}==> Stopping Ollama (started by Notebook) (PID: $OLLAMA_PID)...${NC}"
    kill "$OLLAMA_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$OLLAMA_PID" 2>/dev/null || true
fi

# Clean up PID file
rm -f "$PID_FILE"

# Also try to kill any remaining processes on the ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo -e "${GREEN}✓ Notebook closed${NC}"
