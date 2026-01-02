/**
 * Register Page
 * Allows new interviewees to create an account
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    // Validation
    if (!fullName || !email || !password || !confirmPassword) {
      setLocalError('Please fill in all fields');
      return;
    }

    if (fullName.trim().length < 2) {
      setLocalError('Please enter your full name');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      await register(email, password, fullName.trim());
      navigate('/platform');
    } catch (err) {
      // Error is handled by the store
    }
  };

  const displayError = localError || error;

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-header">
          <div className="logo">
            <span className="logo-icon">🛡️</span>
            <h1>Blockd</h1>
          </div>
          <p className="subtitle">Secure Interview Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <h2>Create Account</h2>

          {displayError && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {displayError}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              disabled={isLoading}
            />
            <div className="password-requirements">
              <p>Password must contain:</p>
              <ul>
                <li className={password.length >= 8 ? 'met' : ''}>At least 8 characters</li>
                <li className={/[A-Z]/.test(password) ? 'met' : ''}>One uppercase letter</li>
                <li className={/[a-z]/.test(password) ? 'met' : ''}>One lowercase letter</li>
                <li className={/[0-9]/.test(password) ? 'met' : ''}>One number</li>
              </ul>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>

          <div className="form-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="link">
                Sign in
              </Link>
            </p>
          </div>
        </form>

        <div className="terms-notice">
          <p>
            By creating an account, you agree to our{' '}
            <span className="link">Terms of Service</span> and{' '}
            <span className="link">Privacy Policy</span>.
          </p>
        </div>
      </div>

      <style>{`
        .register-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          padding: 20px;
        }

        .register-container {
          width: 100%;
          max-width: 420px;
        }

        .register-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .logo-icon {
          font-size: 36px;
        }

        .logo h1 {
          font-size: 32px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
        }

        .subtitle {
          color: #94a3b8;
          font-size: 14px;
          margin: 0;
        }

        .register-form {
          background: #1e293b;
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .register-form h2 {
          font-size: 24px;
          font-weight: 600;
          color: #f8fafc;
          margin: 0 0 24px;
          text-align: center;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .error-icon {
          font-size: 16px;
        }

        .form-group {
          margin-bottom: 20px;
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
          padding: 12px 16px;
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

        .form-group input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .password-requirements {
          margin-top: 12px;
          padding: 12px;
          background: rgba(59, 130, 246, 0.05);
          border-radius: 8px;
        }

        .password-requirements p {
          color: #94a3b8;
          font-size: 12px;
          margin: 0 0 8px;
        }

        .password-requirements ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
        }

        .password-requirements li {
          color: #64748b;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .password-requirements li::before {
          content: '○';
          font-size: 8px;
        }

        .password-requirements li.met {
          color: #22c55e;
        }

        .password-requirements li.met::before {
          content: '●';
        }

        .submit-btn {
          width: 100%;
          padding: 14px 24px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .form-footer {
          margin-top: 24px;
          text-align: center;
        }

        .form-footer p {
          color: #94a3b8;
          font-size: 14px;
          margin: 0;
        }

        .link {
          color: #60a5fa;
          text-decoration: none;
          font-weight: 500;
          cursor: pointer;
        }

        .link:hover {
          text-decoration: underline;
        }

        .terms-notice {
          margin-top: 20px;
          text-align: center;
        }

        .terms-notice p {
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
          margin: 0;
        }
      `}</style>
    </div>
  );
};
