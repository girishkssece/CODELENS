import { useState } from 'react'
import axios from 'axios'
import API_BASE from '../config'

function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async () => {
    setError(null)
    if (!form.email || !form.password) {
      setError('Email and password are required')
      return
    }
    if (isRegister && !form.name) {
      setError('Name is required')
      return
    }

    setLoading(true)
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const payload = isRegister
        ? { name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password }

      const response = await axios.post(`${API_BASE}${endpoint}`, payload)
      const { token, user } = response.data

      localStorage.setItem('codelens_token', token)
      localStorage.setItem('codelens_user', JSON.stringify(user))
      onLogin(user, token)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="login-page">
      {/* Background */}
      <div className="login-bg">
        <div className="login-bg-dot d1"></div>
        <div className="login-bg-dot d2"></div>
        <div className="login-bg-dot d3"></div>
      </div>

      {/* Card */}
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-dots">
            <span className="dot d1"></span>
            <span className="dot d2"></span>
            <span className="dot d3"></span>
          </div>
          <h1>CodeLens</h1>
        </div>
        <p className="login-tagline">Visual Code Analyzer & Reviewer</p>
        <p className="login-subtitle">
          {isRegister ? 'Create your account' : 'Welcome back! Sign in to continue'}
        </p>

        {/* Form */}
        <div className="login-form">
          {isRegister && (
            <div className="login-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onKeyDown={handleKeyDown}
                className="login-input"
              />
            </div>
          )}

          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              onKeyDown={handleKeyDown}
              className="login-input"
            />
          </div>

          <div className="login-field">
            <label>Password</label>
            <div className="login-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                onKeyDown={handleKeyDown}
                className="login-input"
              />
              <button
                className="login-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                type="button"
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">⚠️ {error}</div>
          )}

          <button
            className="login-submit-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading
              ? '⏳ Please wait...'
              : isRegister ? '🚀 Create Account' : '🔐 Sign In'}
          </button>
        </div>

        {/* Switch */}
        <div className="login-switch">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <button
            className="login-switch-btn"
            onClick={() => { setIsRegister(!isRegister); setError(null); setForm({ name: '', email: '', password: '' }) }}
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>

        {/* Features */}
        <div className="login-features">
          <div className="login-feature">🧠 ML Language Detection</div>
          <div className="login-feature">⚡ Step-by-step Executor</div>
          <div className="login-feature">🌳 Algo Visualizer</div>
          <div className="login-feature">🔧 Fix & Optimize</div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .login-page {
          min-height: 100vh;
          background: #0a0d14;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .login-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .login-bg-dot {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
        }

        .login-bg-dot.d1 {
          width: 400px;
          height: 400px;
          background: #7aa2f7;
          top: -100px;
          left: -100px;
        }

        .login-bg-dot.d2 {
          width: 300px;
          height: 300px;
          background: #c084fc;
          bottom: -50px;
          right: -50px;
        }

        .login-bg-dot.d3 {
          width: 200px;
          height: 200px;
          background: #4ade80;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .login-card {
          background: #1a1d2e;
          border: 1px solid #2d3154;
          border-radius: 20px;
          padding: 40px;
          width: 100%;
          max-width: 420px;
          position: relative;
          z-index: 1;
          box-shadow: 0 20px 60px #00000066;
          animation: slideUp 0.4s ease;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .login-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }

        .login-logo-dots {
          display: flex;
          gap: 5px;
        }

        .login-logo h1 {
          font-size: 24px;
          font-weight: 700;
          color: #e2e8f0;
          font-family: sans-serif;
          letter-spacing: -0.5px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .dot.d1 { background: #1D9E75; }
        .dot.d2 { background: #378ADD; }
        .dot.d3 { background: #D85A30; }

        .login-tagline {
          font-size: 12px;
          color: #64748b;
          font-family: sans-serif;
          margin-bottom: 24px;
        }

        .login-subtitle {
          font-size: 14px;
          color: #94a3b8;
          font-family: sans-serif;
          margin-bottom: 24px;
          font-weight: 500;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .login-field label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          font-family: sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .login-input {
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid #2d3154;
          background: #0f1117;
          color: #e2e8f0;
          font-size: 13px;
          font-family: sans-serif;
          outline: none;
          transition: border-color 0.2s;
          width: 100%;
        }

        .login-input:focus {
          border-color: #7aa2f7;
          box-shadow: 0 0 0 3px #7aa2f722;
        }

        .login-input::placeholder { color: #475569; }

        .login-password-wrapper {
          position: relative;
        }

        .login-eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
        }

        .login-error {
          background: #2d1a1a;
          border: 1px solid #f87171;
          border-radius: 8px;
          padding: 10px 14px;
          color: #f87171;
          font-size: 12px;
          font-family: sans-serif;
          animation: shake 0.3s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .login-submit-btn {
          padding: 13px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          background: linear-gradient(135deg, #7aa2f7, #c084fc);
          color: white;
          transition: all 0.2s;
          font-family: sans-serif;
          margin-top: 4px;
        }

        .login-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px #7aa2f744;
        }

        .login-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-switch {
          text-align: center;
          font-size: 13px;
          color: #64748b;
          font-family: sans-serif;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .login-switch-btn {
          background: none;
          border: none;
          color: #7aa2f7;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: sans-serif;
          text-decoration: underline;
        }

        .login-switch-btn:hover { color: #c084fc; }

        .login-features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .login-feature {
          font-size: 11px;
          color: #475569;
          font-family: sans-serif;
          padding: 6px 10px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 6px;
          text-align: center;
        }
      `}</style>
    </div>
  )
}

export default Login