import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

function Executor({ code, language }) {
  const [steps, setSteps] = useState([])
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(500)
  const [hasExecuted, setHasExecuted] = useState(false)
  const intervalRef = useRef(null)
  const codeRef = useRef(null)

  const execute = async () => {
    if (!code.trim()) {
      setError('Please paste some code first!')
      return
    }
    setLoading(true)
    setError(null)
    setSteps([])
    setCurrentStep(0)
    setIsPlaying(false)
    setHasExecuted(false)

    try {
      const response = await axios.post('http://localhost:5000/execute', {
        code,
        language
      })
      if (response.data.error && response.data.steps.length === 0) {
        setError(response.data.error)
      } else {
        setSteps(response.data.steps || [])
        setHasExecuted(true)
        setCurrentStep(0)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Execution failed')
    } finally {
      setLoading(false)
    }
  }

  // Auto play
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, speed)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, speed, steps.length])

  // Scroll to highlighted line
  useEffect(() => {
    if (codeRef.current) {
      const highlighted = codeRef.current.querySelector('.line-highlighted')
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [currentStep])

  const step = steps[currentStep] || null
  const codeLines = code.split('\n')

  const getVarChanges = () => {
    if (!step) return {}
    const allVars = { ...step.global_vars, ...step.local_vars }
    if (currentStep === 0) return allVars

    const prevStep = steps[currentStep - 1]
    const prevVars = { ...prevStep?.global_vars, ...prevStep?.local_vars }
    const changes = {}

    Object.entries(allVars).forEach(([k, v]) => {
      changes[k] = {
        value: v,
        changed: JSON.stringify(v) !== JSON.stringify(prevVars[k]),
        isNew: !(k in prevVars)
      }
    })
    return changes
  }

  const varChanges = getVarChanges()

  const getEventColor = (event) => {
    switch (event) {
      case 'call': return '#4ade80'
      case 'return': return '#f87171'
      case 'line': return '#7aa2f7'
      case 'exception': return '#fbbf24'
      case 'error': return '#ef4444'
      default: return '#94a3b8'
    }
  }

  const getEventIcon = (event) => {
    switch (event) {
      case 'call': return '📞'
      case 'return': return '↩'
      case 'line': return '→'
      case 'exception': return '⚠️'
      case 'error': return '❌'
      default: return '•'
    }
  }

  return (
    <div className="executor">
      {/* Controls */}
      <div className="executor-controls">
        <button
          className="exec-btn execute"
          onClick={execute}
          disabled={loading}
        >
          {loading ? '⏳ Loading...' : '⚡ Execute'}
        </button>

        {hasExecuted && (
          <>
            <button
              className="exec-btn"
              onClick={() => { setCurrentStep(0); setIsPlaying(false) }}
              disabled={currentStep === 0}
              title="Go to start"
            >
              ⏮
            </button>
            <button
              className="exec-btn"
              onClick={() => setCurrentStep(p => Math.max(0, p - 1))}
              disabled={currentStep === 0}
              title="Previous step"
            >
              ◀
            </button>
            <button
              className="exec-btn play"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={currentStep >= steps.length - 1}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              className="exec-btn"
              onClick={() => setCurrentStep(p => Math.min(steps.length - 1, p + 1))}
              disabled={currentStep >= steps.length - 1}
              title="Next step"
            >
              ▶
            </button>
            <button
              className="exec-btn"
              onClick={() => { setCurrentStep(steps.length - 1); setIsPlaying(false) }}
              disabled={currentStep >= steps.length - 1}
              title="Go to end"
            >
              ⏭
            </button>

            <div className="speed-control">
              <span>🐢</span>
              <input
                type="range"
                min="100"
                max="1500"
                value={1600 - speed}
                onChange={(e) => setSpeed(1600 - parseInt(e.target.value))}
                className="speed-slider"
              />
              <span>🐇</span>
            </div>

            <span className="step-counter">
              Step {currentStep + 1} / {steps.length}
            </span>
          </>
        )}
      </div>

      {/* Progress bar */}
      {hasExecuted && (
        <div className="exec-progress">
          <div
            className="exec-progress-fill"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      )}

      {error && (
        <div className="exec-error">⚠️ {error}</div>
      )}

      {!hasExecuted && !loading && !error && (
        <div className="exec-placeholder">
          <div style={{ fontSize: '48px', opacity: 0.4 }}>⚡</div>
          <p>Click <strong>Execute</strong> to start step-by-step visualization</p>
          <small>Currently supports Python — JavaScript coming soon!</small>
        </div>
      )}

      {hasExecuted && step && (
        <div className="executor-workspace">

          {/* Left — Code with line highlight */}
          <div className="exec-panel">
            <div className="exec-panel-header">
              <span>📝 Code Execution</span>
              <span className="exec-event-badge" style={{ color: getEventColor(step.event) }}>
                {getEventIcon(step.event)} {step.event}
              </span>
            </div>
            <div className="exec-code" ref={codeRef}>
              {codeLines.map((line, i) => {
                const lineNum = i + 1
                const isHighlighted = step.line === lineNum
                const wasPrev = currentStep > 0 && steps[currentStep - 1]?.line === lineNum
                return (
                  <div
                    key={i}
                    className={`exec-line ${isHighlighted ? 'line-highlighted' : ''} ${wasPrev && !isHighlighted ? 'line-prev' : ''}`}
                  >
                    <span className="exec-line-num">{lineNum}</span>
                    <span className="exec-line-code">{line || ' '}</span>
                    {isHighlighted && (
                      <span className="exec-line-arrow">◀ executing</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — Variables, Stack, Output */}
          <div className="exec-right">

            {/* Current Step Info */}
            <div className="exec-info-card">
              <div className="exec-info-label">Current Action</div>
              <div className="exec-info-value">
                <span style={{ color: getEventColor(step.event) }}>
                  {getEventIcon(step.event)}
                </span>
                <span className="exec-info-func">
                  {step.func_name !== '<module>' ? `${step.func_name}()` : 'main'}
                </span>
                <span className="exec-info-line">line {step.line}</span>
              </div>
              {step.current_line && (
                <div className="exec-info-code">{step.current_line}</div>
              )}
            </div>

            {/* Variables */}
            <div className="exec-section">
              <div className="exec-section-header">📦 Variables</div>
              {Object.keys(varChanges).length === 0 ? (
                <div className="exec-empty">No variables yet</div>
              ) : (
                <div className="exec-vars">
                  {Object.entries(varChanges).map(([name, info]) => (
                    <div
                      key={name}
                      className={`exec-var ${info.changed ? 'var-changed' : ''} ${info.isNew ? 'var-new' : ''}`}
                    >
                      <span className="exec-var-name">{name}</span>
                      <span className="exec-var-eq">=</span>
                      <span className="exec-var-value">
                        {typeof info.value === 'object'
                          ? JSON.stringify(info.value)
                          : String(info.value)}
                      </span>
                      {info.isNew && <span className="var-badge new">NEW</span>}
                      {info.changed && !info.isNew && <span className="var-badge changed">CHANGED</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Call Stack */}
            <div className="exec-section">
              <div className="exec-section-header">📚 Call Stack</div>
              {step.stack.length === 0 ? (
                <div className="exec-empty">Empty stack</div>
              ) : (
                <div className="exec-stack">
                  {[...step.stack].reverse().map((frame, i) => (
                    <div key={i} className={`exec-stack-frame ${i === 0 ? 'frame-active' : ''}`}>
                      <span className="frame-func">{frame.function === '<module>' ? 'main' : frame.function + '()'}</span>
                      <span className="frame-line">line {frame.line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Output */}
            <div className="exec-section">
              <div className="exec-section-header">💬 Output</div>
              <div className="exec-output">
                {step.final_output || steps[steps.length - 1]?.final_output
                  ? <pre>{currentStep === steps.length - 1
                      ? step.final_output
                      : '..running..'}</pre>
                  : <div className="exec-empty">No output yet</div>
                }
              </div>
            </div>

          </div>
        </div>
      )}

      <style>{`
        .executor {
          display: flex;
          flex-direction: column;
          gap: 10px;
          animation: fadeIn 0.3s ease;
        }
        .executor-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
        }
        .exec-btn {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid #2d3154;
          background: #1a1d2e;
          color: #e2e8f0;
          transition: all 0.15s;
        }
        .exec-btn:hover:not(:disabled) {
          background: #2d3154;
        }
        .exec-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .exec-btn.execute {
          background: #1a4a2a;
          border-color: #4ade80;
          color: #4ade80;
        }
        .exec-btn.execute:hover {
          background: #2a5a3a;
        }
        .exec-btn.play {
          background: #1a2a4a;
          border-color: #7aa2f7;
          color: #7aa2f7;
          min-width: 80px;
        }
        .speed-control {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          margin-left: 8px;
        }
        .speed-slider {
          width: 80px;
          accent-color: #7aa2f7;
        }
        .step-counter {
          font-size: 11px;
          color: #64748b;
          margin-left: auto;
          font-family: monospace;
        }
        .exec-progress {
          height: 3px;
          background: #2d3154;
          border-radius: 99px;
          overflow: hidden;
        }
        .exec-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4ade80, #7aa2f7);
          border-radius: 99px;
          transition: width 0.3s ease;
        }
        .exec-error {
          background: #2d1a1a;
          border: 1px solid #5a2d2d;
          border-radius: 8px;
          padding: 12px;
          color: #f87171;
          font-size: 12px;
        }
        .exec-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 250px;
          gap: 10px;
          color: #64748b;
          text-align: center;
        }
        .exec-placeholder p {
          font-size: 13px;
          color: #94a3b8;
        }
        .exec-placeholder small {
          font-size: 11px;
        }
        .executor-workspace {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .exec-panel {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .exec-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #2d3154;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          background: #1a1d2e;
        }
        .exec-event-badge {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .exec-code {
          overflow-y: auto;
          max-height: 400px;
          padding: 8px 0;
        }
        .exec-line {
          display: flex;
          align-items: center;
          padding: 2px 8px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.8;
          transition: background 0.2s;
          position: relative;
        }
        .exec-line.line-highlighted {
          background: #1a3a5a;
          border-left: 3px solid #7aa2f7;
          animation: pulse 1s ease infinite;
        }
        @keyframes pulse {
          0%, 100% { background: #1a3a5a; }
          50% { background: #1a4a6a; }
        }
        .exec-line.line-prev {
          background: #1a2a1a;
          border-left: 3px solid #4ade8044;
        }
        .exec-line-num {
          min-width: 30px;
          color: #3d4268;
          font-size: 11px;
          user-select: none;
          text-align: right;
          padding-right: 10px;
        }
        .exec-line-code {
          color: #e2e8f0;
          flex: 1;
          white-space: pre;
        }
        .exec-line-arrow {
          font-size: 10px;
          color: #7aa2f7;
          margin-left: 8px;
          animation: blink 1s ease infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .exec-right {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          max-height: 460px;
        }
        .exec-info-card {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          padding: 10px 12px;
        }
        .exec-info-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .exec-info-value {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .exec-info-func {
          font-weight: 700;
          color: #e2e8f0;
          font-family: monospace;
        }
        .exec-info-line {
          font-size: 11px;
          color: #64748b;
          margin-left: auto;
        }
        .exec-info-code {
          margin-top: 6px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #7aa2f7;
          background: #1a1d2e;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .exec-section {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .exec-section-header {
          padding: 7px 12px;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
        }
        .exec-empty {
          padding: 10px 12px;
          font-size: 12px;
          color: #475569;
          font-style: italic;
        }
        .exec-vars {
          display: flex;
          flex-direction: column;
          gap: 0;
          max-height: 180px;
          overflow-y: auto;
        }
        .exec-var {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-bottom: 1px solid #2d315444;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          transition: background 0.2s;
        }
        .exec-var:last-child { border-bottom: none; }
        .exec-var.var-changed {
          background: #1a2a1a;
          animation: flashGreen 0.5s ease;
        }
        .exec-var.var-new {
          background: #1a2a3a;
          animation: flashBlue 0.5s ease;
        }
        @keyframes flashGreen {
          0% { background: #2a4a2a; }
          100% { background: #1a2a1a; }
        }
        @keyframes flashBlue {
          0% { background: #1a3a5a; }
          100% { background: #1a2a3a; }
        }
        .exec-var-name { color: #c084fc; font-weight: 700; }
        .exec-var-eq { color: #64748b; }
        .exec-var-value { color: #4ade80; flex: 1; word-break: break-all; }
        .var-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 3px;
          font-family: sans-serif;
        }
        .var-badge.new { background: #1a3a5a; color: #7aa2f7; }
        .var-badge.changed { background: #1a3a1a; color: #4ade80; }
        .exec-stack {
          display: flex;
          flex-direction: column;
          max-height: 120px;
          overflow-y: auto;
        }
        .exec-stack-frame {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 1px solid #2d315444;
          font-size: 12px;
        }
        .exec-stack-frame.frame-active {
          background: #1a2a4a;
          border-left: 3px solid #7aa2f7;
        }
        .frame-func { color: #7aa2f7; font-family: monospace; font-weight: 600; }
        .frame-line { color: #64748b; font-size: 11px; }
        .exec-output {
          padding: 10px 12px;
          max-height: 100px;
          overflow-y: auto;
        }
        .exec-output pre {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #4ade80;
          margin: 0;
          white-space: pre-wrap;
        }
        @media (max-width: 768px) {
          .executor-workspace { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

export default Executor