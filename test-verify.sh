#!/bin/bash

# UAV-PMS Frontend - Quick Test Verification Script
# Run this after starting the dev server to verify key functionality

echo "=========================================="
echo "UAV-PMS Frontend - Test Verification"
echo "=========================================="
echo ""

# Check if server is running
echo "Checking if dev server is running..."
if curl -s http://localhost:5174 > /dev/null; then
    echo "✓ Dev server is running on http://localhost:5174"
else
    # Try next port
    if curl -s http://localhost:5174 > /dev/null; then
        echo "✓ Dev server is running (port may have changed)"
    else
        echo "✗ Dev server is not running. Start it with: npm run dev"
        exit 1
    fi
fi
echo ""

# Check build
echo "Checking if build is successful..."
if [ -d "dist" ] && [ -f "dist/index.html" ]; then
    echo "✓ Build artifacts exist"
else
    echo "⚠ No build artifacts found. Run: npm run build"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Credentials (Mock Data)"
echo "=========================================="
echo ""
echo "Admin Account:"
echo "  Username: admin"
echo "  Password: admin@123"
echo "  Expected: Full access, can see Admin menu"
echo ""
echo "Manager Account:"
echo "  Username: manager"
echo "  Password: manager@123"
echo "  Expected: Limited access, no Admin menu"
echo ""
echo "Technician Account:"
echo "  Username: technician"
echo "  Password: tech@123"
echo "  Expected: Read-only access"
echo ""
echo "Locked Account:"
echo "  Username: locked"
echo "  Password: locked@123"
echo "  Expected: 423 error, button disabled"
echo ""

echo "=========================================="
echo "Manual Test Steps"
echo "=========================================="
echo ""
echo "1. Open http://localhost:5174 in browser"
echo "2. Should redirect to /login (if not authenticated)"
echo "3. Try each credential pair above"
echo "4. Verify:"
echo "   - Login successful → dashboard"
echo "   - User avatar shows initials"
echo "   - Role badge displays with correct color"
echo "   - Admin can see all menu items"
echo "   - Others cannot see admin-only items"
echo "5. Test logout → should redirect to /login"
echo "6. Test invalid credentials → should show error"
echo ""

echo "=========================================="
echo "Build & TypeScript Check"
echo "=========================================="
npx tsc -b --noEmit && echo "✓ TypeScript compilation successful" || echo "✗ TypeScript errors found"
echo ""

echo "✓ All checks complete!"
echo ""
echo "See TEST_CASES.md for detailed test scenarios"
echo "See IMPLEMENTATION_REPORT.md for full implementation details"
