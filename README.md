# LOOM // Personal Intelligence OS or "What if my AI UI was fun"

feedback is a gift

<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/dfc9e8e9-8c69-4b9f-a149-4372fe9a6507" />


<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/23072505-1b8f-41a8-88a7-d3815a4ad8dc" />


<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/d972b27e-1a4d-40cd-9c0d-e74c2ed78e46" />

<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/9eebe68f-8896-47f3-8200-d3b529af8c8e" />


> Retro-Terminal Edition

A local-first, desktop-class Personal Intelligence OS with a "Cassette Futurism" / "90s Mainframe" aesthetic. Think *Alien* terminals, *Metal Gear Solid* UI, or a highly polished Linux terminal.

## ✨ Features

- **Terminal Feed**: A linear notebook interface styled as a data feed/log with session management
- **Circuit Board**: A node-graph for building AI processing pipelines with templates
- **Local-First AI**: Powered by Ollama for fully local LLM inference
- **Auto Orchestrator**: Intent-aware model selection with session stickiness and model-switch events
- **Quick Cloud Lane**: `/quick` routes low-priority asks to free/cheap cloud models when connected
- **Conversational Action Assist**: In-chat `yes / edit: / no` confirmation flow for image/music/speech/QDC actions
- **Vector Memory**: ChromaDB for semantic search, RAG, and document indexing
- **Image Analysis**: Vision model integration for analyzing images (LLaVA, BakLLaVA, Moondream)
- **File Processing**: Load and process PDFs, text files, and other documents
- **Image + Music Generation**: Local image generation and ACE-Step music generation
- **Speech Stack**: Voice chat modal + browser/Orpheus TTS with streaming speech options
- **Cloud Providers**: OpenAI, Anthropic, Gemini, Mistral, DeepSeek, OpenRouter, and QDC connector card
- **QDC Async Job Lane**: Upload/run/status/results flow with terminal/socket progress updates
- **Session Management**: Save, load, and restore sessions
- **Circuit Persistence**: Save and load complete circuit configurations
- **Retro Aesthetics**: CRT scanlines, phosphor green, monospace everything

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### 1. Node.js (v18 or higher)
- Download from [nodejs.org](https://nodejs.org/)
- Verify installation: `node --version`

### 2. Python (3.9 or higher, 3.10+ recommended)
- Download from [python.org](https://www.python.org/downloads/)
- Verify installation: `python --version` or `python3 --version`

### 3. Ollama (Required for AI features)
- Install from [ollama.ai](https://ollama.ai)
- After installation, pull at least one model:
  ```bash
  ollama pull llama2
  # or
  ollama pull mistral
  # or any other model you prefer
  ```
- Verify Ollama is running: `ollama list`

### 4. Git (for cloning the repository)
- Download from [git-scm.com](https://git-scm.com/)

### 5. Optional Cloud Keys / Tokens
- Cloud chat/image providers are optional and can be configured in **Cloud Providers** modal.
- QDC is supported as an async remote job connector (not direct chat-completions).

## 🚀 Quick Start

**💡 Tip:** Not sure what to do? Run `make help` or `./help` to see all available commands!

### 🎯 One-Command Start (Recommended)

After cloning the repository, you can open Notebook with a single command:

```bash
cd loom
make notebook-open
```

Or using the direct script:

```bash
cd loom
./start
```

This will:
- ✅ Check prerequisites (Python, Node.js, Ollama)
- ✅ Set up Python virtual environment automatically
- ✅ Install all dependencies (backend + frontend)
- ✅ Start both backend and frontend servers
- ✅ Display URLs when ready

**That's it!** Open http://localhost:5173 in your browser.

### Closing Notebook

To close Notebook, you can:

- Press `Ctrl+C` in the terminal where it's running
- Or run: `make notebook-close` in a new terminal
- Or run: `./close` from the project root

### All Available Commands

```bash
# Open Notebook (start all services)
make notebook-open
# or
./start

# Close Notebook (stop all services)
make notebook-close
# or
./close

# Install dependencies
make install

# Clean up (remove dependencies and build artifacts)
make clean

# Show help
make help
```

---

### Manual Setup (Alternative)

If you prefer to set up manually or the one-command start doesn't work:

### Step 1: Clone the Repository

```bash
git clone https://github.com/mhsenkow/loom.git
cd loom
```

### Step 2: Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**Note:** On macOS/Linux, you may need to use `pip3` instead of `pip`. If you encounter permission errors, use a virtual environment:

```bash
# Create virtual environment
python3 -m venv venv

# Activate it (macOS/Linux)
source venv/bin/activate

# Activate it (Windows)
venv\Scripts\activate

# Then install dependencies
pip install -r requirements.txt
```

### Step 3: Install Frontend Dependencies

Open a new terminal window/tab:

```bash
cd frontend
npm install
```

### Step 4: Start the Backend Server

In the backend directory:

```bash
# Make sure you're in the backend directory
cd backend

# Start the server
uvicorn app.main:socket_app --reload --port 8000
```

You should see output like:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**Keep this terminal open** - the backend needs to keep running.

### Step 5: Start the Frontend

Open a **new terminal window/tab** and navigate to the frontend directory:

```bash
cd frontend
npm run dev
```

This will start the Vite dev server. You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 6: Open in Browser

Open your browser and navigate to: **http://localhost:5173**

You should see the LOOM interface!

## ⚙️ Environment Configuration

Optional environment variables for safer/localized deployments:

- `LOOM_ALLOWED_ORIGINS` (backend): comma-separated CORS allowlist.  
  Example: `LOOM_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`
- `LOOM_LOG_LEVEL` (backend): app log level (`DEBUG|INFO|WARNING|ERROR`, default `INFO`).
- `LOOM_ACCESS_LOG` (backend): enable uvicorn access logs (`true`/`false`, default `false`).
- `LOOM_HTTP_CLIENT_LOG_LEVEL` (backend): log level for internal `httpx/httpcore` logs (default `WARNING`).
- `LOOM_SOCKETIO_LOG` (backend): enable Socket.IO internal logs (`true`/`false`, default `false`).
- `LOOM_ENGINEIO_LOG` (backend): enable Engine.IO transport logs (`true`/`false`, default `false`).
- `LOOM_QUIET_REQUEST_PATHS` (backend): comma-separated endpoint paths that are logged at `DEBUG` for successful requests (default `/health,/api/images/models,/api/code-context/status,/api/sessions`).
- `LOOM_WEB_API_KEY` (backend): if set, `/api/web/*` endpoints require `X-LOOM-API-KEY`.
- `LOOM_WEB_RATE_LIMIT_PER_MIN` (backend): requests per minute limit for `/api/web/*` endpoints (default `60`).
- `LOOM_INTERNAL_API_BASE_URL` (backend): internal base URL used by backend services for internal API calls (default `http://localhost:8000`).
- `LOOM_RUN_CLEANUP_ON_STARTUP` (backend): run generated-media cleanup on startup (`true`/`false`, default `true`).
- `LOOM_GENERATED_MEDIA_RETENTION_DAYS` (backend): remove generated images/music older than N days on startup (default `14`).
- `LOOM_QDC_MODE` (backend): QDC execution mode (currently `mock`).
- `LOOM_QDC_MOCK_STEP_S` (backend): QDC mock progress pacing in seconds per step (default `0.35`).
- `LOOM_QDC_PACKAGE_DIR` (backend): optional output directory for generated QDC package `.zip` files.
- `LOOM_QDC_MAX_PACKAGE_FILES` (backend): maximum files allowed per generated QDC package (default `12000`).
- `VITE_API_BASE_URL` (frontend): backend API base URL for the web app (default `http://localhost:8000`).

## 🖥️ Running as Electron Desktop App

To run LOOM as a desktop application:

1. Make sure both backend and frontend dev servers are running (steps 4 & 5)
2. In a new terminal, navigate to the frontend directory:

```bash
cd frontend
npm run electron:dev
```

This will open LOOM in an Electron window with the retro terminal aesthetic.

## 💻 Usage

### Terminal Commands

Once LOOM is running, you can use these commands in the terminal:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/ai <prompt>` | Send a prompt to the AI |
| `/models` | List available Ollama models |
| `/setup-models` | Pull baseline stack (tiny/chat/image/music) if missing |
| `/quick <question>` | Route low-priority ask to fast free/cheap cloud lane |
| `/status` | Show system status (Ollama, ChromaDB) |
| `/clear` | Clear the display; use `/restore` to bring it back |
| `/restore` | Restore content from before `/clear` |
| `/saveas <name>` | Save current session to a named slot |
| `/load <name>` | Load a saved session (replaces current) |
| `/sessions` | List saved sessions |
| `/goals` | Show active user and assistant goals |
| `/goal user ...` | Add/update user goals |
| `/goal assistant ...` | Add/update assistant goals |
| `/memory` | Show long-term memory notes |
| `/remember [tier] <fact> [@0-1]` | Add memory with optional tier/confidence |
| `/forget <index>` | Remove one memory note by index |
| `/mission ...` | Manage session objective / next / blocker |
| `/improve ...` | Manage maintenance queue (`list/add/done/clear`) |
| `/eval` | Show agent quality snapshot from live telemetry |
| `/image` | Upload and analyze an image with vision models |
| `/song <style>` | Open quick music generation flow |
| `/qdc status` | Show QDC connector and remote lane status |
| `/qdc jobs` | List recent QDC jobs |
| `/qdc run <prompt>` | Start async QDC remote job |
| `/qdc package <path>` | Build a QDC-ready `.zip` package from file/folder |
| `/qdc package-model <path>` | Build a QDC `.zip` for AI Model upload type |
| `/qdc ship <path> :: <prompt>` | Package + upload + run in one command |
| `/qdc ship-model <path> :: <prompt>` | Package model + upload + run |
| `/qdc relay <prompt>` | Continue chat using latest QDC cloud output as context |

**Tip:** You can also type naturally. Non-command input goes to chat unless it is detected as an action request (image/music/speech/QDC), in which case LOOM asks for `yes`, `edit: ...`, or `no`.

### Model Routing & Cloud Lanes

- `auto` chat mode uses the orchestrator to pick models based on intent, speed/cost/quality settings, and prior model stickiness.
- `/quick` explicitly targets the fast lane and prefers free/cheap cloud models (Gemini/OpenRouter/open mini-class models), with local tiny-model fallback.
- Cloud models are listed in a unified catalog alongside local models.
- QDC is treated as a **job lane**, not a token-streaming chat provider.

### Conversational Action Assist

LOOM can turn plain-language requests into assisted actions:

- Example: “make a poster for my event” -> suggests image action -> reply `yes` to run.
- Example: “compose lo-fi study music” -> suggests music action -> `yes` launches music generation.
- Example: “use qdc for this remote run” -> suggests QDC job action -> `yes` starts async job.
- Example: “read this aloud” -> suggests speech mode action.

### Circuit Board

- Click and drag to create new modules
- Connect modules together to build AI pipelines
- Use the templates sidebar to quickly add common module types
- Right-click modules for options

### File Processing & Vector Store

- Use the file picker to load PDFs, text files, and other documents
- Files are automatically processed and indexed for semantic search
- Use INDEX and SEARCH cell types for vector store operations
- Access processed files through the circuit board modules
- Build knowledge bases with automatic document indexing

### Image Analysis

- Upload images using the 📷 button or `/image` command
- Analyze images with vision models (LLaVA, BakLLaVA, Moondream)
- Vision models are automatically detected and recommended
- Analysis results can be sent to chat for further discussion
- Install vision models with: `ollama pull llava:7b` or `ollama pull bakllava`

### Circuit Templates

- Pre-built templates for common workflows (RAG, research, analysis)
- Templates sidebar for quick access
- Save and load complete circuit configurations
- Share circuits by name

## 🔧 Troubleshooting

### Backend won't start

- **Port 8000 already in use**: Change the port in the uvicorn command:
  ```bash
  uvicorn app.main:socket_app --reload --port 8001
  ```
  Then update the frontend connection (check `frontend/src/hooks/useSocket.ts`)

- **Python dependencies fail to install**: 
  - Make sure you're using Python 3.9+ (3.10+ recommended)
  - Try upgrading pip: `pip install --upgrade pip`
  - On macOS, you may need: `pip3 install -r requirements.txt`

- **Ollama connection errors**: 
  - Make sure Ollama is running: `ollama list`
  - Verify Ollama is accessible: `curl http://localhost:11434/api/tags`

### Frontend won't start

- **Port 5173 already in use**: Vite will automatically try the next available port
- **npm install fails**: 
  - Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
  - Make sure you have Node.js v18+

### AI features not working

- **No models available**: Pull a model with `ollama pull llama2`
- **Model not responding**: Check Ollama is running and the model name is correct
- **Connection refused**: Ensure the backend server is running on port 8000
- **`/quick` uses local fallback unexpectedly**: Connect a cloud provider in the Providers modal and retry
- **QDC run fails immediately**: Ensure Qualcomm QDC token is connected in Providers (`/qdc status` should show connected)

### Electron app issues

- **Window doesn't open**: Make sure the Vite dev server is running first
- **Blank screen**: Check the browser console for errors (DevTools should open automatically)

## 📁 Project Structure

```
loom/
├── frontend/                 # Electron + React app
│   ├── electron/             # Electron main process
│   ├── src/
│   │   ├── components/
│   │   │   ├── shell/        # CRT effects, title bar, settings
│   │   │   ├── terminal/     # Tiptap notebook, orchestration, providers, image/music flows
│   │   │   └── circuit/      # React Flow graph, modules, templates, QDC nodes
│   │   ├── hooks/            # Socket, status, circuit runner hooks
│   │   ├── styles/           # Tailwind + CRT CSS
│   │   └── types/            # TypeScript interfaces
│   └── package.json
│
├── backend/                  # Python FastAPI server
│   ├── app/
│   │   ├── routers/          # REST endpoints (modules, files, images, circuits, providers, qdc, search)
│   │   ├── services/         # Ollama, ChromaDB, orchestrator, qdc lane, file processing, storage
│   │   └── models/           # Pydantic schemas
│   ├── data/                 # Local data storage (ChromaDB, SQLite)
│   ├── scripts/              # Template extraction and testing scripts
│   └── requirements.txt
│
├── scripts/                  # Startup/shutdown scripts
├── Makefile                  # Convenience commands
├── start, close, help        # Executable scripts
└── README.md
```

## 📚 Additional Documentation

- **[CHROMADB_INTEGRATION.md](./CHROMADB_INTEGRATION.md)** - Complete guide to vector store and RAG
- **[VECTOR_CELLS_GUIDE.md](./VECTOR_CELLS_GUIDE.md)** - Simple guide to INDEX and SEARCH cells
- **[LOCAL_CONVERSATIONAL_AI.md](./LOCAL_CONVERSATIONAL_AI.md)** - Local conversation + streaming speech stack details
- **[CLOUD_ORCHESTRATION_AND_QDC.md](./CLOUD_ORCHESTRATION_AND_QDC.md)** - Orchestrator routing, quick lane, providers, and QDC job lane
- **[TEMPLATE_UPDATES.md](./TEMPLATE_UPDATES.md)** - Available circuit templates
- **[MODULE_PERSISTENCE_IMPLEMENTATION.md](./MODULE_PERSISTENCE_IMPLEMENTATION.md)** - How module storage works
- **[STORAGE_ANALYSIS.md](./STORAGE_ANALYSIS.md)** - Storage architecture details

## 🎨 Design Philosophy

- **No Border Radius**: Everything is sharp, rectangular
- **Monospace Only**: JetBrains Mono for all text
- **Phosphor Green**: Primary accent color (#33ff00)
- **Void Black**: Background (#050505)
- **Brutalist UI**: Buttons invert on click, no gradients
- **CRT Effects**: Optional scanline overlay

## 🔌 API Endpoints

### REST

- `GET /` - Server info
- `GET /health` - Health check (Ollama + ChromaDB status)
- `GET /api/models` - List available Ollama models
- `GET /api/modules` - List all modules
- `POST /api/modules` - Create a module
- `DELETE /api/modules/{id}` - Delete a module
- `GET /api/files` - List processed files
- `POST /api/files/upload` - Upload and process a file
- `POST /api/images/generate` - Generate an image
- `POST /api/images/analyze` - Analyze an image with vision models
- `GET /api/images/check-vision-models` - Check available vision models
- `GET /api/circuits` - List saved circuits
- `POST /api/circuits` - Save a circuit
- `GET /api/circuits/{name}` - Get a saved circuit
- `GET /api/search` - Semantic search across indexed documents
- `GET /api/providers` - List cloud providers and capabilities
- `GET /api/providers/models/all` - Unified local+cloud model catalog
- `GET /api/providers/quick-model` - Suggest fast/low-cost model for `/quick`
- `GET /api/qdc/status` - QDC lane status
- `POST /api/qdc/upload` - Upload artifact path for QDC lane
- `POST /api/qdc/jobs` - Start async QDC job
- `GET /api/qdc/jobs` - List recent QDC jobs
- `GET /api/qdc/jobs/{id}` - Get QDC job status
- `GET /api/qdc/jobs/{id}/logs` - Get QDC job logs
- `GET /api/qdc/jobs/{id}/results` - Get QDC job result
- `POST /api/qdc/jobs/{id}/rerun` - Rerun QDC job
- `POST /api/qdc/jobs/{id}/cancel` - Cancel QDC job

### Socket.IO Events

**Client → Server:**
- `chat` - Send AI prompt `{ prompt, model }`
- `execute_module` - Run a module `{ module_id, type, inputs }`
- `pull_model` - Pull Ollama model with progress

**Server → Client:**
- `ai_chunk` - Streaming token `{ content }`
- `ai_status` - Status update `{ status, message }`
- `module_status` - Module state `{ module_id, status, output }`
- `orchestrator_event` - Circuit/model suggestion or auto-switch details
- `pull_status` - Model pull progress `{ status, model, percent, message }`
- `qdc_job_event` - QDC async job progress/status updates

## 🛠️ Development

### Backend Development

```bash
cd backend
uvicorn app.main:socket_app --reload --port 8000
```

The `--reload` flag enables auto-reload on code changes.

### Frontend Development

```bash
cd frontend
npm run dev
```

Hot module replacement is enabled by default.

### Building for Production

**Frontend:**
```bash
cd frontend
npm run build
```

**Electron:**
```bash
cd frontend
npm run electron:build
```

## 📝 Tech Stack

### Frontend
- Electron (Desktop shell)
- React + TypeScript + Vite
- Tailwind CSS (Retro terminal theme)
- Tiptap (Headless editor)
- React Flow (Node graph)
- Socket.IO Client

### Backend
- Python 3.9+ (3.10+ recommended)
- FastAPI + Socket.IO
- Ollama (Local LLMs + Vision models)
- ChromaDB (Vector store for RAG)
- SQLite (Circuit and session persistence)
- PyMuPDF (PDF processing)
- Diffusers (Image generation)
- Transformers (Local ML models)

## 🎯 Current Status

**✅ Fully Working:**
- Terminal feed with session management
- Circuit board with node-based workflows
- AI chat with local/cloud routing
- Intent-aware orchestrator with auto model switching + model-switch notifications
- Quick lane (`/quick`) with free/cheap cloud preference and tiny local fallback
- Vector store with ChromaDB (INDEX/SEARCH cells)
- File processing and indexing
- Image analysis with vision models
- Image + music generation panels and command flows
- Conversational action-confirm flow (`yes` / `edit:` / `no`) for image/music/speech/QDC
- QDC async lane (upload, run, status, logs, results, rerun/cancel)
- Circuit QDC nodes (`qdc_upload`, `qdc_run`, `qdc_status`, `qdc_results`)
- Circuit templates and persistence
- Session save/load/restore

**🚧 In Development:**
- Live Qualcomm QDC API execution backend (current lane is mock-backed for UX integration)
- Enhanced RAG workflows and more circuit templates
- Advanced image generation features and performance optimizations

**📋 Planned:**
- Multi-user support
- Cloud sync (optional)
- Plugin system
- Advanced visualization tools

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

**Need help?** Open an issue on GitHub or check the troubleshooting section above.
