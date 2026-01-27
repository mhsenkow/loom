# Remote Control Setup

## Default Model
The default AI model used in mobile chat is: **`llama3.1:8b`**

You can see this in the chat code - it's hardcoded but can be changed.

## Getting Remote Commands to Work

### Step 1: Restart the Backend
The new remote router needs to be loaded. **Restart your backend server:**

```bash
# Stop the current backend (Ctrl+C)
# Then restart:
cd loom/backend
python run.py
```

### Step 2: Test the Remote Router
From your phone, try:
```
http://YOUR_IP:8000/api/remote/test
```

Should return:
```json
{
  "status": "ok",
  "message": "Remote router is active",
  "endpoints": [...]
}
```

### Step 3: Try Commands in Chat
In the mobile chat, try:
- `/help` - Should show commands and verify remote router
- `/status` - Should show system status
- `/cmd ls` - Should execute a command

## Troubleshooting

If commands don't work:

1. **Check backend logs** - Look for import errors
2. **Verify router is loaded** - Check that `/api/remote/test` works
3. **Check browser console** - Open developer tools on phone to see errors
4. **Try from computer first** - Test `http://localhost:8000/api/remote/test`

## Available Commands

- `/status` - System status
- `/processes` - Top processes
- `/files <path>` - List files
- `/read <file>` - Read file
- `/cmd <command>` - Execute command
- `/help` - Show all commands
