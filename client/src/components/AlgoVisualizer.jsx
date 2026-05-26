import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'

const OPERATION_COLORS = {
  VISIT:     { color: '#4ade80', bg: '#1a3a1a' },
  CALL:      { color: '#7aa2f7', bg: '#1a2a4a' },
  RETURN:    { color: '#f87171', bg: '#3a1a1a' },
  COMPARE:   { color: '#fbbf24', bg: '#3a2a1a' },
  SWAP:      { color: '#f97316', bg: '#3a2a1a' },
  SPLIT:     { color: '#c084fc', bg: '#2a1a4a' },
  MERGE:     { color: '#38bdf8', bg: '#1a2a3a' },
  BASE_CASE: { color: '#fbbf24', bg: '#3a3a1a' },
}

const OPERATION_ICONS = {
  VISIT: '👁',
  CALL: '📞',
  RETURN: '↩',
  COMPARE: '⚖️',
  SWAP: '🔄',
  SPLIT: '✂️',
  MERGE: '🔗',
  BASE_CASE: '🎯',
}

function AlgoVisualizer({ code, language }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(800)
  const intervalRef = useRef(null)
  const timelineRef = useRef(null)
  const codeRef = useRef(null)

  const visualize = async () => {
    if (!code.trim()) { setError('Please paste some code first!'); return }
    setLoading(true)
    setError(null)
    setResult(null)
    setCurrentStep(0)
    setIsPlaying(false)
    try {
      const response = await axios.post('http://localhost:5000/visualize-algo', { code, language })
      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to visualize')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isPlaying && result) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= result.steps.length - 1) { setIsPlaying(false); return prev }
          return prev + 1
        })
      }, speed)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, speed, result])

  // Scroll timeline to current step
  useEffect(() => {
    if (timelineRef.current) {
      const active = timelineRef.current.querySelector('.tl-step.active')
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentStep])

  // Scroll code to current line
  useEffect(() => {
    if (codeRef.current) {
      const highlighted = codeRef.current.querySelector('.code-line.active')
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentStep])

  const step = result?.steps[currentStep]
  const codeLines = code.split('\n')

  // Build tree layout
  const treeLayout = useMemo(() => {
    if (!result?.tree_nodes) return null

    const nodes = result.tree_nodes
    const nodeMap = {}
    nodes.forEach(n => nodeMap[n.id] = { ...n })

    // Calculate positions using proper binary tree layout
    const SVG_WIDTH = 600
    const LEVEL_HEIGHT = 100
    const levelCounts = {}
    const levelNodes = {}

    nodes.forEach(n => {
      const d = n.depth || 0
      levelCounts[d] = (levelCounts[d] || 0) + 1
      if (!levelNodes[d]) levelNodes[d] = []
      levelNodes[d].push(n.id)
    })

    const maxDepth = Math.max(...nodes.map(n => n.depth || 0))

    // Position nodes level by level
    Object.keys(levelNodes).forEach(depth => {
      const d = parseInt(depth)
      const nodesAtLevel = levelNodes[d]
      const count = nodesAtLevel.length
      const spacing = SVG_WIDTH / (count + 1)
      nodesAtLevel.forEach((id, i) => {
        nodeMap[id].x = spacing * (i + 1)
        nodeMap[id].y = 60 + d * LEVEL_HEIGHT
      })
    })

    const svgHeight = (maxDepth + 1) * LEVEL_HEIGHT + 100

    return { nodeMap, svgHeight, nodes }
  }, [result])

  const getNodeState = (nodeId) => {
    if (!step) return 'unvisited'
    if (step.highlighted_nodes?.includes(nodeId)) return 'active'
    if (step.visited_nodes?.includes(nodeId)) return 'visited'
    return 'unvisited'
  }

  const opStyle = step ? (OPERATION_COLORS[step.operation] || OPERATION_COLORS.VISIT) : null

  return (
    <div className="av-root">

      {/* Controls */}
      <div className="av-controls">
        <button className="av-btn primary" onClick={visualize} disabled={loading}>
          {loading ? '⏳ Generating...' : '🎬 Visualize'}
        </button>
        {result && <>
          <button className="av-btn" onClick={() => { setCurrentStep(0); setIsPlaying(false) }} disabled={currentStep === 0}>⏮</button>
          <button className="av-btn" onClick={() => setCurrentStep(p => Math.max(0, p - 1))} disabled={currentStep === 0}>◀</button>
          <button className="av-btn play" onClick={() => setIsPlaying(!isPlaying)} disabled={currentStep >= result.steps.length - 1}>
            {isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="av-btn" onClick={() => setCurrentStep(p => Math.min(result.steps.length - 1, p + 1))} disabled={currentStep >= result.steps.length - 1}>▶</button>
          <button className="av-btn" onClick={() => { setCurrentStep(result.steps.length - 1); setIsPlaying(false) }} disabled={currentStep >= result.steps.length - 1}>⏭</button>
          <div className="av-speed">
            <span>🐢</span>
            <input type="range" min="100" max="2000" value={2100 - speed} onChange={e => setSpeed(2100 - parseInt(e.target.value))} />
            <span>🐇</span>
          </div>
          <span className="av-counter">{currentStep + 1} / {result.steps.length}</span>
        </>}
      </div>

      {/* Progress */}
      {result && (
        <div className="av-progress">
          <div className="av-progress-fill" style={{ width: `${((currentStep + 1) / result.steps.length) * 100}%` }} />
        </div>
      )}

      {error && <div className="av-error">⚠️ {error}</div>}
      {loading && (
        <div className="av-loading">
          <div className="av-spinner" />
          <div>
            <div style={{ color: '#c084fc', fontSize: '13px', fontFamily: 'sans-serif' }}>Generating visualization...</div>
            <div style={{ color: '#64748b', fontSize: '11px', fontFamily: 'sans-serif' }}>Analyzing algorithm structure</div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="av-placeholder">
          <div style={{ fontSize: '56px', opacity: 0.3 }}>🌳</div>
          <p>Click <strong>Visualize</strong> to see an AlgoMaster-style animation</p>
          <small>Works best with recursive, sorting & tree algorithms</small>
        </div>
      )}

      {result && (
        <div className="av-workspace">

          {/* Info Bar */}
          <div className="av-infobar">
            <span className="av-algo-type">{result.algo_type?.replace('_', ' ')}</span>
            <span className="av-algo-title">{result.title}</span>
            <div className="av-badges">
              {result.time_complexity && <span className="av-badge time">⏱ {result.time_complexity}</span>}
              {result.space_complexity && <span className="av-badge space">💾 {result.space_complexity}</span>}
            </div>
          </div>

          {/* Current Operation */}
          {step && (
            <div className="av-operation" style={{ background: opStyle?.bg, borderColor: opStyle?.color }}>
              <span className="av-op-icon">{OPERATION_ICONS[step.operation] || '•'}</span>
              <span className="av-op-name" style={{ color: opStyle?.color }}>{step.operation}</span>
              <span className="av-op-desc">{step.description}</span>
              <span className="av-op-line">line {step.code_line}</span>
            </div>
          )}

          {/* Main Split — Tree + Code */}
          <div className="av-main">

            {/* Tree Visualization */}
            <div className="av-tree-panel">
              <div className="av-panel-header">🌳 Execution Tree</div>
              <div className="av-tree-svg-wrap">
                {treeLayout && (
                  <svg
                    width="100%"
                    height={treeLayout.svgHeight}
                    viewBox={`0 0 600 ${treeLayout.svgHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <marker id="av-arrow" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#3d4268" />
                      </marker>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                          <feMergeNode in="coloredBlur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Edges */}
                    {treeLayout.nodes.map(node => {
                      if (!node.parent) return null
                      const parent = treeLayout.nodeMap[node.parent]
                      const curr = treeLayout.nodeMap[node.id]
                      if (!parent || !curr) return null

                      const isActiveEdge = step?.edge_from === node.parent && step?.edge_to === node.id
                      const isVisitedEdge = step?.visited_nodes?.includes(node.id)

                      return (
                        <line
                          key={`edge-${node.id}`}
                          x1={parent.x} y1={parent.y + 24}
                          x2={curr.x} y2={curr.y - 24}
                          stroke={isActiveEdge ? '#f97316' : isVisitedEdge ? '#4ade8066' : '#2d3154'}
                          strokeWidth={isActiveEdge ? 3 : 1.5}
                          strokeDasharray={isActiveEdge ? 'none' : '4 2'}
                          markerEnd="url(#av-arrow)"
                          style={{ transition: 'stroke 0.3s ease' }}
                        />
                      )
                    })}

                    {/* Nodes */}
                    {treeLayout.nodes.map(node => {
                      const state = getNodeState(node.id)
                      const curr = treeLayout.nodeMap[node.id]
                      if (!curr) return null

                      const nodeColor = state === 'active' ? '#4ade80'
                        : state === 'visited' ? '#4ade8088'
                        : '#2d3154'

                      const textColor = state === 'active' ? '#0f1117'
                        : state === 'visited' ? '#4ade80'
                        : '#64748b'

                      const bgColor = state === 'active' ? '#4ade80'
                        : state === 'visited' ? '#1a3a1a'
                        : '#1a1d2e'

                      const R = 24

                      return (
                        <g key={node.id}>
                          {/* Glow for active */}
                          {state === 'active' && (
                            <circle cx={curr.x} cy={curr.y} r={R + 10} fill="#4ade8022" filter="url(#glow)">
                              <animate attributeName="r" values={`${R + 8};${R + 14};${R + 8}`} dur="1s" repeatCount="indefinite" />
                            </circle>
                          )}

                          {/* Node circle */}
                          <circle
                            cx={curr.x} cy={curr.y} r={R}
                            fill={bgColor}
                            stroke={nodeColor}
                            strokeWidth={state === 'active' ? 3 : 1.5}
                            style={{ transition: 'all 0.3s ease' }}
                          />

                          {/* Step number badge */}
                          <circle cx={curr.x + R - 6} cy={curr.y - R + 6} r={8} fill="#0f1117" stroke="#2d3154" strokeWidth="1" />
                          <text x={curr.x + R - 6} y={curr.y - R + 10} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
                            {treeLayout.nodes.indexOf(node) + 1}
                          </text>

                          {/* Node value */}
                          <text
                            x={curr.x} y={curr.y + 5}
                            textAnchor="middle"
                            fill={textColor}
                            fontSize="12"
                            fontWeight="700"
                            fontFamily="monospace"
                            style={{ transition: 'fill 0.3s ease' }}
                          >
                            {String(node.value).slice(0, 5)}
                          </text>

                          {/* Label below node */}
                          <text
                            x={curr.x} y={curr.y + R + 14}
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="sans-serif"
                          >
                            {node.label?.slice(0, 12)}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                )}
              </div>
            </div>

            {/* Code Panel */}
            <div className="av-code-panel">
              <div className="av-panel-header">📝 Code</div>
              <div className="av-code" ref={codeRef}>
                {codeLines.map((line, i) => {
                  const lineNum = i + 1
                  const isActive = step?.code_line === lineNum
                  return (
                    <div key={i} className={`code-line ${isActive ? 'active' : ''}`}>
                      <span className="code-line-num">{lineNum}</span>
                      <span className="code-line-text">{line || ' '}</span>
                      {isActive && <span className="code-line-indicator">◀</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Output Bar */}
          {step?.output && step.output.length > 0 && (
            <div className="av-output-bar">
              <span className="av-output-label">OUTPUT:</span>
              <div className="av-output-nodes">
                {step.output.map((val, i) => (
                  <div
                    key={i}
                    className="av-output-node"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {val}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Output */}
          {result.final_output && result.final_output.length > 0 && currentStep === result.steps.length - 1 && (
            <div className="av-final-output">
              <span>🎉 Final Output:</span>
              <div className="av-output-nodes">
                {result.final_output.map((val, i) => (
                  <div key={i} className="av-output-node final">{val}</div>
                ))}
              </div>
            </div>
          )}

          {/* Step Timeline */}
          <div className="av-timeline">
            <div className="av-panel-header">📋 Steps</div>
            <div className="av-timeline-steps" ref={timelineRef}>
              {result.steps.map((s, i) => {
                const sStyle = OPERATION_COLORS[s.operation] || OPERATION_COLORS.VISIT
                return (
                  <div
                    key={i}
                    className={`tl-step ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'past' : ''}`}
                    onClick={() => { setCurrentStep(i); setIsPlaying(false) }}
                    style={{ borderLeftColor: i === currentStep ? sStyle.color : 'transparent' }}
                  >
                    <span className="tl-num">{i + 1}</span>
                    <span className="tl-icon">{OPERATION_ICONS[s.operation] || '•'}</span>
                    <span className="tl-op" style={{ color: i === currentStep ? sStyle.color : '#64748b' }}>
                      {s.operation}
                    </span>
                    <span className="tl-desc">{s.description?.slice(0, 30)}</span>
                    <span className="tl-line">L{s.code_line}</span>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}

      <style>{`
        .av-root {
          display: flex;
          flex-direction: column;
          gap: 10px;
          animation: fadeIn 0.3s ease;
        }
        .av-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
        }
        .av-btn {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid #2d3154;
          background: #1a1d2e;
          color: #e2e8f0;
          transition: all 0.15s;
          font-family: sans-serif;
        }
        .av-btn:hover:not(:disabled) { background: #2d3154; }
        .av-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .av-btn.primary {
          background: #2a1a4a;
          border-color: #c084fc;
          color: #c084fc;
        }
        .av-btn.primary:hover { background: #3a2a5a; }
        .av-btn.play {
          background: #1a2a4a;
          border-color: #7aa2f7;
          color: #7aa2f7;
          min-width: 80px;
        }
        .av-speed {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }
        .av-speed input { width: 80px; accent-color: #c084fc; }
        .av-counter {
          font-size: 11px;
          color: #64748b;
          margin-left: auto;
          font-family: monospace;
        }
        .av-progress {
          height: 3px;
          background: #2d3154;
          border-radius: 99px;
          overflow: hidden;
        }
        .av-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #c084fc, #4ade80);
          border-radius: 99px;
          transition: width 0.3s ease;
        }
        .av-error {
          background: #2d1a1a;
          border: 1px solid #5a2d2d;
          border-radius: 8px;
          padding: 12px;
          color: #f87171;
          font-size: 12px;
          font-family: sans-serif;
        }
        .av-loading {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
        }
        .av-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #2d3154;
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .av-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 280px;
          gap: 12px;
          color: #64748b;
          text-align: center;
        }
        .av-placeholder p { font-size: 13px; color: #94a3b8; font-family: sans-serif; }
        .av-placeholder small { font-size: 11px; font-family: sans-serif; }
        .av-workspace {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .av-infobar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          flex-wrap: wrap;
        }
        .av-algo-type {
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          background: #2a1a4a;
          border: 1px solid #5a2d8a;
          border-radius: 99px;
          color: #c084fc;
          text-transform: uppercase;
          font-family: sans-serif;
        }
        .av-algo-title {
          font-size: 14px;
          font-weight: 700;
          color: #e2e8f0;
          font-family: sans-serif;
        }
        .av-badges {
          display: flex;
          gap: 6px;
          margin-left: auto;
        }
        .av-badge {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 99px;
          font-family: sans-serif;
          font-weight: 500;
        }
        .av-badge.time {
          background: #1a2a1a;
          border: 1px solid #4ade8044;
          color: #4ade80;
        }
        .av-badge.space {
          background: #1a2a4a;
          border: 1px solid #7aa2f744;
          color: #7aa2f7;
        }
        .av-operation {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border: 1px solid;
          border-radius: 10px;
          flex-wrap: wrap;
          animation: fadeIn 0.2s ease;
        }
        .av-op-icon { font-size: 16px; }
        .av-op-name {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          font-family: sans-serif;
          letter-spacing: 0.5px;
        }
        .av-op-desc {
          font-size: 12px;
          color: #94a3b8;
          font-family: sans-serif;
          flex: 1;
        }
        .av-op-line {
          font-size: 11px;
          color: #64748b;
          font-family: monospace;
        }
        .av-main {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 10px;
        }
        .av-tree-panel, .av-code-panel {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .av-panel-header {
          padding: 8px 14px;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: sans-serif;
        }
        .av-tree-svg-wrap {
          overflow: auto;
          padding: 10px;
          min-height: 250px;
          background: #0a0d14;
        }
        .av-code {
          overflow-y: auto;
          max-height: 320px;
          padding: 8px 0;
        }
        .code-line {
          display: flex;
          align-items: center;
          padding: 2px 8px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.8;
          transition: background 0.2s;
        }
        .code-line.active {
          background: #1a3a1a;
          border-left: 3px solid #4ade80;
          animation: pulse-green 1s ease infinite;
        }
        @keyframes pulse-green {
          0%, 100% { background: #1a3a1a; }
          50% { background: #1a4a1a; }
        }
        .code-line-num {
          min-width: 28px;
          color: #3d4268;
          font-size: 11px;
          text-align: right;
          padding-right: 10px;
          user-select: none;
        }
        .code-line-text { color: #e2e8f0; flex: 1; white-space: pre; }
        .code-line.active .code-line-text { color: #86efac; }
        .code-line-indicator {
          font-size: 10px;
          color: #4ade80;
          animation: blink 1s ease infinite;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .av-output-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
        }
        .av-output-label {
          font-size: 11px;
          font-weight: 700;
          color: #4ade80;
          font-family: sans-serif;
          letter-spacing: 1px;
        }
        .av-output-nodes {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .av-output-node {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #1a3a1a;
          border: 2px solid #4ade80;
          color: #4ade80;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: monospace;
          animation: popIn 0.3s ease both;
        }
        .av-output-node.final {
          background: #4ade80;
          color: #0f1117;
        }
        @keyframes popIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .av-final-output {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: #1a3a1a;
          border: 1px solid #4ade80;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #4ade80;
          font-family: sans-serif;
          animation: fadeIn 0.5s ease;
        }
        .av-timeline {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .av-timeline-steps {
          max-height: 180px;
          overflow-y: auto;
        }
        .tl-step {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-bottom: 1px solid #2d315433;
          border-left: 3px solid transparent;
          cursor: pointer;
          transition: all 0.15s;
          font-family: sans-serif;
        }
        .tl-step:hover { background: #1a1d2e; }
        .tl-step.active { background: #1a1d2e; }
        .tl-step.past { opacity: 0.5; }
        .tl-num { min-width: 20px; font-size: 10px; color: #3d4268; font-family: monospace; }
        .tl-icon { font-size: 11px; }
        .tl-op { font-size: 10px; font-weight: 700; min-width: 80px; text-transform: uppercase; }
        .tl-desc { font-size: 11px; color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tl-line { font-size: 10px; color: #3d4268; font-family: monospace; }
        @media (max-width: 768px) {
          .av-main { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

export default AlgoVisualizer