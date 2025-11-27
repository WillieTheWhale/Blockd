@echo off
REM Build installer for Blockd Browser on Windows
REM Copyright 2025 The Blockd Authors. All rights reserved.

echo ========================================
echo Blockd Browser - Installer Build
echo ========================================
echo.

REM Set paths
set NSIS_PATH=C:\Program Files (x86)\NSIS\makensis.exe
set BUILD_DIR=out\Release
set INSTALLER_SCRIPT=installer\windows\blocked_installer.nsi

REM Check if NSIS is installed
if not exist "%NSIS_PATH%" (
    echo ERROR: NSIS not found. Please install NSIS from https://nsis.sourceforge.io/
    exit /b 1
)

REM Check if build directory exists
if not exist %BUILD_DIR% (
    echo ERROR: Build directory not found. Please build Chromium first.
    exit /b 1
)

echo Building installer with NSIS...
"%NSIS_PATH%" /V4 %INSTALLER_SCRIPT%

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Installer build failed!
    exit /b 1
)

echo.
echo ========================================
echo Installer built successfully!
echo Output: %BUILD_DIR%\BlockedBrowser_Setup_v1.0.0.exe
echo ========================================
echo.
echo Next steps:
echo 1. Run sign.bat to code sign the installer
echo 2. Test the installer on a clean Windows VM
echo 3. Upload to distribution server
echo.
pause
