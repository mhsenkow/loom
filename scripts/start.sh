#!/usr/bin/env bash
# Start Notebook backend and frontend. Run from project root: ./scripts/start.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PID_FILE="$ROOT/.notebook.pids"
AUTO_SHARE="$(printf '%s' "${LOOM_AUTO_SHARE_CHAT:-false}" | tr '[:upper:]' '[:lower:]')"
SHARE_ACTIVE=false
SHARE_URL=""

# Check prerequisites
echo -e "${GREEN}==> Checking prerequisites...${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 not found. Please install Python 3.9+${NC}"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    echo -e "${RED}Error: Python 3.9+ required, but found Python $PYTHON_VERSION${NC}"
    echo -e "${YELLOW}Please upgrade Python or use pyenv to install Python 3.9+${NC}"
    exit 1
elif [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]; then
    echo -e "${YELLOW}Warning: Python 3.10+ recommended, but Python $PYTHON_VERSION should work${NC}"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: node not found. Please install Node.js 18+${NC}"
    exit 1
fi

# Optional: Cloudflare tunnel support for one-click public chat sharing
if command -v cloudflared &> /dev/null; then
    echo -e "${GREEN}✓ cloudflared is installed (public chat sharing available)${NC}"
    CLOUDFLARED_AVAILABLE=true
else
    CLOUDFLARED_AVAILABLE=false
    echo -e "${YELLOW}Info: cloudflared not found. Public chat sharing from app is unavailable.${NC}"
    echo -e "${YELLOW}      Install with: brew install cloudflared${NC}"
fi

# Mac-specific: Ensure Ollama uses Metal GPU acceleration on Apple Silicon
if [[ "$OSTYPE" == "darwin"* ]]; then
    export OLLAMA_GPU_DRIVER=metal
fi

# Check Ollama
OLLAMA_RUNNING=false
if command -v ollama &> /dev/null; then
    # Check if Ollama is already running
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        OLLAMA_RUNNING=true
        echo -e "${GREEN}✓ Ollama is running${NC}"
    else
        echo -e "${YELLOW}==> Ollama not running, starting it...${NC}"
        # Start Ollama in the background
        nohup ollama serve > /tmp/ollama.log 2>&1 &
        OLLAMA_PID=$!
        
        # Wait for Ollama to be ready (max 10 seconds)
        echo -e "${CYAN}   Waiting for Ollama to start...${NC}"
        for i in {1..20}; do
            if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
                OLLAMA_RUNNING=true
                echo -e "${GREEN}✓ Ollama started successfully${NC}"
                break
            fi
            # Check if process is still running
            if ! kill -0 "$OLLAMA_PID" 2>/dev/null; then
                echo -e "${YELLOW}Warning: Ollama process exited. Check /tmp/ollama.log for errors.${NC}"
                unset OLLAMA_PID
                break
            fi
            sleep 0.5
        done
        
        if [ "$OLLAMA_RUNNING" = false ]; then
            if [ -n "${OLLAMA_PID:-}" ]; then
                echo -e "${YELLOW}Warning: Ollama is starting but not ready yet.${NC}"
                echo -e "${YELLOW}It may take a moment. AI features will work once it's ready.${NC}"
            else
                echo -e "${YELLOW}Warning: Ollama failed to start. AI features may not work.${NC}"
                echo -e "${YELLOW}You can start it manually with: ollama serve${NC}"
            fi
        fi
    fi
else
    echo -e "${YELLOW}Warning: ollama not found. AI features will not work.${NC}"
    echo -e "${YELLOW}Install from https://ollama.ai${NC}"
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"

# Setup Python virtual environment
if [ ! -d "backend/venv" ]; then
    echo -e "${GREEN}==> Creating Python virtual environment...${NC}"
    cd backend
    python3 -m venv venv
    cd "$ROOT"
fi

# Activate virtual environment
source backend/venv/bin/activate

# Install backend dependencies
echo -e "${GREEN}==> Installing backend dependencies...${NC}"
cd backend
pip install --upgrade pip -q
pip install -r requirements.txt -q
cd "$ROOT"

# Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${GREEN}==> Installing frontend dependencies...${NC}"
    cd frontend
    npm install --silent
    cd "$ROOT"
fi

