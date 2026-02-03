@echo off
REM Blockd Browser - Windows Build Dependencies Installer
REM Run this script as Administrator

echo ============================================
echo Blockd Browser Build Dependencies Installer
echo ============================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires administrator privileges.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Installing build dependencies for Chromium...
echo.

REM Install NSIS for creating installers
echo [1/2] Installing NSIS (Nullsoft Install System)...
winget install NSIS.NSIS --accept-package-agreements --accept-source-agreements --silent
if %errorLevel% neq 0 (
    echo WARNING: NSIS installation failed or was skipped
) else (
    echo NSIS installed successfully
)
echo.

REM Install Visual Studio 2022 Community with C++ workload
echo [2/2] Installing Visual Studio 2022 Community with C++ Desktop Development...
echo This may take 30-60 minutes depending on your internet connection.
echo.
winget install Microsoft.VisualStudio.2022.Community --accept-package-agreements --accept-source-agreements --override "--wait --add Microsoft.VisualStudio.Workload.NativeDesktop --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --add Microsoft.VisualStudio.Component.VC.ATL --includeRecommended"
if %errorLevel% neq 0 (
    echo WARNING: Visual Studio installation failed or was skipped
    echo You can manually install Visual Studio 2022 from:
    echo https://visualstudio.microsoft.com/downloads/
    echo.
    echo Required workloads:
    echo - Desktop development with C++
    echo - Windows 11 SDK (10.0.22621 or later)
    echo - C++ ATL for latest v143 build tools
) else (
    echo Visual Studio 2022 installed successfully
)

echo.
echo ============================================
echo Installation Complete!
echo ============================================
echo.
echo Next steps:
echo 1. Restart your terminal/IDE
echo 2. Run: cd chromium ^&^& setup.sh
echo 3. Wait for Chromium source to download (~30GB)
echo 4. Run: ./build.sh
echo.
pause
