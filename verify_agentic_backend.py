
import requests
import json
import os

API_BASE = "http://localhost:8000"

def test_file_write():
    print("Testing /api/files/write...")
    payload = {
        "path": "test_agentic_write.txt",
        "content": "Hello from verification script!",
        "mode": "overwrite"
    }
    try:
        res = requests.post(f"{API_BASE}/api/files/write", json=payload)
        res.raise_for_status()
        data = res.json()
        print(f"✅ Write Success: {data}")
        
        # Verify append
        payload["content"] = "\nAppended line."
        payload["mode"] = "append"
        res = requests.post(f"{API_BASE}/api/files/write", json=payload)
        res.raise_for_status()
        print(f"✅ Append Success")
        
    except Exception as e:
        print(f"❌ File Write Failed: {e}")
        try:
            print(res.text)
        except:
            pass

def test_shell_exec():
    print("\nTesting /api/system/exec...")
    payload = {
        "command": "echo 'Agentic Exec Works'",
        "timeout": 5
    }
    try:
        res = requests.post(f"{API_BASE}/api/system/exec", json=payload)
        res.raise_for_status()
        data = res.json()
        if "Agentic Exec Works" in data["stdout"]:
            print(f"✅ Exec Success: {data['stdout'].strip()}")
        else:
            print(f"❌ Exec Output Mismatch: {data}")
    except Exception as e:
        print(f"❌ Shell Exec Failed: {e}")
        try:
            print(res.text)
        except:
            pass

if __name__ == "__main__":
    test_file_write()
    test_shell_exec()
