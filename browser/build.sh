#!/bin/bash
# Blockd Browser Build Script

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUILD_TYPE="${BUILD_TYPE:-Release}"
BUILD_TESTS="${BUILD_TESTS:-ON}"
NUM_JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo -e "${GREEN}Blockd Browser Build Script${NC}"
echo "================================"
echo "Build type: $BUILD_TYPE"
echo "Build tests: $BUILD_TESTS"
echo "Parallel jobs: $NUM_JOBS"
echo ""

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 not found${NC}"
        echo "Please install $1 and try again"
        exit 1
    fi
}

check_command cmake
check_command g++

echo -e "${GREEN}✓ Dependencies OK${NC}"
echo ""

# Check for Boost
echo -e "${YELLOW}Checking Boost...${NC}"
if ! ldconfig -p | grep -q libboost_system; then
    echo -e "${RED}Warning: Boost libraries not found in library path${NC}"
    echo "Install with: sudo apt-get install libboost-all-dev (Ubuntu/Debian)"
    echo "            or: brew install boost (macOS)"
    echo ""
fi

# Check for OpenSSL
echo -e "${YELLOW}Checking OpenSSL...${NC}"
if ! ldconfig -p | grep -q libssl; then
    echo -e "${RED}Warning: OpenSSL libraries not found${NC}"
    echo "Install with: sudo apt-get install libssl-dev (Ubuntu/Debian)"
    echo "            or: brew install openssl (macOS)"
    echo ""
fi

# Check for nlohmann/json
echo -e "${YELLOW}Checking nlohmann/json...${NC}"
if [ ! -f "/usr/include/nlohmann/json.hpp" ] && [ ! -f "/usr/local/include/nlohmann/json.hpp" ]; then
    echo -e "${YELLOW}Warning: nlohmann/json not found in standard locations${NC}"
    echo "Install with: sudo apt-get install nlohmann-json3-dev (Ubuntu/Debian)"
    echo "            or: brew install nlohmann-json (macOS)"
    echo "            or: place in browser/third_party/json/include/"
    echo ""
fi

# Create build directory
echo -e "${YELLOW}Creating build directory...${NC}"
mkdir -p build
cd build

# Run CMake
echo -e "${YELLOW}Running CMake...${NC}"
cmake .. \
    -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
    -DBUILD_TESTS=$BUILD_TESTS

# Build
echo -e "${YELLOW}Building...${NC}"
make -j$NUM_JOBS

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""

# Run tests if enabled
if [ "$BUILD_TESTS" = "ON" ]; then
    echo -e "${YELLOW}Running tests...${NC}"

    # Check if mock server is available
    if [ -f "../tests/mock_ws_server.py" ]; then
        echo "Starting mock WebSocket server..."
        python3 ../tests/mock_ws_server.py &
        SERVER_PID=$!
        sleep 2

        # Run tests
        ctest --output-on-failure
        TEST_RESULT=$?

        # Stop mock server
        kill $SERVER_PID 2>/dev/null || true

        if [ $TEST_RESULT -eq 0 ]; then
            echo -e "${GREEN}✓ All tests passed!${NC}"
        else
            echo -e "${RED}✗ Some tests failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Warning: Mock server not found, skipping integration tests${NC}"
        ctest --output-on-failure
    fi
fi

echo ""
echo -e "${GREEN}Build Summary${NC}"
echo "================================"
echo "Build directory: $(pwd)"
echo "Executables:"
ls -lh test_websocket_client 2>/dev/null || echo "  test_websocket_client (not built - CEF required)"
ls -lh blockd_browser 2>/dev/null || echo "  blockd_browser (not built - CEF required)"
echo ""
echo "To run tests manually:"
echo "  cd build"
echo "  python3 ../tests/mock_ws_server.py &"
echo "  ./test_websocket_client"
echo ""
echo "To install:"
echo "  sudo make install"
echo ""
