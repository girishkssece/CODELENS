import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import axios from 'axios'

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const OP_COLORS = {
  CALL:      { c: '#7aa2f7', bg: '#1a2a4a' },
  RETURN:    { c: '#f87171', bg: '#3a1a1a' },
  VISIT:     { c: '#4ade80', bg: '#1a3a1a' },
  COMPARE:   { c: '#fbbf24', bg: '#3a2a1a' },
  SWAP:      { c: '#f97316', bg: '#3a2a1a' },
  ASSIGN:    { c: '#38bdf8', bg: '#1a2a3a' },
  PUSH:      { c: '#c084fc', bg: '#2a1a4a' },
  POP:       { c: '#fb923c', bg: '#3a2a1a' },
  FILL:      { c: '#34d399', bg: '#1a3a2a' },
  PRINT:     { c: '#a78bfa', bg: '#2a1a3a' },
  LOOP:      { c: '#818cf8', bg: '#1a1a3a' },
  LINE:      { c: '#94a3b8', bg: '#1a1d2e' },
  BASE_CASE: { c: '#fbbf24', bg: '#3a3a1a' },
  ERROR:     { c: '#ef4444', bg: '#3a1a1a' },
}

const OP_ICONS = {
  CALL: '📞', RETURN: '↩️', VISIT: '👁', COMPARE: '⚖️',
  SWAP: '🔄', ASSIGN: '📝', PUSH: '⬆️', POP: '⬇️',
  FILL: '🔲', PRINT: '🖨️', LOOP: '🔁', LINE: '•',
  BASE_CASE: '🎯', ERROR: '❌',
}

const NODE_COLORS = {
  active:     { fill: '#4ade80', stroke: '#4ade80', text: '#0f1117' },
  visited:    { fill: '#1a3a1a', stroke: '#4ade8088', text: '#4ade80' },
  processing: { fill: '#1a2a4a', stroke: '#7aa2f7', text: '#7aa2f7' },
  queued:     { fill: '#2a1a4a', stroke: '#c084fc', text: '#c084fc' },
  unvisited:  { fill: '#1a1d2e', stroke: '#2d3154', text: '#64748b' },
}


/* ═══════════════════════════════════════════════════════════════
   TREE VISUALIZER
   ═══════════════════════════════════════════════════════════════ */

