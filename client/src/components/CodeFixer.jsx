import { useState } from 'react'
import axios from 'axios'
import * as Diff from 'diff'

function CodeFixer({ code, language }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState('fixed') // fixed or diff

  const fixCode = async () => {
    if (!code.trim()) {
      setError('Please paste some code first!')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await axios.post('http://localhost:5000/fix', {
        code,
        language
      })
      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fix code')
    } finally {
      setLoading(false)
    }
  }

  const copyFixed = () => {
    if (result?.fixed_code) {
      navigator.clipboard.writeText(result.fixed_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const getChangeColor = (type) => {
    switch (type) {
      case 'bug_fix': return { bg: '#2d1a1a', border: '#f87171', color: '#f87171', icon: '🐛' }
      case 'optimization': return { bg: '#1a2a1a', border: '#4ade80', color: '#4ade80', icon: '⚡' }
      case 'style': return { bg: '#1a2a4a', border: '#7aa2f7', color: '#7aa2f7', icon: '✨' }
      case 'security': return { bg: '#2a1a2a', border: '#c084fc', color: '#c084fc', icon: '🔒' }
      default: return { bg: '#1a1d2e', border: '#64748b', color: '#64748b', icon: '💡' }
    }
  }

  // Build diff lines
  const diffLines = result ? (() => {
    const diffResult = Diff.diffLines(result.original_code || code, result.fixed_code || '')
    const lines = []
    let leftNum = 1
    let rightNum = 1
    diffResult.forEach(part => {
      const partLines = part.value.split('\n')
      if (partLines[partLines.length - 1] === '') partLines.pop()
      partLines.forEach(line => {
        if (part.removed) {
          lines.push({ leftNum: leftNum++, rightNum: null, text: line, type: 'removed', prefix: '-' })
        } else if (part.added) {
          lines.push({ leftNum: null, rightNum: rightNum++, text: line, type: 'added', prefix: '+' })
        } else {
          lines.push({ leftNum: leftNum++, rightNum: rightNum++, text: line, type: 'unchanged', prefix: ' ' })
        }
      })
    })
    return lines
  })() : []

  const scoreColor = (score) => {
    if (score >= 80) return '#4ade80'
    if (score >= 60) return '#fbbf24'
    return '#f87171'
  }

  return (
    <div className="code-fixer">
      {/* Fix Button */}
      <div className="fixer-controls">
        <button
          className="fix-btn"
          onClick={fixCode}
          disabled={loading}
        >
          {loading ? '⏳ Fixing & Optimizing...' : '🔧 Fix & Optimize Code'}
        </button>
        {result && (
          <>
            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewMode === 'fixed' ? 'active' : ''}`}
                onClick={() => setViewMode('fixed')}
              >
                ✅ Fixed Code
              </button>
              <button
                className={`toggle-btn ${viewMode === 'diff' ? 'active' : ''}`}
                onClick={() => setViewMode('diff')}
              >
                🔀 Show Diff
              </button>
            </div>
            <button className="copy-btn" onClick={copyFixed}>
              {copied ? '✅ Copied!' : '📋 Copy Fixed Code'}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="fixer-error">⚠️ {error}</div>
      )}

      {loading && (
        <div className="fixer-loading">
          <div className="fixer-spinner"></div>
          <div className="fixer-loading-text">
            <span>Analyzing your code...</span>
            <span>Finding bugs & inefficiencies...</span>
            <span>Generating optimized version...</span>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="fixer-placeholder">
          <div style={{ fontSize: '48px', opacity: 0.4 }}>🔧</div>
          <p>Click <strong>Fix & Optimize Code</strong> to improve your code</p>
          <small>AI will fix bugs, optimize performance and improve readability</small>
        </div>
      )}

      {result && (
        <div className="fixer-result">
          {/* Score Cards */}
          <div className="score-cards">
            <div className="score-card">
              <div className="score-label">Before</div>
              <div className="score-value" style={{ color: scoreColor(result.score_before) }}>
                {result.score_before}
                <span className="score-unit">/100</span>
              </div>
              <div className="score-bar">
                <div
                  className="score-bar-fill"
                  style={{
                    width: `${result.score_before}%`,
                    background: scoreColor(result.score_before)
                  }}
                />
              </div>
            </div>

            <div className="score-arrow">→</div>

            <div className="score-card improved">
              <div className="score-label">After</div>
              <div className="score-value" style={{ color: scoreColor(result.score_after) }}>
                {result.score_after}
                <span className="score-unit">/100</span>
              </div>
              <div className="score-bar">
                <div
                  className="score-bar-fill"
                  style={{
                    width: `${result.score_after}%`,
                    background: scoreColor(result.score_after)
                  }}
                />
              </div>
            </div>

            <div className="score-card improvement">
              <div className="score-label">Improvement</div>
              <div className="score-value" style={{ color: '#4ade80' }}>
                +{Math.max(0, result.score_after - result.score_before)}
                <span className="score-unit">pts</span>
              </div>
              <div className="score-desc">{result.language}</div>
            </div>
          </div>

          {/* Summary */}
          {result.summary && (
            <div className="fixer-summary">
              <span className="summary-icon">💡</span>
              <span>{result.summary}</span>
            </div>
          )}

          {/* Changes List */}
          {result.changes && result.changes.length > 0 && (
            <div className="changes-list">
              <div className="changes-header">
                📋 Changes Made ({result.changes.length})
              </div>
              {result.changes.map((change, i) => {
                const style = getChangeColor(change.type)
                return (
                  <div key={i} className="change-item" style={{ background: style.bg, borderColor: style.border }}>
                    <div className="change-item-header">
                      <span className="change-badge" style={{ color: style.color }}>
                        {style.icon} {change.type?.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="change-title">{change.title}</span>
                      {change.line && (
                        <span className="change-line">line {change.line}</span>
                      )}
                    </div>
                    <div className="change-desc">{change.description}</div>
                  </div>
                )
              })}
            </div>
          )}

          {result.changes?.length === 0 && (
            <div className="no-changes">
              ✅ Your code is already well-written and optimized!
            </div>
          )}

          {/* Fixed Code or Diff */}
          <div className="fixer-code-section">
            <div className="fixer-code-header">
              {viewMode === 'fixed' ? '✅ Fixed & Optimized Code' : '🔀 Diff View'}
            </div>

            {viewMode === 'fixed' ? (
              <div className="fixer-code">
                {(result.fixed_code || '').split('\n').map((line, i) => (
                  <div key={i} className="fixer-code-line">
                    <span className="fixer-line-num">{i + 1}</span>
                    <span className="fixer-line-text">{line || ' '}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fixer-diff">
                {diffLines.map((line, i) => (
                  <div key={i} className={`diff-line diff-line-${line.type}`}>
                    <span className="diff-line-num">{line.leftNum || ''}</span>
                    <span className="diff-line-num">{line.rightNum || ''}</span>
                    <span className="diff-line-prefix">{line.prefix}</span>
                    <span className="diff-line-text">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .code-fixer {
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeIn 0.3s ease;
        }
        .fixer-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .fix-btn {
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid #4ade80;
          background: #1a3a1a;
          color: #4ade80;
          transition: all 0.15s;
        }
        .fix-btn:hover:not(:disabled) { background: #2a4a2a; }
        .fix-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .view-toggle {
          display: flex;
          gap: 4px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 8px;
          padding: 3px;
        }
        .toggle-btn {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          background: none;
          color: #64748b;
          transition: all 0.15s;
        }
        .toggle-btn.active {
          background: #1a1d2e;
          color: #e2e8f0;
          border: 1px solid #2d3154;
        }
        .copy-btn {
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid #2d3154;
          background: #1a1d2e;
          color: #e2e8f0;
          transition: all 0.15s;
          margin-left: auto;
        }
        .copy-btn:hover { background: #2d3154; }
        .fixer-error {
          background: #2d1a1a;
          border: 1px solid #5a2d2d;
          border-radius: 8px;
          padding: 12px;
          color: #f87171;
          font-size: 12px;
        }
        .fixer-loading {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
        }
        .fixer-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #2d3154;
          border-top-color: #4ade80;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fixer-loading-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .fixer-loading-text span {
          font-size: 12px;
          color: #64748b;
          animation: fadeIn 0.5s ease;
        }
        .fixer-loading-text span:first-child { color: #94a3b8; }
        .fixer-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 250px;
          gap: 10px;
          color: #64748b;
          text-align: center;
        }
        .fixer-placeholder p { font-size: 13px; color: #94a3b8; }
        .fixer-placeholder small { font-size: 11px; }
        .fixer-result {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .score-cards {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .score-card {
          flex: 1;
          min-width: 100px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          padding: 12px;
          text-align: center;
        }
        .score-card.improved {
          border-color: #4ade80;
          box-shadow: 0 0 12px #4ade8033;
        }
        .score-card.improvement {
          border-color: #7aa2f7;
          box-shadow: 0 0 12px #7aa2f733;
        }
        .score-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
          font-family: sans-serif;
        }
        .score-value {
          font-size: 28px;
          font-weight: 700;
          font-family: monospace;
          margin-bottom: 6px;
        }
        .score-unit {
          font-size: 12px;
          color: #64748b;
        }
        .score-bar {
          height: 4px;
          background: #2d3154;
          border-radius: 99px;
          overflow: hidden;
        }
        .score-bar-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 1s ease;
        }
        .score-desc {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
          font-family: sans-serif;
        }
        .score-arrow {
          font-size: 24px;
          color: #4ade80;
          font-weight: 700;
        }
        .fixer-summary {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.6;
          font-family: sans-serif;
        }
        .summary-icon { font-size: 16px; flex-shrink: 0; }
        .changes-list {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .changes-header {
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .change-item {
          padding: 10px 14px;
          border-bottom: 1px solid #2d315444;
          border-left: 3px solid;
        }
        .change-item:last-child { border-bottom: none; }
        .change-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .change-badge {
          font-size: 10px;
          font-weight: 700;
          font-family: sans-serif;
        }
        .change-title {
          font-size: 12px;
          font-weight: 600;
          color: #e2e8f0;
          font-family: sans-serif;
        }
        .change-line {
          font-size: 10px;
          color: #64748b;
          margin-left: auto;
          font-family: monospace;
        }
        .change-desc {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
          font-family: sans-serif;
        }
        .no-changes {
          padding: 14px;
          background: #1a3a1a;
          border: 1px solid #4ade80;
          border-radius: 10px;
          color: #4ade80;
          font-size: 13px;
          font-family: sans-serif;
          text-align: center;
        }
        .fixer-code-section {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .fixer-code-header {
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .fixer-code {
          max-height: 400px;
          overflow-y: auto;
          padding: 8px 0;
        }
        .fixer-code-line {
          display: flex;
          align-items: center;
          padding: 1px 8px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.8;
        }
        .fixer-line-num {
          min-width: 36px;
          color: #3d4268;
          font-size: 11px;
          text-align: right;
          padding-right: 12px;
          user-select: none;
        }
        .fixer-line-text {
          color: #e2e8f0;
          white-space: pre;
          flex: 1;
        }
        .fixer-diff {
          max-height: 400px;
          overflow-y: auto;
        }
        .diff-line {
          display: flex;
          align-items: center;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.7;
          padding: 0 8px;
          min-height: 24px;
        }
        .diff-line-added { background: #1a3a1a; }
        .diff-line-removed { background: #3a1a1a; }
        .diff-line-unchanged { background: transparent; }
        .diff-line-num {
          min-width: 30px;
          color: #3d4268;
          font-size: 10px;
          text-align: right;
          padding-right: 8px;
          user-select: none;
        }
        .diff-line-prefix { min-width: 16px; font-weight: 700; color: #64748b; }
        .diff-line-added .diff-line-prefix { color: #4ade80; }
        .diff-line-removed .diff-line-prefix { color: #f87171; }
        .diff-line-text { color: #e2e8f0; white-space: pre; flex: 1; }
        .diff-line-added .diff-line-text { color: #86efac; }
        .diff-line-removed .diff-line-text { color: #fca5a5; }
      `}</style>
    </div>
  )
}

export default CodeFixer