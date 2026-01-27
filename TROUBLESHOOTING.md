# Mobile Chat Troubleshooting

If the mobile chat isn't loading properly, try these steps:

## 1. Verify Backend is Running

```bash
cd loom/backend
python run.py
```

The server should show:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## 2. Get Your Local IP Address

```bash
cd loom
./get-chat-url.sh
```

Or visit: `http://localhost:8000/network-info`

## 3. Test Connectivity

From your phone's browser, try accessing:
- `http://YOUR_IP:8000/test` - Should return JSON
- `http://YOUR_IP:8000/health` - Should return health status
- `http://YOUR_IP:8000/chat` - The chat interface

## 4. Common Issues

### Issue: "Cannot reach backend"
**Solution:**
- Make sure your phone is on the same Wi-Fi network
- Check that the backend is running on `0.0.0.0:8000` (not just `127.0.0.1`)
- Verify firewall allows port 8000

### Issue: Socket.IO connection fails
**Solution:**
- Check browser console for errors
- Try accessing `/test` endpoint first to verify basic connectivity
- Make sure CORS is enabled (it should be with `allow_origins=["*"]`)

### Issue: Page loads but shows errors
**Solution:**
- Open browser developer tools (if available on mobile)
- Check the Network tab to see which requests are failing
- Look for CORS errors or 404s

## 5. Firewall Check (macOS)

If on macOS, check firewall settings:
```bash
# Check if firewall is blocking
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# If needed, allow Python through firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/bin/python3
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/bin/python3
```

## 6. Network Debugging

Test from your phone's browser:
1. First try: `http://YOUR_IP:8000/test`
2. If that works, try: `http://YOUR_IP:8000/chat`
3. Check browser console for any errors

## 7. Alternative: Use ngrok (if local network doesn't work)

If you can't get local network access working:

```bash
# Install ngrok
brew install ngrok

# Create tunnel
ngrok http 8000

# Use the ngrok URL on your phone
```
