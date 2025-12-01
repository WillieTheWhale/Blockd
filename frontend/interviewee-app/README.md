# Blockd Interviewee App

A secure Electron-based desktop application for interview candidates. This app provides a controlled environment for joining video meetings (Google Meet, Zoom, Microsoft Teams) while streaming video/audio to the Blockd backend for security monitoring and AI-powered analysis.

## Features

- **Secure Authentication**: JWT-based authentication with the Blockd backend
- **Meeting Platform Integration**: Embed Google Meet, Zoom, or Microsoft Teams directly in the app
- **Video/Audio Streaming**: Stream interview content to backend for analysis
- **Security Monitoring**: Detect suspicious processes, VMs, and window focus changes
- **Eye Tracking Ready**: Infrastructure for gaze tracking data transmission

## Prerequisites

Before running the interviewee app, ensure you have:

1. **Node.js 20+** (LTS recommended)
2. **npm 10+** or **yarn**
3. **Backend services running** (see main project README)

## Quick Start

### 1. Clone and Navigate

```bash
cd /path/to/Blockd/frontend/interviewee-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your backend URLs:

```env
BLOCKD_API_URL=http://localhost:3000
BLOCKD_WS_URL=http://localhost:3003
BLOCKD_VIDEO_URL=http://localhost:8003
NODE_ENV=development
```

### 4. Start the Backend (Required)

In a separate terminal, ensure all backend services are running:

```bash
# From the Blockd root directory
docker-compose up -d
```

Wait for all services to be healthy before proceeding.

### 5. Run the App (Development)

```bash
npm start
```

This will:
- Build the TypeScript code
- Launch the Electron app in development mode
- Open DevTools automatically for debugging

### 6. Build for Production

```bash
# Build for your current platform
npm run make

# The packaged app will be in the 'out' directory
```

## Usage Guide

### 1. Login / Register

When you first launch the app:

1. Click **"Create one"** if you don't have an account
2. Fill in your details (name, email, password)
3. Click **"Create Account"**

Or if you already have an account:

1. Enter your email and password
2. Click **"Sign In"**

### 2. Select Meeting Platform

After logging in:

1. Choose your meeting platform (Google Meet, Zoom, or Microsoft Teams)
2. Paste your meeting URL in the input field
3. Click **"Join Meeting"**

### 3. Grant Permissions

When prompted:

1. Click **"Grant Permissions & Start"**
2. Allow screen capture access when the system dialog appears
3. Allow camera and microphone access

### 4. Join Your Interview

The meeting will load in an embedded browser view. You can:

- Use the meeting as you normally would
- Your video/audio is being streamed to the backend for analysis
- Security monitoring runs in the background

### 5. End Session

When your interview is complete:

1. Leave the meeting in the video platform
2. Click **"End Session"** in the app header
3. Confirm when prompted

## Development

### Project Structure

```
interviewee-app/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # App entry point
│   │   ├── ipc-handlers.ts # IPC communication
│   │   ├── session-manager.ts # Backend auth/session
│   │   ├── security-monitor.ts # Security monitoring
│   │   └── media-streaming.ts # WebRTC streaming
│   ├── preload/
│   │   └── preload.ts     # Context bridge (secure IPC)
│   └── renderer/          # React frontend
│       ├── App.tsx        # Main app component
│       ├── pages/         # Page components
│       ├── stores/        # Zustand state stores
│       └── types/         # TypeScript types
├── forge.config.ts        # Electron Forge config
├── vite.*.config.ts       # Vite build configs
└── package.json
```

### Key Technologies

- **Electron 34**: Desktop app framework (Chromium 132, Node 20.18)
- **React 18**: UI framework
- **TypeScript 5.7**: Type safety
- **Zustand 5**: State management
- **Socket.io Client 4**: WebSocket communication
- **mediasoup-client 3**: WebRTC streaming
- **Electron Forge**: Build and packaging

### Available Scripts

```bash
# Development
npm start              # Run in development mode
npm run dev            # Same as start

# Building
npm run build          # Build TypeScript only
npm run make           # Build + package for distribution

# Packaging
npm run package        # Package without making installers
npm run publish        # Publish to configured targets
```

### Debugging

- **Main Process**: Use VS Code's Node.js debugger
- **Renderer Process**: Open DevTools with `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
- **IPC Issues**: Check main process console for IPC errors

## Security Features

### Context Isolation

The app uses Electron's context isolation to separate the renderer process from Node.js APIs. All communication happens through a secure `contextBridge` API.

### Process Sandboxing

The renderer process runs in a sandboxed environment with limited system access.

### Suspicious Process Detection

The app monitors for:
- Screen recording software (OBS, Camtasia, etc.)
- Remote desktop applications
- Virtual machine environments

### Window Focus Tracking

When the app window loses focus during a session, this is logged as a security event.

## Troubleshooting

### App won't start

1. Check Node.js version: `node --version` (should be 20+)
2. Clear npm cache: `npm cache clean --force`
3. Delete node_modules and reinstall: `rm -rf node_modules && npm install`

### Can't connect to backend

1. Verify backend services are running: `docker-compose ps`
2. Check .env file URLs are correct
3. Ensure no firewall blocking localhost connections

### Meeting won't load

1. Check the meeting URL is valid and not expired
2. Ensure the domain is allowed in CSP (Content Security Policy)
3. Try the meeting URL in a regular browser first

### Video/Audio not working

1. Grant permissions when prompted
2. Check system settings allow Blockd app to access camera/microphone
3. Restart the app after granting permissions

### Build fails on Windows

1. Install Visual Studio Build Tools
2. Run: `npm install --global windows-build-tools`

### Build fails on macOS

1. Install Xcode Command Line Tools: `xcode-select --install`
2. Ensure you have code signing certificates if building for distribution

## License

Proprietary - Blockd Platform
