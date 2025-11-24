@echo off
REM Code signing script for Windows
REM Copyright 2025 The Blockd Authors. All rights reserved.

echo ========================================
echo Blockd Browser - Windows Code Signing
echo ========================================
echo.

REM Set variables
set CERT_PATH=C:\Certificates\blockd_codesign.pfx
set CERT_PASSWORD=%BLOCKD_CERT_PASSWORD%
set TIMESTAMP_SERVER=http://timestamp.digicert.com
set SIGNTOOL="C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"

REM Check if certificate exists
if not exist %CERT_PATH% (
    echo ERROR: Certificate not found at %CERT_PATH%
    exit /b 1
)

REM Check if SignTool exists
if not exist %SIGNTOOL% (
    echo ERROR: SignTool not found. Please install Windows SDK.
    exit /b 1
)

echo Signing blocked.exe...
%SIGNTOOL% sign /f %CERT_PATH% /p %CERT_PASSWORD% /t %TIMESTAMP_SERVER% /v /fd SHA256 out\Release\blocked.exe

echo Signing installer...
%SIGNTOOL% sign /f %CERT_PATH% /p %CERT_PASSWORD% /t %TIMESTAMP_SERVER% /v /fd SHA256 out\Release\BlockedBrowser_Setup_v1.0.0.exe

echo.
echo Verifying signatures...
%SIGNTOOL% verify /pa /v out\Release\blocked.exe
%SIGNTOOL% verify /pa /v out\Release\BlockedBrowser_Setup_v1.0.0.exe

echo.
echo ========================================
echo Code signing completed successfully!
echo ========================================
pause
