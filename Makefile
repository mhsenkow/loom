.PHONY: notebook-open notebook-open-share notebook-close start stop install clean help default

# Default target - show help when just running 'make'
default: help

help:
	@./help

# Branded commands
notebook-open:
	@./scripts/start.sh

notebook-open-share:
	@LOOM_AUTO_SHARE_CHAT=true ./scripts/start.sh

notebook-close:
	@./scripts/stop.sh

# Legacy aliases (for backwards compatibility)
start:
	@./scripts/start.sh

stop:
	@./scripts/stop.sh

install:
	@echo "Installing backend dependencies..."
	@cd backend && python3 -m venv venv && source venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install

# Install orpheus-speech into the backend venv (CUDA only). Run after 'make install'.
install-orpheus:
	@echo "Installing orpheus-speech into backend venv..."
	@cd backend && source venv/bin/activate && pip install orpheus-speech
	@echo "Done. Restart the backend (e.g. make notebook-open) to use local Orpheus TTS."

# Install orpheus-cpp + llama-cpp-python (Metal) for local Orpheus on Mac (M1/M2/M3). Run after 'make install'.
install-orpheus-mac:
	@echo "Installing orpheus-cpp and llama-cpp-python (Metal) into backend venv..."
	@cd backend && source venv/bin/activate && pip install orpheus-cpp && pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/metal
	@echo "Done. Restart the backend (e.g. make notebook-open) to use local Orpheus TTS on Mac."

clean:
	@echo "Cleaning up..."
	@rm -rf backend/venv
	@rm -rf frontend/node_modules
	@rm -rf frontend/dist
	@rm -rf frontend/dist-electron
	@rm -f .notebook.pids
	@echo "Done!"
