/**
 * Platform Select Page
 * Allows interviewees to choose their meeting platform
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/session-store';
import { useAuthStore } from '../stores/auth-store';

type MeetingPlatform = 'google-meet' | 'zoom' | 'teams';

interface PlatformOption {
  id: MeetingPlatform;
  name: string;
  icon: string;
  description: string;
  color: string;
  urlPlaceholder: string;
  urlPattern: RegExp;
}

const platforms: PlatformOption[] = [
  {
    id: 'google-meet',
    name: 'Google Meet',
    icon: '📹',
    description: 'Join via Google Meet link',
    color: '#00897B',
    urlPlaceholder: 'https://meet.google.com/xxx-xxxx-xxx',
    urlPattern: /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i,
  },
  {
    id: 'zoom',
    name: 'Zoom',
    icon: '🎥',
    description: 'Join via Zoom meeting link',
    color: '#2D8CFF',
    urlPlaceholder: 'https://zoom.us/j/1234567890',
    urlPattern: /^https:\/\/([\w-]+\.)?zoom\.us\/(j|my)\/[\w\d]+/i,
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    icon: '💼',
    description: 'Join via Teams meeting link',
    color: '#6264A7',
    urlPlaceholder: 'https://teams.microsoft.com/l/meetup-join/...',
    urlPattern: /^https:\/\/teams\.(microsoft|live)\.com\//i,
  },
];

export const PlatformSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const { setMeetingPlatform, setMeetingUrl } = useSessionStore();
  const { user, logout } = useAuthStore();

  const [selectedPlatform, setSelectedPlatform] = useState<MeetingPlatform | null>(null);
  const [meetingUrl, setMeetingUrlLocal] = useState('');
  const [error, setError] = useState('');

  const selectedPlatformInfo = platforms.find((p) => p.id === selectedPlatform);

  const handlePlatformSelect = (platform: MeetingPlatform) => {
    setSelectedPlatform(platform);
    setMeetingUrlLocal('');
    setError('');
  };

  const handleJoinMeeting = () => {
    if (!selectedPlatform) {
      setError('Please select a meeting platform');
      return;
    }

    if (!meetingUrl.trim()) {
      setError('Please enter the meeting URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(meetingUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    // Platform-specific validation (relaxed for flexibility)
    const platform = platforms.find((p) => p.id === selectedPlatform);
    if (platform) {
      const urlLower = meetingUrl.toLowerCase();
      const isValid =
        (selectedPlatform === 'google-meet' && urlLower.includes('meet.google.com')) ||
        (selectedPlatform === 'zoom' && urlLower.includes('zoom.us')) ||
        (selectedPlatform === 'teams' && (urlLower.includes('teams.microsoft.com') || urlLower.includes('teams.live.com')));

      if (!isValid) {
        setError(`Please enter a valid ${platform.name} URL`);
        return;
      }
    }

    // Store the selection and navigate
    setMeetingPlatform(selectedPlatform);
    setMeetingUrl(meetingUrl.trim());
    navigate('/session');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="platform-page">
      <header className="header">
        <div className="header-left">
          <span className="logo-icon">🛡️</span>
          <span className="logo-text">Blockd</span>
        </div>
        <div className="header-right">
          <span className="user-name">{user?.fullName || user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">
            Sign Out
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="content-container">
          <div className="page-header">
            <h1>Select Meeting Platform</h1>
            <p>Choose how you'll be joining your interview</p>
          </div>

          <div className="platform-grid">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                className={`platform-card ${selectedPlatform === platform.id ? 'selected' : ''}`}
                onClick={() => handlePlatformSelect(platform.id)}
                style={{
                  '--platform-color': platform.color,
                } as React.CSSProperties}
              >
                <span className="platform-icon">{platform.icon}</span>
                <h3>{platform.name}</h3>
                <p>{platform.description}</p>
                {selectedPlatform === platform.id && (
                  <span className="check-badge">✓</span>
                )}
              </button>
            ))}
          </div>

          {selectedPlatform && (
            <div className="url-section">
              <div className="url-header">
                <span className="platform-badge" style={{ background: selectedPlatformInfo?.color }}>
                  {selectedPlatformInfo?.icon} {selectedPlatformInfo?.name}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="meetingUrl">Meeting URL</label>
                <input
                  type="url"
                  id="meetingUrl"
                  value={meetingUrl}
                  onChange={(e) => {
                    setMeetingUrlLocal(e.target.value);
                    setError('');
                  }}
                  placeholder={selectedPlatformInfo?.urlPlaceholder}
                  autoFocus
                />
              </div>

              {error && (
                <div className="error-message">
                  <span>⚠️</span> {error}
                </div>
              )}

              <button onClick={handleJoinMeeting} className="join-btn">
                Join Meeting
              </button>
            </div>
          )}

          <div className="info-section">
            <h4>Before you join:</h4>
            <ul>
              <li>Ensure you're in a quiet, private location</li>
              <li>Check your camera and microphone are working</li>
              <li>Close any screen sharing or recording applications</li>
              <li>Your session will be monitored for security purposes</li>
            </ul>
          </div>
        </div>
      </main>

      <style>{`
        .platform-page {
          min-height: 100vh;
          background: #0f172a;
          display: flex;
          flex-direction: column;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-icon {
          font-size: 24px;
        }

        .logo-text {
          font-size: 20px;
          font-weight: 700;
          color: #f8fafc;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .user-name {
          color: #94a3b8;
          font-size: 14px;
        }

        .logout-btn {
          padding: 8px 16px;
          background: transparent;
          border: 1px solid #475569;
          border-radius: 6px;
          color: #94a3b8;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .logout-btn:hover {
          background: #334155;
          color: #f8fafc;
        }

        .main-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }

        .content-container {
          width: 100%;
          max-width: 800px;
        }

        .page-header {
          text-align: center;
          margin-bottom: 40px;
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 8px;
        }

        .page-header p {
          color: #94a3b8;
          font-size: 16px;
          margin: 0;
        }

        .platform-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        @media (max-width: 768px) {
          .platform-grid {
            grid-template-columns: 1fr;
          }
        }

        .platform-card {
          position: relative;
          padding: 24px;
          background: #1e293b;
          border: 2px solid #334155;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .platform-card:hover {
          border-color: #475569;
          transform: translateY(-2px);
        }

        .platform-card.selected {
          border-color: var(--platform-color);
          background: rgba(59, 130, 246, 0.05);
        }

        .platform-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 16px;
        }

        .platform-card h3 {
          color: #f8fafc;
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 8px;
        }

        .platform-card p {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
        }

        .check-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          background: var(--platform-color);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          font-weight: bold;
        }

        .url-section {
          background: #1e293b;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 32px;
        }

        .url-header {
          margin-bottom: 20px;
        }

        .platform-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 20px;
          color: white;
          font-size: 14px;
          font-weight: 500;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .form-group input {
          width: 100%;
          padding: 14px 16px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          color: #f8fafc;
          font-size: 16px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .form-group input::placeholder {
          color: #64748b;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .join-btn {
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .join-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
        }

        .info-section {
          background: rgba(59, 130, 246, 0.05);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 12px;
          padding: 20px 24px;
        }

        .info-section h4 {
          color: #60a5fa;
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 12px;
        }

        .info-section ul {
          margin: 0;
          padding-left: 20px;
        }

        .info-section li {
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
};
