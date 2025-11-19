# Third-Party Dependencies

This directory contains third-party libraries required for building Blockd Browser.

## Required Libraries

### 1. CEF (Chromium Embedded Framework)

**Purpose**: Embeds Chromium browser in the application

**Download**:
```bash
# Visit https://cef-builds.spotifycdn.com/index.html
# Download the appropriate build for your platform:
# - Linux: cef_binary_*_linux64.tar.bz2
# - macOS: cef_binary_*_macosx64.tar.bz2
# - Windows: cef_binary_*_windows64.tar.bz2

# Extract to this directory:
cd browser/third_party
tar xjf cef_binary_*.tar.bz2
mv cef_binary_* cef
```

**Version**: Any recent stable or beta build (recommend 100+ for best compatibility)

**Size**: ~500MB

**License**: BSD

### 2. nlohmann/json (Optional - can use system package)

**Purpose**: JSON parsing and serialization

**Option A - System Package (Recommended)**:
```bash
# Ubuntu/Debian
sudo apt-get install nlohmann-json3-dev

# macOS
brew install nlohmann-json

# Arch Linux
sudo pacman -S nlohmann-json
```

**Option B - Manual Download**:
```bash
cd browser/third_party
mkdir -p json/include
cd json/include
wget https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp
```

**Version**: 3.11.0+

**Size**: ~1MB (header-only)

**License**: MIT

### 3. Boost (System Package)

**Purpose**: WebSocket implementation (Boost.Beast), networking (Boost.Asio)

**Installation**:
```bash
# Ubuntu/Debian
sudo apt-get install libboost-all-dev

# macOS
brew install boost

# Windows (vcpkg)
vcpkg install boost:x64-windows
```

**Version**: 1.70.0+

**License**: Boost Software License

### 4. OpenSSL (System Package)

**Purpose**: SSL/TLS encryption for secure WebSocket connections

**Installation**:
```bash
# Ubuntu/Debian
sudo apt-get install libssl-dev

# macOS
brew install openssl

# Windows (vcpkg)
vcpkg install openssl:x64-windows
```

**Version**: 1.1.0+

**License**: Apache 2.0

## Directory Structure

After setup, this directory should look like:

```
third_party/
├── cef/                    # CEF installation
│   ├── include/
│   ├── libcef_dll/
│   ├── Release/
│   └── Resources/
└── json/                   # Optional: nlohmann/json
    └── include/
        └── nlohmann/
            └── json.hpp
```

## Build System Integration

CMakeLists.txt automatically detects these libraries:

1. **CEF**: Looks for `CEF_ROOT` (defaults to `third_party/cef`)
2. **nlohmann/json**: Searches standard paths and `third_party/json/include`
3. **Boost**: Uses system installation via `find_package`
4. **OpenSSL**: Uses system installation via `find_package`

## Troubleshooting

### CEF not found
```bash
export CEF_ROOT=/path/to/third_party/cef
cmake ..
```

### nlohmann/json not found
Option 1: Install system package (recommended)
Option 2: Download to `third_party/json/include/`

### Boost not found
Ensure development packages are installed:
- Ubuntu: `libboost-all-dev`
- Verify with: `ldconfig -p | grep boost`

### OpenSSL not found
Ensure development packages are installed:
- Ubuntu: `libssl-dev`
- Verify with: `openssl version`

## Licenses

All third-party dependencies use permissive open-source licenses:
- CEF: BSD 3-Clause
- nlohmann/json: MIT
- Boost: Boost Software License 1.0
- OpenSSL: Apache 2.0

See each library's LICENSE file for full terms.

## Version Requirements Summary

| Library | Minimum Version | Recommended | Required |
|---------|----------------|-------------|----------|
| CEF | Any stable build | 100+ | Yes |
| nlohmann/json | 3.0.0 | 3.11.0+ | Yes |
| Boost | 1.70.0 | 1.75.0+ | Yes |
| OpenSSL | 1.1.0 | 1.1.1+ | Yes |
| CMake | 3.15 | 3.20+ | Yes |
| C++ Compiler | C++17 | C++20 | Yes |

## Updates

To update dependencies:

```bash
# CEF: Download new version and replace cef/ directory
# Boost/OpenSSL: Use system package manager
sudo apt-get update && sudo apt-get upgrade

# nlohmann/json: Download latest header
cd third_party/json/include
wget https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp
```
