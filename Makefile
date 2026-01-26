.PHONY: notebook-open notebook-close start stop install clean help default

# Default target - show help when just running 'make'
default: help

help:
	@./help

# Branded commands
notebook-open:
	@./scripts/start.sh

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

clean:
	@echo "Cleaning up..."
	@rm -rf backend/venv
	@rm -rf frontend/node_modules
	@rm -rf frontend/dist
	@rm -rf frontend/dist-electron
	@rm -f .notebook.pids
	@echo "Done!"