# Cleanup function
cleanup() {
    echo ""
    echo -e "${BLUE}==> Closing Notebook...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    
    # Only kill Ollama if we started it (check if OLLAMA_PID is set)
    if [ -n "${OLLAMA_PID:-}" ] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
        echo -e "${CYAN}==> Stopping Ollama (started by Notebook)...${NC}"
        kill "$OLLAMA_PID" 2>/dev/null || true
        sleep 1
        kill -9 "$OLLAMA_PID" 2>/dev/null || true
    fi
    
    rm -f "$PID_FILE"
    deactivate 2>/dev/null || true
    echo -e "${GREEN}✓ Notebook closed${NC}"
    exit 0
}

trap cleanup INT TERM

# Start backend
echo ""
echo -e "${BLUE}==> Opening Notebook...${NC}"
echo -e "${CYAN}==> Starting backend on http://localhost:8000 ...${NC}"
cd backend
$ROOT/backend/venv/bin/python run.py &
BACKEND_PID=$!
cd "$ROOT"

# Wait for backend to be ready
echo -e "${GREEN}==> Waiting for backend to be ready...${NC}"
for i in {1..60}; do
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}Error: Backend failed to start${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 0.5
done

# Start frontend
echo -e "${CYAN}==> Starting frontend on http://localhost:5173 ...${NC}"
cd frontend
npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!
cd "$ROOT"

# Save PIDs to file for stop script
echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"
# Save Ollama PID if we started it
if [ -n "${OLLAMA_PID:-}" ]; then
    echo "OLLAMA:$OLLAMA_PID" >> "$PID_FILE"
fi

# Wait a moment for frontend to start
sleep 2

# Optional: auto-share chat on startup (used by `make notebook-open-share`)
if [[ "$AUTO_SHARE" == "1" || "$AUTO_SHARE" == "true" || "$AUTO_SHARE" == "yes" ]]; then
    if [ "$CLOUDFLARED_AVAILABLE" = true ]; then
        echo -e "${CYAN}==> Starting public chat share...${NC}"
        SHARE_RESP="$(curl -s -X POST "http://localhost:8000/api/share/start" \
            -H "Content-Type: application/json" \
            -d "{\"target_url\":\"http://127.0.0.1:8000\"}")"
        SHARE_URL="$(printf '%s' "$SHARE_RESP" | python3 -c 'import json,sys
try:
    data=json.load(sys.stdin)
    print(data.get("public_chat_url",""))
except Exception:
    print("")
')"
        SHARE_ERR="$(printf '%s' "$SHARE_RESP" | python3 -c 'import json,sys
try:
    data=json.load(sys.stdin)
    print(data.get("detail",""))
except Exception:
    print("")
')"
        if [ -n "$SHARE_URL" ]; then
            SHARE_ACTIVE=true
            echo -e "${GREEN}✓ Public share active: ${SHARE_URL}${NC}"
        else
            echo -e "${YELLOW}Warning: ${SHARE_ERR:-Failed to start public share}${NC}"
        fi
    else
        echo -e "${YELLOW}Warning: Auto-share requested, but cloudflared is not installed.${NC}"
    fi
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗"
echo -e "║  ${CYAN}Notebook is open${GREEN}                                                ║"
echo -e "║                                                              ║"
echo -e "║  ${CYAN}Frontend:${NC}   ${GREEN}http://localhost:5173${NC}                           ${GREEN}║"
echo -e "║  ${CYAN}Backend:${NC}    ${GREEN}http://localhost:8000${NC}                           ${GREEN}║"
echo -e "║  ${CYAN}API docs:${NC}   ${GREEN}http://localhost:8000/docs${NC}                      ${GREEN}║"
if [ "$SHARE_ACTIVE" = true ]; then
echo -e "║  ${CYAN}Share URL:${NC}  ${GREEN}${SHARE_URL}${NC}  ${GREEN}║"
elif [ "$CLOUDFLARED_AVAILABLE" = true ]; then
echo -e "║  ${CYAN}Share:${NC}      ${GREEN}Click SHARE CHAT in the app title bar${NC}          ${GREEN}║"
else
echo -e "║  ${CYAN}Share:${NC}      ${YELLOW}Install cloudflared: brew install cloudflared${NC}  ${GREEN}║"
fi
echo -e "║                                                              ║"
echo -e "║  ${YELLOW}Press Ctrl+C to close${NC}                                      ${GREEN}║"
echo -e "║  ${YELLOW}Or run: make notebook-close${NC}                                ${GREEN}║"
echo -e "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Wait for processes
wait
