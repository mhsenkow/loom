# LOOM // Personal Intelligence OS

<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/d972b27e-1a4d-40cd-9c0d-e74c2ed78e46" />

<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/9eebe68f-8896-47f3-8200-d3b529af8c8e" />


> Retro-Terminal Edition

A local-first, desktop-class Personal Intelligence OS with a "Cassette Futurism" / "90s Mainframe" aesthetic. Think *Alien* terminals, *Metal Gear Solid* UI, or a highly polished Linux terminal.

## ✨ Features

- **Terminal Feed**: A linear notebook interface styled as a data feed/log
- **Circuit Board**: A node-graph for building AI processing pipelines
- **Local AI**: Powered by Ollama for fully local LLM inference
- **Vector Memory**: ChromaDB for semantic search and context
- **File Processing**: Load and process PDFs, text files, and more
- **Image Generation**: Local image generation capabilities
- **Retro Aesthetics**: CRT scanlines, phosphor green, monospace everything

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### 1. Node.js (v18 or higher)
- Download from [nodejs.org](https://nodejs.org/)
- Verify installation: `node --version`

### 2. Python (3.10 or higher)
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

## 🚀 Quick Start

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
| `/status` | Show system status (Ollama, ChromaDB) |
| `/clear` | Clear the display; use `/restore` to bring it back |
| `/restore` | Restore content from before `/clear` |
| `/saveas <name>` | Save current session to a named slot |
| `/load <name>` | Load a saved session (replaces current) |
| `/sessions` | List saved sessions |

**Tip:** You can also just type naturally - any non-command input is automatically sent to the AI.

### Circuit Board

- Click and drag to create new modules
- Connect modules together to build AI pipelines
- Use the templates sidebar to quickly add common module types
- Right-click modules for options

### File Processing

- Use the file picker to load PDFs, text files, and other documents
- Files are automatically processed and indexed for semantic search
- Access processed files through the circuit board modules

## 🔧 Troubleshooting

### Backend won't start

- **Port 8000 already in use**: Change the port in the uvicorn command:
  ```bash
  uvicorn app.main:socket_app --reload --port 8001
  ```
  Then update the frontend connection (check `frontend/src/hooks/useSocket.ts`)

- **Python dependencies fail to install**: 
  - Make sure you're using Python 3.10+
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
│   │   │   ├── terminal/     # Tiptap notebook
│   │   │   └── circuit/      # React Flow graph, modules
│   │   ├── hooks/            # Socket, status hooks
│   │   ├── styles/           # Tailwind + CRT CSS
│   │   └── types/            # TypeScript interfaces
│   └── package.json
│
├── backend/                  # Python FastAPI server
│   ├── app/
│   │   ├── routers/          # REST endpoints (modules, files, images)
│   │   ├── services/         # Ollama, ChromaDB, file processing
│   │   └── models/           # Pydantic schemas
│   ├── data/                 # Local data storage (ChromaDB)
│   └── requirements.txt
│
└── README.md
```

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

### Socket.IO Events

**Client → Server:**
- `chat` - Send AI prompt `{ prompt, model }`
- `execute_module` - Run a module `{ module_id, type, inputs }`

**Server → Client:**
- `ai_chunk` - Streaming token `{ content }`
- `ai_status` - Status update `{ status, message }`
- `module_status` - Module state `{ module_id, status, output }`

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
- Python 3.10+
- FastAPI + Socket.IO
- Ollama (Local LLMs)
- ChromaDB (Vector store)
- PyMuPDF (PDF processing)
- Diffusers (Image generation)

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

**Need help?** Open an issue on GitHub or check the troubleshooting section above.
