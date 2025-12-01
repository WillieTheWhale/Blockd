/**
 * Session Page
 * Main interview session with embedded meeting platform and monitoring
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/session-store';
import { useAuthStore } from '../stores/auth-store';

interface StatusIndicator {
  label: string;
  status: 'active' | 'inactive' | 'warning' | 'error';
  icon: string;
}

export const SessionPage: React.FC = () => {
  const navigate = useNavigate();
  const webviewRef = useRef<HTMLWebViewElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { meetingPlatform, meetingUrl, isConnected, isCapturing, securityEvents, reset } = useSessionStore();
  const { user } = useAuthStore();

  const [isWebviewReady, setIsWebviewReady] = useState(false);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Redirect if no meeting info
  useEffect(() => {
    if (!meetingPlatform || !meetingUrl) {
      navigate('/platform');
    }
  }, [meetingPlatform, meetingUrl, navigate]);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        // Start security monitoring
        await window.electronAPI.security.startMonitoring();

        // Get a session token (in real app, this would come from backend)
        const token = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionToken(token);

        // Connect WebSocket
        await window.electronAPI.websocket.connect();
      } catch (error) {
        console.error('Session initialization error:', error);
      }
    };

    initSession();

    return () => {
      // Cleanup on unmount
      window.electronAPI.security.stopMonitoring();
      window.electronAPI.websocket.disconnect();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, []);

  // Request media permissions and start capture
  const startMediaCapture = useCallback(async () => {
    try {
      // Get available sources
      const sourcesResult = await window.electronAPI.media.getSources();

      if (!sourcesResult.success || !Array.isArray(sourcesResult.data)) {
        throw new Error('Failed to get media sources');
      }

      const sources = sourcesResult.data as Array<{ id: string; name: string }>;
      const screenSource = sources.find(
        (s) => s.name.includes('Screen') || s.name.includes('Entire') || s.name.includes('Desktop')
      );

      if (!screenSource) {
        throw new Error('No screen source available');
      }

      // Start capture via main process
      await window.electronAPI.media.startCapture(screenSource.id);
      setMediaPermissionGranted(true);

      // Get user media for self-view
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Media capture error:', error);
      setMediaPermissionGranted(false);
    }
  }, []);

  // Setup webview event handlers
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDomReady = () => {
      setIsWebviewReady(true);
      setWebviewError(null);
    };

    const handleDidFailLoad = (event: Event) => {
      const e = event as unknown as { errorDescription: string };
      setWebviewError(e.errorDescription || 'Failed to load meeting');
    };

    const handleDidStartLoading = () => {
      setWebviewError(null);
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('did-start-loading', handleDidStartLoading);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
    };
  }, []);

  const handleEndSession = async () => {
    if (confirm('Are you sure you want to end this session?')) {
      try {
        await window.electronAPI.media.stopCapture();
        await window.electronAPI.security.stopMonitoring();
        await window.electronAPI.websocket.disconnect();
      } catch (error) {
        console.error('End session error:', error);
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      reset();
      navigate('/platform');
    }
  };

  const handleChangePlatform = () => {
    if (confirm('This will end your current session. Continue?')) {
      handleEndSession();
    }
  };

  const getPlatformName = () => {
    switch (meetingPlatform) {
      case 'google-meet':
        return 'Google Meet';
      case 'zoom':
        return 'Zoom';
      case 'teams':
        return 'Microsoft Teams';
      default:
        return 'Meeting';
    }
  };

  const getPlatformIcon = () => {
    switch (meetingPlatform) {
      case 'google-meet':
        return '📹';
      case 'zoom':
        return '🎥';
      case 'teams':
        return '💼';
      default:
        return '🎬';
    }
  };

  const statusIndicators: StatusIndicator[] = [
    {
      label: 'Connection',
      status: isConnected ? 'active' : 'warning',
      icon: isConnected ? '🟢' : '🟡',
    },
    {
      label: 'Recording',
      status: isCapturing ? 'active' : 'inactive',
      icon: isCapturing ? '⏺️' : '⏸️',
    },
    {
      label: 'Security',
      status: securityEvents.some((e) => e.severity === 'high' || e.severity === 'critical')
        ? 'error'
        : 'active',
      icon: securityEvents.length > 0 ? '⚠️' : '✅',
    },
  ];

  return (
    <div className="session-page">
      {/* Header */}
      <header className={`header ${showControls ? '' : 'hidden'}`}>
        <div className="header-left">
          <span className="platform-badge">
            {getPlatformIcon()} {getPlatformName()}
          </span>
          <span className="user-badge">{user?.fullName || user?.email}</span>
        </div>

        <div className="status-indicators">
          {statusIndicators.map((indicator) => (
            <div key={indicator.label} className={`status-item ${indicator.status}`}>
              <span className="status-icon">{indicator.icon}</span>
              <span className="status-label">{indicator.label}</span>
            </div>
          ))}
        </div>

        <div className="header-right">
          <button onClick={handleChangePlatform} className="btn btn-secondary">
            Change Platform
          </button>
          <button onClick={handleEndSession} className="btn btn-danger">
            End Session
          </button>
        </div>
      </header>

      {/* Toggle controls button */}
      <button
        className="toggle-controls"
        onClick={() => setShowControls(!showControls)}
        title={showControls ? 'Hide controls' : 'Show controls'}
      >
        {showControls ? '▲' : '▼'}
      </button>

      {/* Main content area with webview */}
      <main className="main-content">
        {!mediaPermissionGranted && (
          <div className="permission-overlay">
            <div className="permission-card">
              <h2>Start Your Interview Session</h2>
              <p>
                We need permission to access your camera, microphone, and screen for the interview
                monitoring.
              </p>
              <button onClick={startMediaCapture} className="btn btn-primary">
                Grant Permissions & Start
              </button>
            </div>
          </div>
        )}

        {webviewError && (
          <div className="error-overlay">
            <div className="error-card">
              <span className="error-icon">⚠️</span>
              <h3>Failed to load meeting</h3>
              <p>{webviewError}</p>
              <button
                onClick={() => webviewRef.current?.reload()}
                className="btn btn-secondary"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {meetingUrl && (
          <webview
            ref={webviewRef}
            src={meetingUrl}
            className="meeting-webview"
            allowpopups="true"
            partition="persist:meeting"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"
          />
        )}

        {/* Self-view camera */}
        {mediaPermissionGranted && (
          <div className="self-view">
            <video ref={videoRef} autoPlay muted playsInline />
            <span className="self-view-label">You</span>
          </div>
        )}

        {/* Security events panel */}
        {securityEvents.length > 0 && (
          <div className="security-panel">
            <div className="security-header">
              <span>⚠️ Security Events</span>
              <span className="event-count">{securityEvents.length}</span>
            </div>
            <div className="security-events">
              {securityEvents.slice(0, 5).map((event, index) => (
                <div key={index} className={`security-event ${event.severity}`}>
                  <span className="event-type">{event.type}</span>
                  <span className="event-desc">{event.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .session-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: #0f172a;
          overflow: hidden;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
          transition: transform 0.3s, opacity 0.3s;
          z-index: 100;
        }

        .header.hidden {
          transform: translateY(-100%);
          opacity: 0;
          pointer-events: none;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .platform-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: #334155;
          border-radius: 6px;
          color: #f8fafc;
          font-size: 14px;
          font-weight: 500;
        }

        .user-badge {
          color: #94a3b8;
          font-size: 14px;
        }

        .status-indicators {
          display: flex;
          gap: 16px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
          font-size: 13px;
        }

        .status-icon {
          font-size: 12px;
        }

        .status-label {
          color: #94a3b8;
        }

        .status-item.active .status-label {
          color: #22c55e;
        }

        .status-item.warning .status-label {
          color: #eab308;
        }

        .status-item.error .status-label {
          color: #ef4444;
        }

        .header-right {
          display: flex;
          gap: 12px;
        }

        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
        }

        .btn-primary:hover {
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .btn-secondary {
          background: #334155;
          color: #f8fafc;
          border: 1px solid #475569;
        }

        .btn-secondary:hover {
          background: #475569;
        }

        .btn-danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
        }

        .btn-danger:hover {
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        }

        .toggle-controls {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          padding: 4px 16px;
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid #334155;
          border-radius: 0 0 8px 8px;
          color: #94a3b8;
          font-size: 12px;
          cursor: pointer;
          z-index: 101;
          transition: background 0.2s;
        }

        .toggle-controls:hover {
          background: #334155;
        }

        .main-content {
          flex: 1;
          position: relative;
          display: flex;
        }

        .meeting-webview {
          flex: 1;
          border: none;
          background: #000;
        }

        .permission-overlay,
        .error-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }

        .permission-card,
        .error-card {
          max-width: 400px;
          padding: 32px;
          background: #1e293b;
          border-radius: 16px;
          text-align: center;
        }

        .permission-card h2,
        .error-card h3 {
          color: #f8fafc;
          margin: 0 0 12px;
        }

        .permission-card p,
        .error-card p {
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.5;
          margin: 0 0 24px;
        }

        .error-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 16px;
        }

        .self-view {
          position: absolute;
          bottom: 20px;
          right: 20px;
          width: 200px;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border: 2px solid #334155;
        }

        .self-view video {
          width: 100%;
          display: block;
          background: #000;
        }

        .self-view-label {
          position: absolute;
          bottom: 8px;
          left: 8px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 4px;
          color: white;
          font-size: 12px;
        }

        .security-panel {
          position: absolute;
          bottom: 20px;
          left: 20px;
          width: 300px;
          background: rgba(30, 41, 59, 0.95);
          border: 1px solid #334155;
          border-radius: 12px;
          overflow: hidden;
        }

        .security-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border-bottom: 1px solid #334155;
          color: #fca5a5;
          font-size: 14px;
          font-weight: 500;
        }

        .event-count {
          background: #ef4444;
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
        }

        .security-events {
          max-height: 200px;
          overflow-y: auto;
        }

        .security-event {
          padding: 10px 16px;
          border-bottom: 1px solid #334155;
        }

        .security-event:last-child {
          border-bottom: none;
        }

        .security-event.high,
        .security-event.critical {
          background: rgba(239, 68, 68, 0.05);
        }

        .event-type {
          display: block;
          color: #f8fafc;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 2px;
        }

        .event-desc {
          display: block;
          color: #94a3b8;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};

// Extend JSX types for webview
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          allowpopups?: string;
          partition?: string;
          useragent?: string;
        },
        HTMLElement
      >;
    }
  }
}
