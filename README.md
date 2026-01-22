# LOOM // Personal Intelligence OS

> Retro-Terminal Edition

A local-first, desktop-class Personal Intelligence OS with a "Cassette Futurism" / "90s Mainframe" aesthetic. Think *Alien* terminals, *Metal Gear Solid* UI, or a highly polished Linux terminal.

## Features

- **Terminal Feed**: A linear notebook interface styled as a data feed/log
- **Circuit Board**: A node-graph for building AI processing pipelines
- **Local AI**: Powered by Ollama for fully local LLM inference
- **Vector Memory**: ChromaDB for semantic search and context
- **Retro Aesthetics**: CRT scanlines, phosphor green, monospace everything

## Tech Stack

### Frontend
- Electron (Desktop shell)
- React + TypeScript + Vite
- Tailwind CSS (Retro terminal theme)
- Tiptap (Headless editor)
- React Flow (Node graph)
- Socket.IO Client

### Backend
- Python 3.10+
- FastAPI + Socket.IO
- Ollama (Local LLMs)
- ChromaDB (Vector store)

## Prerequisites

1. **Node.js** (v18+)
2. **Python** (3.10+)
3. **Ollama** - Install from [ollama.ai](https://ollama.ai)

```bash
# Pull a model
ollama pull llama2
```

## Quick Start

### 1. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 2. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Start the Backend

```bash
cd backend
uvicorn app.main:socket_app --reload --port 8000
```

### 4. Start the Frontend (Dev Mode)

```bash
cd frontend
npm run dev
```

For Electron:

```bash
cd frontend
npm run electron:dev
```

## Terminal Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/ai <prompt>` | Send a prompt to the AI |
| `/models` | List available Ollama models |
| `/status` | Show system status |
| `/clear` | Clear the terminal |

Or just type naturally - any non-command input is sent to the AI.

## Project Structure

```
loom/
├── frontend/                 # Electron + React app
│   ├── electron/             # Electron main process
│   ├── src/
│   │   ├── components/
│   │   │   ├── shell/        # CRT effects, title bar
│   │   │   ├── terminal/     # Tiptap notebook
│   │   │   └── circuit/      # React Flow graph
│   │   ├── hooks/            # Socket, status hooks
│   │   ├── styles/           # Tailwind + CRT CSS
│   │   └── types/            # TypeScript interfaces
│   └── package.json
│
├── backend/                  # Python FastAPI server
│   ├── app/
│   │   ├── routers/          # REST endpoints
│   │   ├── services/         # Ollama, ChromaDB
│   │   └── models/           # Pydantic schemas
│   └── requirements.txt
│
└── README.md
```

## Design Philosophy

- **No Border Radius**: Everything is sharp, rectangular
- **Monospace Only**: JetBrains Mono for all text
- **Phosphor Green**: Primary accent color (#33ff00)
- **Void Black**: Background (#050505)
- **Brutalist UI**: Buttons invert on click, no gradients
- **CRT Effects**: Optional scanline overlay

## API Endpoints

### REST

- `GET /` - Server info
- `GET /health` - Health check (Ollama + ChromaDB status)
- `GET /api/models` - List available models
- `GET /api/modules` - List all modules
- `POST /api/modules` - Create a module
- `DELETE /api/modules/{id}` - Delete a module

### Socket.IO Events

**Client → Server:**
- `chat` - Send AI prompt `{ prompt, model }`
- `execute_module` - Run a module `{ module_id, type, inputs }`

**Server → Client:**
- `ai_chunk` - Streaming token `{ content }`
- `ai_status` - Status update `{ status, message }`
- `module_status` - Module state `{ module_id, status, output }`

## License

MIT
