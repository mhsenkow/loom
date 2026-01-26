#!/usr/bin/env python3
"""
Startup script for Loom backend server.
Ensures correct Python path and working directory.
"""
import sys
import os
from pathlib import Path

# Get the backend directory (where this script is located)
backend_dir = Path(__file__).parent.resolve()

# Add backend directory to Python path
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Change to backend directory
os.chdir(backend_dir)

# Now import and run uvicorn
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:socket_app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
