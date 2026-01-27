#!/bin/bash
# Get the local IP and display the chat URL

python3 << 'EOF'
import socket

try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(0)
    try:
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    
    print("\n" + "="*50)
    print("  LOOM CHAT - Mobile Access")
    print("="*50)
    print(f"\n  Local IP: {ip}")
    print(f"  Chat URL: http://{ip}:8000/chat")
    print(f"\n  Open this URL on your phone to access the chat!")
    print("="*50 + "\n")
except Exception as e:
    print(f"Error getting IP: {e}")
    print("You can also check: http://localhost:8000/network-info")
EOF
