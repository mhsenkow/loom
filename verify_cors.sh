#!/bin/bash
# Verify CORS configuration is working correctly

echo "=== Testing CORS Configuration ==="
echo ""

echo "1. Testing OPTIONS (preflight) request:"
curl -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: content-type" \
  -v http://localhost:8000/api/modules/test 2>&1 | grep -E "(< HTTP|< access-control)"

echo ""
echo "2. Testing actual PATCH request:"
curl -X PATCH \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d '{"content":"test"}' \
  -v http://localhost:8000/api/modules/test 2>&1 | grep -E "(< HTTP|< access-control)"

echo ""
echo "=== CORS Test Complete ==="
echo ""
echo "If you see 'access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS'"
echo "and 'access-control-max-age: 0', the backend is configured correctly."
echo ""
echo "To fix browser cache issues:"
echo "1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)"
echo "2. Or open DevTools > Network tab > Check 'Disable cache'"
echo "3. Or use an incognito/private window"