function TreeVisualizer({ result, step }) {
  const layout = useMemo(() => {
    if (!result?.tree_nodes?.length) return null
    const nodes = result.tree_nodes
    const nodeMap = {}
    nodes.forEach(n => { nodeMap[n.id] = { ...n } })

    // Build proper binary tree layout
    const SVG_W = 700
    const LVL_H = 110
    const R = 26

    // Assign positions using tree layout algorithm
    const maxDepth = Math.max(...nodes.map(n => n.depth ?? 0))
    const levelNodes = {}
    nodes.forEach(n => {
      const d = n.depth ?? 0
      if (!levelNodes[d]) levelNodes[d] = []
      levelNodes[d].push(n.id)
    })

    Object.keys(levelNodes).forEach(depth => {
      const d = parseInt(depth)
      const ids = levelNodes[d]
      const spacing = SVG_W / (ids.length + 1)
      ids.forEach((id, i) => {
        nodeMap[id].x = spacing * (i + 1)
        nodeMap[id].y = 55 + d * LVL_H
      })
    })

    // Build edges
    const edges = []
    nodes.forEach(n => {
      if (n.left && nodeMap[n.left])  edges.push({ from: n.id, to: n.left })
      if (n.right && nodeMap[n.right]) edges.push({ from: n.id, to: n.right })
    })

    const svgH = Math.max(300, (maxDepth + 1) * LVL_H + 80)
    return { nodeMap, edges, svgH, R, SVG_W, nodes }
  }, [result])

  if (!layout) return null

  const { nodeMap, edges, svgH, R, SVG_W } = layout
  const nodeStates = step?.node_states || {}
  const activeEdge = step?.active_edge

  // Traversal order indicator
  const travOrder = result.traversal_order
  const currentPhase = step?.operation

  return (
    <div className="av-viz-panel">
      <div className="av-panel-header">
        🌳 {result.title || 'Tree Visualization'}
        {travOrder && (
          <span className="av-trav-order">
            {travOrder.map((phase, i) => (
              <span key={i} className={`av-trav-phase ${
                (currentPhase === 'VISIT' && phase === 'VISIT') ||
                (currentPhase === 'CALL' && phase === 'LEFT') ||
                (currentPhase === 'RETURN' && phase === 'RIGHT')
                  ? 'active' : ''
              }`}>
                {phase}
                {i < travOrder.length - 1 && <span className="av-trav-arrow">→</span>}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="av-viz-svg-wrap">
        <svg width="100%" height={svgH} viewBox={`0 0 ${SVG_W} ${svgH}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="glow-green">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-blue">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const from = nodeMap[e.from]
            const to = nodeMap[e.to]
            if (!from || !to) return null
            const isActive = activeEdge && activeEdge.from === e.from && activeEdge.to === e.to
            const fromState = nodeStates[e.from] || 'unvisited'
            const toState = nodeStates[e.to] || 'unvisited'
            const isVisited = fromState === 'visited' && toState === 'visited'

            return (
              <line key={`e-${i}`}
                x1={from.x} y1={from.y + R}
                x2={to.x}   y2={to.y - R}
                stroke={isActive ? '#f97316' : isVisited ? '#4ade8066' : '#2d3154'}
                strokeWidth={isActive ? 3 : 1.5}
                strokeDasharray={isActive ? 'none' : isVisited ? 'none' : '4 3'}
                style={{ transition: 'all 0.3s ease' }}
              />
            )
          })}

          {/* Nodes */}
          {layout.nodes.map(node => {
            const n = nodeMap[node.id]
            if (!n) return null
            const state = nodeStates[node.id] || 'unvisited'
            const colors = NODE_COLORS[state] || NODE_COLORS.unvisited

            return (
              <g key={node.id}>
                {state === 'active' && (
                  <circle cx={n.x} cy={n.y} r={R + 12} fill="#4ade8018" filter="url(#glow-green)">
                    <animate attributeName="r" values={`${R+10};${R+16};${R+10}`} dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={n.x} cy={n.y} r={R}
                  fill={colors.fill} stroke={colors.stroke}
                  strokeWidth={state === 'active' ? 3 : 1.5}
                  style={{ transition: 'all 0.3s ease' }}
                />
                <text x={n.x} y={n.y + 5} textAnchor="middle"
                  fill={colors.text} fontSize="14" fontWeight="700" fontFamily="monospace"
                  style={{ transition: 'fill 0.3s ease' }}
                >
                  {String(node.val).slice(0, 5)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   ARRAY VISUALIZER
   ═══════════════════════════════════════════════════════════════ */

function ArrayVisualizer({ step }) {
  if (!step?.arrays) return null

  const entries = Object.entries(step.arrays)
  if (entries.length === 0) return null
  const [arrName, arr] = entries[0]
  if (!Array.isArray(arr) || arr.length === 0) return null

  const maxVal = Math.max(...arr.filter(v => typeof v === 'number'))
  const pointers = step.pointers || []
  const highlights = step.highlights || []

  const getBarColor = (idx) => {
    const hl = highlights.find(h => h.index === idx)
    if (hl) {
      if (hl.type === 'swap')    return '#f97316'
      if (hl.type === 'compare') return '#fbbf24'
      if (hl.type === 'sorted')  return '#4ade80'
      return '#38bdf8'
    }
    if (step.sorted_indices?.includes(idx)) return '#4ade8088'
    return 'linear-gradient(180deg, #3d6bff, #1a2a4a)'
  }

  const getBarGlow = (idx) => {
    const hl = highlights.find(h => h.index === idx)
    if (hl) return `0 0 12px ${getBarColor(idx)}66`
    return 'none'
  }

  return (
    <div className="av-viz-panel">
      <div className="av-panel-header">📊 Array — {arrName}</div>
      <div className="av-array-container">
        <div className="av-array-bars">
          {arr.map((val, i) => {
            const height = maxVal > 0 ? Math.max((val / maxVal) * 160, 12) : 24
            const color = getBarColor(i)
            const ptr = pointers.find(p => p.index === i)

            return (
              <div key={i} className="av-bar-col">
                <div className="av-bar-val-top">{val}</div>
                <div className="av-bar"
                  style={{
                    height: `${height}px`,
                    background: color,
                    boxShadow: getBarGlow(i),
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
                <div className="av-bar-idx">{i}</div>
                {ptr && <div className="av-bar-ptr" style={{ color: '#fbbf24' }}>↑ {ptr.name}</div>}
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div className="av-array-legend">
          <span className="av-legend-item"><span className="av-legend-dot" style={{background:'#fbbf24'}}/> Compare</span>
          <span className="av-legend-item"><span className="av-legend-dot" style={{background:'#f97316'}}/> Swap</span>
          <span className="av-legend-item"><span className="av-legend-dot" style={{background:'#4ade80'}}/> Sorted</span>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   DP TABLE VISUALIZER
   ═══════════════════════════════════════════════════════════════ */

function DPVisualizer({ step }) {
  if (!step?.dp_table) return null
  const table = step.dp_table
  const currentCell = step.current_cell
  const filledCells = step.filled_cells || []
  const dpName = step.dp_name || 'dp'
  const auxData = step.aux_data || {}

  return (
    <div className="av-viz-panel">
      <div className="av-panel-header">🔲 DP Table — {dpName}</div>
      <div className="av-dp-container">
        {/* Auxiliary data */}
        {Object.keys(auxData).length > 0 && (
          <div className="av-dp-aux">
            {Object.entries(auxData).map(([k, v]) => (
              <span key={k} className="av-dp-aux-item">
                <span className="av-dp-aux-label">{k}:</span>
                <span className="av-dp-aux-val">{Array.isArray(v) ? `[${v.join(', ')}]` : String(v)}</span>
              </span>
            ))}
          </div>
        )}

        {/* 1D DP Grid */}
        <div className="av-dp-grid">
          {/* Index row */}
          <div className="av-dp-row av-dp-idx-row">
            {table.map((_, i) => (
              <div key={i} className="av-dp-cell av-dp-idx">{i}</div>
            ))}
          </div>
          {/* Value row */}
          <div className="av-dp-row">
            {table.map((val, i) => {
              const isCurrent = currentCell === i
              const isFilled = filledCells.includes(i)
              return (
                <div key={i} className={`av-dp-cell ${isCurrent ? 'current' : isFilled ? 'filled' : ''}`}
                  style={isCurrent ? { animation: 'dp-pulse 0.6s ease' } : {}}
                >
                  {val === null || val === undefined ? '—' : val}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   GRAPH VISUALIZER
   ═══════════════════════════════════════════════════════════════ */

function GraphVisualizer({ result, step }) {
  const layout = useMemo(() => {
    if (!result?.graph_nodes?.length) return null

    const nodeIds = result.graph_nodes
    const edges = result.graph_edges || []
    const count = nodeIds.length
    const SVG_W = 500
    const SVG_H = 400
    const cx = SVG_W / 2
    const cy = SVG_H / 2
    const radius = Math.min(cx, cy) - 60

    // Circular layout
    const positions = {}
    nodeIds.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      positions[id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      }
    })

    return { nodeIds, edges, positions, SVG_W, SVG_H }
  }, [result])

  if (!layout) return null

  const { nodeIds, edges, positions, SVG_W, SVG_H } = layout
  const nodeStates = step?.node_states || {}
  const edgeStates = step?.edge_states || {}
  const queue = step?.queue || []

  return (
    <div className="av-viz-panel">
      <div className="av-panel-header">🕸️ {result.title || 'Graph'}</div>
      <div className="av-viz-svg-wrap">
        <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="graph-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#3d4268" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const from = positions[e.from]
            const to = positions[e.to]
            if (!from || !to) return null
            const key = `${e.from}-${e.to}`
            const state = edgeStates[key] || 'default'
            const color = state === 'active' ? '#f97316' : state === 'visited' ? '#4ade80' : '#2d3154'

            return (
              <line key={`ge-${i}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={state === 'active' ? 2.5 : 1.5}
                markerEnd="url(#graph-arrow)"
                style={{ transition: 'all 0.3s' }}
              />
            )
          })}

          {/* Nodes */}
          {nodeIds.map(id => {
            const pos = positions[id]
            if (!pos) return null
            const state = nodeStates[id] || 'unvisited'
            const colors = NODE_COLORS[state] || NODE_COLORS.unvisited

            return (
              <g key={id}>
                {state === 'active' && (
                  <circle cx={pos.x} cy={pos.y} r={32} fill="#4ade8018" filter="url(#glow-green)">
                    <animate attributeName="r" values="30;36;30" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={pos.x} cy={pos.y} r={24}
                  fill={colors.fill} stroke={colors.stroke}
                  strokeWidth={state === 'active' ? 3 : 1.5}
                  style={{ transition: 'all 0.3s' }}
                />
                <text x={pos.x} y={pos.y + 5} textAnchor="middle"
                  fill={colors.text} fontSize="13" fontWeight="700" fontFamily="monospace"
                >
                  {String(id).slice(0, 4)}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Queue / Stack display */}
        {queue.length > 0 && (
          <div className="av-graph-queue">
            <span className="av-graph-queue-label">Queue:</span>
            {queue.map((v, i) => (
              <span key={i} className="av-graph-queue-item">{v}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   SIMPLE VISUALIZER  (variables + console)
   ═══════════════════════════════════════════════════════════════ */

function SimpleVisualizer({ step }) {
  if (!step) return null

  const vars = step.variables || {}
  const changedVars = step.changed_vars || []
  const callStack = step.call_stack || []

  return (
    <div className="av-viz-panel">
      <div className="av-panel-header">📋 Variables & State</div>
      <div className="av-simple-container">
        {/* Variable cards */}
        <div className="av-var-grid">
          {Object.entries(vars).map(([k, v]) => {
            const isChanged = changedVars.includes(k)
            const displayVal = v === null ? 'None'
              : typeof v === 'object' ? JSON.stringify(v)
              : String(v)
            return (
              <div key={k} className={`av-var-card ${isChanged ? 'changed' : ''}`}>
                <span className="av-var-name">{k}</span>
                <span className="av-var-val">{displayVal.slice(0, 60)}</span>
              </div>
            )
          })}
          {Object.keys(vars).length === 0 && (
            <div className="av-var-empty">No variables in scope</div>
          )}
        </div>

        {/* Call stack */}
        {callStack.length > 1 && (
          <div className="av-call-stack">
            <div className="av-cs-label">Call Stack</div>
            {callStack.map((frame, i) => (
              <div key={i} className={`av-cs-frame ${i === callStack.length - 1 ? 'top' : ''}`}>
                <span className="av-cs-fn">{frame.function}</span>
                <span className="av-cs-line">L{frame.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   CODE PANEL  (always shown)
   ═══════════════════════════════════════════════════════════════ */

function CodePanel({ code, activeLine }) {
  const ref = useRef(null)
  const lines = code.split('\n')

  useEffect(() => {
    if (ref.current) {
      const el = ref.current.querySelector('.code-line.active')
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeLine])

  return (
    <div className="av-code-panel">
      <div className="av-panel-header">📝 Code</div>
      <div className="av-code" ref={ref}>
        {lines.map((line, i) => {
          const num = i + 1
          const isActive = activeLine === num
          return (
            <div key={i} className={`code-line ${isActive ? 'active' : ''}`}>
              <span className="code-line-num">{num}</span>
              <span className="code-line-text">{line || ' '}</span>
              {isActive && <span className="code-line-indicator">◀</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

function AlgoVisualizer({ code, language }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(800)
  const intervalRef = useRef(null)
  const timelineRef = useRef(null)

  /* ── Visualize ── */
  const visualize = useCallback(async (retryCount = 0) => {
    if (!code.trim()) { setError('Please paste some code first!'); return }
    if (retryCount === 0) {
      setLoading(true); setError(null); setResult(null)
      setCurrentStep(0); setIsPlaying(false)
    }
    try {
      const resp = await axios.post('http://localhost:5000/visualize-algo', { code, language })
      setResult(resp.data)
      if (retryCount > 0) setError(null)
    } catch (err) {
      if (err.response?.status === 429 && retryCount < 2) {
        setTimeout(() => visualize(retryCount + 1), 3000); return
      }
      setError(
        err.response?.status === 429
          ? 'Rate limit hit. Please wait 1 minute and try again!'
          : err.response?.data?.error || 'Failed to visualize. Click Visualize again!'
      )
    } finally {
      if (retryCount === 0 || retryCount >= 2) setLoading(false)
    }
  }, [code, language])

  /* ── Playback ── */
  useEffect(() => {
    if (isPlaying && result?.steps) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= result.steps.length - 1) { setIsPlaying(false); return prev }
          return prev + 1
        })
      }, speed)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, speed, result])

  /* ── Scroll timeline ── */
  useEffect(() => {
    if (timelineRef.current) {
      const el = timelineRef.current.querySelector('.tl-step.active')
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentStep])

  const step = result?.steps?.[currentStep]
  const vizType = result?.viz_type || 'simple'
  const totalSteps = result?.steps?.length || 0
  const opStyle = step ? (OP_COLORS[step.operation] || OP_COLORS.LINE) : null

  /* ── Output: use output_so_far from step ── */
  const outputLines = step?.output_so_far || []

  return (
    <div className="av-root">

      {/* ──────── CONTROLS BAR ──────── */}
      <div className="av-controls">
        <button className="av-btn primary" onClick={() => visualize()} disabled={loading}>
          {loading ? '⏳ Generating...' : '🎬 Visualize'}
        </button>
        {result && <>
          <button className="av-btn" onClick={() => { setCurrentStep(0); setIsPlaying(false) }} disabled={currentStep === 0}>⏮</button>
          <button className="av-btn" onClick={() => setCurrentStep(p => Math.max(0, p - 1))} disabled={currentStep === 0}>◀</button>
          <button className="av-btn play" onClick={() => setIsPlaying(!isPlaying)} disabled={currentStep >= totalSteps - 1}>
            {isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="av-btn" onClick={() => setCurrentStep(p => Math.min(totalSteps - 1, p + 1))} disabled={currentStep >= totalSteps - 1}>▶</button>
          <button className="av-btn" onClick={() => { setCurrentStep(totalSteps - 1); setIsPlaying(false) }} disabled={currentStep >= totalSteps - 1}>⏭</button>
          <div className="av-speed">
            <span>🐢</span>
            <input type="range" min="100" max="2000" value={2100 - speed} onChange={e => setSpeed(2100 - parseInt(e.target.value))} />
            <span>🐇</span>
          </div>
          <span className="av-counter">{currentStep + 1} / {totalSteps}</span>
        </>}
      </div>

      {/* ──────── PROGRESS ──────── */}
      {result && (
        <div className="av-progress">
          <div className="av-progress-fill" style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }} />
        </div>
      )}

      {/* ──────── STATES ──────── */}
      {error && <div className="av-error">⚠️ {error}</div>}
      {loading && (
        <div className="av-loading">
          <div className="av-spinner" />
          <div>
            <div style={{ color: '#c084fc', fontSize: '13px', fontFamily: 'sans-serif' }}>Generating visualization...</div>
            <div style={{ color: '#64748b', fontSize: '11px', fontFamily: 'sans-serif' }}>Executing & analyzing code structure</div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="av-placeholder">
          <div style={{ fontSize: '56px', opacity: 0.3 }}>🎯</div>
          <p>Click <strong>Visualize</strong> to see an interactive, step-by-step algorithm animation</p>
          <small>Supports trees, arrays, DP tables, graphs, and general code</small>
        </div>
      )}

      {/* ──────── WORKSPACE ──────── */}
      {result && (
        <div className="av-workspace">

          {/* Info Bar */}
          <div className="av-infobar">
            <span className="av-viz-type">{vizType.replace('_', ' ')}</span>
            <span className="av-algo-title">{result.title}</span>
            <div className="av-badges">
              {result.time_complexity && <span className="av-badge time">⏱ {result.time_complexity}</span>}
              {result.space_complexity && <span className="av-badge space">💾 {result.space_complexity}</span>}
            </div>
          </div>

          {/* Current Operation */}
          {step && (
            <div className="av-operation" style={{ background: opStyle?.bg, borderColor: opStyle?.c }}>
              <span className="av-op-icon">{OP_ICONS[step.operation] || '•'}</span>
              <span className="av-op-name" style={{ color: opStyle?.c }}>{step.operation}</span>
              <span className="av-op-desc">{step.description}</span>
              <span className="av-op-line">line {step.code_line}</span>
            </div>
          )}

          {/* Main Split — Viz + Code */}
          <div className="av-main">
            {/* Left: Adaptive Visualization */}
            <div className="av-viz-left">
              {vizType === 'tree' && <TreeVisualizer result={result} step={step} />}
              {vizType === 'array' && <ArrayVisualizer step={step} />}
              {vizType === 'dp_table' && <DPVisualizer step={step} />}
              {vizType === 'graph' && <GraphVisualizer result={result} step={step} />}
              {vizType === 'simple' && <SimpleVisualizer step={step} />}

              {/* Variables panel (for non-simple types) */}
              {vizType !== 'simple' && step?.variables && Object.keys(step.variables).length > 0 && (
                <div className="av-vars-strip">
                  <span className="av-vars-label">Variables</span>
                  {Object.entries(step.variables).slice(0, 8).map(([k, v]) => (
                    <span key={k} className="av-var-chip">
                      <span className="av-var-chip-name">{k}</span>
                      <span className="av-var-chip-val">{
                        v === null ? 'None' : typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 30)
                      }</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Code Panel */}
            <CodePanel code={code} activeLine={step?.code_line} />
          </div>

          {/* Output Bar */}
          {outputLines.length > 0 && (
            <div className="av-output-bar">
              <span className="av-output-label">OUTPUT:</span>
              <div className="av-output-nodes">
                {outputLines.map((val, i) => (
                  <div key={i} className="av-output-node" style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className="av-output-node-val">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Output */}
          {result.final_output?.length > 0 && currentStep === totalSteps - 1 && (
            <div className="av-final-output">
              <span className="av-final-label">🎉 Final Output:</span>
              <div className="av-final-values">
                {result.final_output.map((val, i) => (
                  <span key={i} className="av-final-val">{val}</span>
                ))}
              </div>
            </div>
          )}

          {/* Step Timeline */}
          <div className="av-timeline">
            <div className="av-panel-header">📋 Steps Timeline</div>
            <div className="av-timeline-steps" ref={timelineRef}>
              {result.steps.map((s, i) => {
                const sC = OP_COLORS[s.operation] || OP_COLORS.LINE
                return (
                  <div key={i}
                    className={`tl-step ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'past' : ''}`}
                    onClick={() => { setCurrentStep(i); setIsPlaying(false) }}
                    style={{ borderLeftColor: i === currentStep ? sC.c : 'transparent' }}
                  >
                    <span className="tl-num">{i + 1}</span>
                    <span className="tl-icon">{OP_ICONS[s.operation] || '•'}</span>
                    <span className="tl-op" style={{ color: i === currentStep ? sC.c : '#64748b' }}>{s.operation}</span>
                    <span className="tl-desc">{s.description?.slice(0, 40)}</span>
                    <span className="tl-line">L{s.code_line}</span>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {/* ══════════ STYLES ══════════ */}
      <style>{`
        /* ── Root ── */
        .av-root { display: flex; flex-direction: column; gap: 10px; animation: avFadeIn 0.3s ease; }
        @keyframes avFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Controls ── */
        .av-controls {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 10px 14px; background: #0f1117;
          border: 1px solid #2d3154; border-radius: 10px;
        }
        .av-btn {
          padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
          cursor: pointer; border: 1px solid #2d3154; background: #1a1d2e;
          color: #e2e8f0; transition: all 0.15s; font-family: sans-serif;
        }
        .av-btn:hover:not(:disabled) { background: #2d3154; }
        .av-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .av-btn.primary { background: #2a1a4a; border-color: #c084fc; color: #c084fc; }
        .av-btn.primary:hover:not(:disabled) { background: #3a2a5a; }
        .av-btn.play { background: #1a2a4a; border-color: #7aa2f7; color: #7aa2f7; min-width: 80px; }
        .av-speed { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .av-speed input { width: 80px; accent-color: #c084fc; }
        .av-counter { font-size: 11px; color: #64748b; margin-left: auto; font-family: monospace; }

        /* ── Progress ── */
        .av-progress { height: 3px; background: #2d3154; border-radius: 99px; overflow: hidden; }
        .av-progress-fill { height: 100%; background: linear-gradient(90deg, #c084fc, #4ade80); border-radius: 99px; transition: width 0.3s ease; }

        /* ── States ── */
        .av-error { background: #2d1a1a; border: 1px solid #5a2d2d; border-radius: 8px; padding: 12px; color: #f87171; font-size: 12px; font-family: sans-serif; }
        .av-loading { display: flex; align-items: center; gap: 16px; padding: 24px; background: #0f1117; border: 1px solid #2d3154; border-radius: 10px; }
        .av-spinner { width: 32px; height: 32px; border: 3px solid #2d3154; border-top-color: #c084fc; border-radius: 50%; animation: avSpin 0.8s linear infinite; flex-shrink: 0; }
        @keyframes avSpin { to { transform: rotate(360deg); } }
        .av-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 280px; gap: 12px; color: #64748b; text-align: center; }
        .av-placeholder p { font-size: 13px; color: #94a3b8; font-family: sans-serif; }
        .av-placeholder small { font-size: 11px; font-family: sans-serif; }

        /* ── Workspace ── */
        .av-workspace { display: flex; flex-direction: column; gap: 10px; }

        /* ── Info Bar ── */
        .av-infobar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 10px 14px; background: #0f1117;
          border: 1px solid #2d3154; border-radius: 10px;
        }
        .av-viz-type {
          font-size: 10px; font-weight: 700; padding: 3px 8px;
          background: #2a1a4a; border: 1px solid #5a2d8a; border-radius: 99px;
          color: #c084fc; text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.5px;
        }
        .av-algo-title { font-size: 14px; font-weight: 700; color: #e2e8f0; font-family: sans-serif; }
        .av-badges { display: flex; gap: 6px; margin-left: auto; }
        .av-badge { font-size: 11px; padding: 3px 8px; border-radius: 99px; font-family: sans-serif; font-weight: 500; }
        .av-badge.time { background: #1a2a1a; border: 1px solid #4ade8044; color: #4ade80; }
        .av-badge.space { background: #1a2a4a; border: 1px solid #7aa2f744; color: #7aa2f7; }

        /* ── Operation ── */
        .av-operation {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border: 1px solid; border-radius: 10px; flex-wrap: wrap;
          animation: avFadeIn 0.2s ease;
        }
        .av-op-icon { font-size: 16px; }
        .av-op-name { font-size: 12px; font-weight: 700; text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.5px; }
        .av-op-desc { font-size: 12px; color: #94a3b8; font-family: sans-serif; flex: 1; }
        .av-op-line { font-size: 11px; color: #64748b; font-family: monospace; }

        /* ── Main Layout ── */
        .av-main { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 10px; }
        .av-viz-left { display: flex; flex-direction: column; gap: 10px; }

        /* ── Shared Panel ── */
        .av-viz-panel, .av-code-panel {
          background: #0f1117; border: 1px solid #2d3154; border-radius: 10px; overflow: hidden;
        }
        .av-panel-header {
          padding: 8px 14px; font-size: 11px; font-weight: 600; color: #64748b;
          border-bottom: 1px solid #2d3154; background: #1a1d2e;
          text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;
          display: flex; align-items: center; gap: 10px;
        }
        .av-viz-svg-wrap { overflow: auto; padding: 10px; min-height: 200px; background: #0a0d14; }

        /* ── Tree extras ── */
        .av-trav-order { display: flex; gap: 4px; margin-left: auto; }
        .av-trav-phase {
          font-size: 10px; padding: 2px 6px; border-radius: 4px;
          background: #1a1d2e; color: #64748b; font-family: monospace; font-weight: 600;
          transition: all 0.2s;
        }
        .av-trav-phase.active { background: #1a3a1a; color: #4ade80; border: 1px solid #4ade8044; }
        .av-trav-arrow { color: #3d4268; margin: 0 2px; }

        /* ── Array ── */
        .av-array-container { padding: 16px; }
        .av-array-bars { display: flex; align-items: flex-end; gap: 6px; min-height: 200px; overflow-x: auto; padding-bottom: 30px; }
        .av-bar-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; min-width: 36px; }
        .av-bar-val-top { font-size: 11px; font-weight: 700; color: #e2e8f0; font-family: monospace; }
        .av-bar { width: 32px; border-radius: 4px 4px 0 0; min-height: 8px; }
        .av-bar-idx { font-size: 10px; color: #3d4268; font-family: monospace; }
        .av-bar-ptr { font-size: 9px; font-weight: 700; font-family: monospace; white-space: nowrap; animation: avFadeIn 0.2s ease; }
        .av-array-legend { display: flex; gap: 16px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #2d3154; }
        .av-legend-item { font-size: 10px; color: #64748b; font-family: sans-serif; display: flex; align-items: center; gap: 4px; }
        .av-legend-dot { width: 8px; height: 8px; border-radius: 50%; }

        /* ── DP ── */
        .av-dp-container { padding: 16px; }
        .av-dp-aux { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
        .av-dp-aux-item { font-size: 12px; font-family: sans-serif; }
        .av-dp-aux-label { color: #64748b; margin-right: 4px; }
        .av-dp-aux-val { color: #c084fc; font-weight: 600; font-family: monospace; }
        .av-dp-grid { overflow-x: auto; }
        .av-dp-row { display: flex; gap: 2px; }
        .av-dp-idx-row { margin-bottom: 4px; }
        .av-dp-cell {
          min-width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
          background: #1a1d2e; border: 1px solid #2d3154; border-radius: 6px;
          font-size: 13px; font-weight: 600; color: #64748b; font-family: monospace;
          transition: all 0.3s ease;
        }
        .av-dp-idx { background: transparent; border: none; color: #3d4268; font-size: 10px; height: 24px; }
        .av-dp-cell.filled { background: #1a2a4a; border-color: #7aa2f744; color: #7aa2f7; }
        .av-dp-cell.current { background: #1a3a1a; border-color: #4ade80; color: #4ade80; box-shadow: 0 0 12px #4ade8033; }
        @keyframes dp-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }

        /* ── Graph ── */
        .av-graph-queue {
          display: flex; align-items: center; gap: 6px; padding: 8px 12px;
          background: #1a1d2e; border-top: 1px solid #2d3154; flex-wrap: wrap;
        }
        .av-graph-queue-label { font-size: 10px; font-weight: 700; color: #c084fc; font-family: sans-serif; text-transform: uppercase; }
        .av-graph-queue-item {
          font-size: 11px; padding: 3px 8px; background: #2a1a4a; border: 1px solid #c084fc44;
          border-radius: 6px; color: #c084fc; font-family: monospace; font-weight: 600;
        }

        /* ── Simple ── */
        .av-simple-container { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
        .av-var-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
        .av-var-card {
          padding: 8px 10px; background: #1a1d2e; border: 1px solid #2d3154;
          border-radius: 8px; transition: all 0.3s; display: flex; flex-direction: column; gap: 3px;
        }
        .av-var-card.changed { border-color: #4ade80; background: #1a3a1a; animation: avFadeIn 0.2s ease; }
        .av-var-name { font-size: 10px; color: #7aa2f7; font-family: monospace; font-weight: 700; text-transform: uppercase; }
        .av-var-val { font-size: 13px; color: #e2e8f0; font-family: monospace; word-break: break-all; }
        .av-var-empty { font-size: 12px; color: #3d4268; font-family: sans-serif; font-style: italic; }
        .av-call-stack { display: flex; flex-direction: column; gap: 2px; }
        .av-cs-label { font-size: 10px; font-weight: 700; color: #64748b; font-family: sans-serif; text-transform: uppercase; margin-bottom: 4px; }
        .av-cs-frame {
          display: flex; justify-content: space-between; padding: 4px 8px;
          background: #1a1d2e; border: 1px solid #2d3154; border-radius: 4px; font-size: 11px; font-family: monospace;
        }
        .av-cs-frame.top { border-color: #7aa2f7; background: #1a2a4a; }
        .av-cs-fn { color: #e2e8f0; }
        .av-cs-line { color: #64748b; }

        /* ── Variables Strip ── */
        .av-vars-strip {
          display: flex; align-items: center; gap: 8px; padding: 8px 12px;
          background: #0f1117; border: 1px solid #2d3154; border-radius: 8px;
          overflow-x: auto; flex-wrap: nowrap;
        }
        .av-vars-label { font-size: 10px; font-weight: 700; color: #64748b; font-family: sans-serif; text-transform: uppercase; flex-shrink: 0; }
        .av-var-chip {
          display: flex; align-items: center; gap: 4px; padding: 3px 8px;
          background: #1a1d2e; border: 1px solid #2d3154; border-radius: 6px;
          flex-shrink: 0; font-size: 11px; font-family: monospace;
        }
        .av-var-chip-name { color: #7aa2f7; font-weight: 600; }
        .av-var-chip-val { color: #e2e8f0; }

        /* ── Code Panel ── */
        .av-code { overflow-y: auto; max-height: 400px; padding: 8px 0; }
        .code-line {
          display: flex; align-items: center; padding: 2px 8px;
          font-family: 'Courier New', monospace; font-size: 12px;
          line-height: 1.8; transition: background 0.2s;
        }
        .code-line.active {
          background: #1a3a1a; border-left: 3px solid #4ade80;
          animation: avPulseGreen 1s ease infinite;
        }
        @keyframes avPulseGreen { 0%, 100% { background: #1a3a1a; } 50% { background: #1a4a1a; } }
        .code-line-num { min-width: 28px; color: #3d4268; font-size: 11px; text-align: right; padding-right: 10px; user-select: none; }
        .code-line-text { color: #e2e8f0; flex: 1; white-space: pre; }
        .code-line.active .code-line-text { color: #86efac; }
        .code-line-indicator { font-size: 10px; color: #4ade80; animation: avBlink 1s ease infinite; }
        @keyframes avBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

        /* ── Output ── */
        .av-output-bar {
          display: flex; align-items: center; gap: 12px; padding: 10px 14px;
          background: #0f1117; border: 1px solid #2d3154; border-radius: 10px;
          flex-wrap: wrap; overflow-x: auto;
        }
        .av-output-label { font-size: 11px; font-weight: 700; color: #4ade80; font-family: sans-serif; letter-spacing: 1px; flex-shrink: 0; }
        .av-output-nodes { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .av-output-node {
          padding: 6px 12px; border-radius: 8px; background: #1a3a1a;
          border: 2px solid #4ade80; color: #4ade80; font-size: 12px;
          font-weight: 700; font-family: monospace; animation: avPopIn 0.3s ease both;
          white-space: nowrap;
        }
        @keyframes avPopIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        /* ── Final Output ── */
        .av-final-output {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          background: #1a3a1a; border: 1px solid #4ade80; border-radius: 10px;
          animation: avFadeIn 0.5s ease; flex-wrap: wrap;
        }
        .av-final-label { font-size: 13px; font-weight: 600; color: #4ade80; font-family: sans-serif; flex-shrink: 0; }
        .av-final-values { display: flex; gap: 8px; flex-wrap: wrap; }
        .av-final-val {
          font-size: 12px; font-weight: 600; color: #4ade80; font-family: monospace;
          background: rgba(74,222,128,0.1); padding: 4px 10px; border-radius: 6px;
          border: 1px solid #4ade8044; max-width: 300px; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }

        /* ── Timeline ── */
        .av-timeline { background: #0f1117; border: 1px solid #2d3154; border-radius: 10px; overflow: hidden; }
        .av-timeline-steps { max-height: 200px; overflow-y: auto; }
        .tl-step {
          display: flex; align-items: center; gap: 8px; padding: 6px 14px;
          border-bottom: 1px solid #2d315433; border-left: 3px solid transparent;
          cursor: pointer; transition: all 0.15s; font-family: sans-serif;
        }
        .tl-step:hover { background: #1a1d2e; }
        .tl-step.active { background: #1a1d2e; }
        .tl-step.past { opacity: 0.5; }
        .tl-num { min-width: 20px; font-size: 10px; color: #3d4268; font-family: monospace; }
        .tl-icon { font-size: 11px; }
        .tl-op { font-size: 10px; font-weight: 700; min-width: 70px; text-transform: uppercase; }
        .tl-desc { font-size: 11px; color: #64748b; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tl-line { font-size: 10px; color: #3d4268; font-family: monospace; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .av-main { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

export default AlgoVisualizer