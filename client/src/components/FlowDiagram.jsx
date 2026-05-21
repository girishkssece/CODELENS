import { useEffect, useRef, useState } from 'react'

const NODE_COLORS = {
  start:    { bg: '#1a4a2a', border: '#4ade80', text: '#4ade80' },
  end:      { bg: '#4a1a1a', border: '#f87171', text: '#f87171' },
  process:  { bg: '#1a2a4a', border: '#7aa2f7', text: '#7aa2f7' },
  decision: { bg: '#4a3a1a', border: '#fbbf24', text: '#fbbf24' },
  loop:     { bg: '#3a1a4a', border: '#c084fc', text: '#c084fc' },
}

const NODE_ICONS = {
  start: '▶',
  end: '⏹',
  process: '⚙',
  decision: '◆',
  loop: '↻',
}

function FlowDiagram({ data }) {
  const [activeNode, setActiveNode] = useState(null)
  const [animatedNodes, setAnimatedNodes] = useState([])
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    if (!data?.nodes) return
    setAnimatedNodes([])
    data.nodes.forEach((node, i) => {
      setTimeout(() => {
        setAnimatedNodes(prev => [...prev, node.id])
      }, i * 200)
    })
  }, [data])

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="flow-placeholder">
        <div className="flow-placeholder-icon">🔀</div>
        <p>No flow data available</p>
        <small>Analyze your code to see the flow diagram</small>
      </div>
    )
  }

  const nodes = data.nodes
  const edges = data.edges || []

  // Layout nodes in a vertical flow
  const NODE_WIDTH = 180
  const NODE_HEIGHT = 60
  const H_GAP = 220
  const V_GAP = 100
  const CANVAS_PADDING = 40

  // Simple layout — place nodes in columns based on connections
  const getNodePosition = (index, total) => {
    const cols = Math.ceil(Math.sqrt(total))
    const col = index % cols
    const row = Math.floor(index / cols)
    return {
      x: CANVAS_PADDING + col * H_GAP,
      y: CANVAS_PADDING + row * V_GAP
    }
  }

  // For linear flow, just stack vertically
  const positions = {}
  nodes.forEach((node, i) => {
    // Check if this is a decision node — branch left/right
    const isDecision = node.type === 'decision'
    positions[node.id] = {
      x: CANVAS_PADDING + 100,
      y: CANVAS_PADDING + i * V_GAP
    }
  })

  // Adjust for branching
  const decisionNodes = nodes.filter(n => n.type === 'decision')
  decisionNodes.forEach(dNode => {
    const outEdges = edges.filter(e => e.from === dNode.id)
    if (outEdges.length >= 2) {
      const pos = positions[dNode.id]
      outEdges.forEach((edge, i) => {
        const targetPos = positions[edge.to]
        if (targetPos && i === 1) {
          targetPos.x = pos.x + 220
        }
      })
    }
  })

  const svgWidth = Math.max(...Object.values(positions).map(p => p.x)) + NODE_WIDTH + CANVAS_PADDING * 2
  const svgHeight = Math.max(...Object.values(positions).map(p => p.y)) + NODE_HEIGHT + CANVAS_PADDING * 2

  const getNodeShape = (node, pos) => {
    const colors = NODE_COLORS[node.type] || NODE_COLORS.process
    const isAnimated = animatedNodes.includes(node.id)
    const isActive = activeNode === node.id

    const baseStyle = {
      opacity: isAnimated ? 1 : 0,
      transition: 'opacity 0.3s ease',
      cursor: 'pointer',
    }

    if (node.type === 'decision') {
      // Diamond shape
      const cx = pos.x + NODE_WIDTH / 2
      const cy = pos.y + NODE_HEIGHT / 2
      const w = NODE_WIDTH / 2
      const h = NODE_HEIGHT / 2
      const points = `${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`
      return (
        <g key={node.id} style={baseStyle}
          onClick={() => setActiveNode(activeNode === node.id ? null : node.id)}
          onMouseEnter={(e) => setTooltip({ id: node.id, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTooltip(null)}
        >
          <polygon
            points={points}
            fill={isActive ? colors.border + '44' : colors.bg}
            stroke={colors.border}
            strokeWidth={isActive ? 3 : 1.5}
          />
          <text x={cx} y={cy - 6} textAnchor="middle" fill={colors.text} fontSize="10" fontWeight="600">
            {NODE_ICONS[node.type]} {node.label.slice(0, 12)}
          </text>
          {node.label.length > 12 && (
            <text x={cx} y={cy + 8} textAnchor="middle" fill={colors.text} fontSize="9">
              {node.label.slice(12, 24)}
            </text>
          )}
        </g>
      )
    }

    if (node.type === 'start' || node.type === 'end') {
      // Rounded pill
      return (
        <g key={node.id} style={baseStyle}
          onClick={() => setActiveNode(activeNode === node.id ? null : node.id)}
          onMouseEnter={(e) => setTooltip({ id: node.id, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTooltip(null)}
        >
          <rect
            x={pos.x + 20} y={pos.y + 10}
            width={NODE_WIDTH - 40} height={NODE_HEIGHT - 20}
            rx={20} ry={20}
            fill={isActive ? colors.border + '44' : colors.bg}
            stroke={colors.border}
            strokeWidth={isActive ? 3 : 1.5}
          />
          <text
            x={pos.x + NODE_WIDTH / 2}
            y={pos.y + NODE_HEIGHT / 2 + 4}
            textAnchor="middle"
            fill={colors.text}
            fontSize="11"
            fontWeight="700"
          >
            {NODE_ICONS[node.type]} {node.label}
          </text>
        </g>
      )
    }

    // Default rectangle
    return (
      <g key={node.id} style={baseStyle}
        onClick={() => setActiveNode(activeNode === node.id ? null : node.id)}
        onMouseEnter={(e) => setTooltip({ id: node.id, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
      >
        <rect
          x={pos.x} y={pos.y}
          width={NODE_WIDTH} height={NODE_HEIGHT}
          rx={8} ry={8}
          fill={isActive ? colors.border + '44' : colors.bg}
          stroke={isActive ? colors.border : colors.border + '99'}
          strokeWidth={isActive ? 2.5 : 1.5}
        />
        <text
          x={pos.x + NODE_WIDTH / 2}
          y={pos.y + NODE_HEIGHT / 2 - 6}
          textAnchor="middle"
          fill={colors.text}
          fontSize="11"
          fontWeight="600"
        >
          {NODE_ICONS[node.type]} {node.label.slice(0, 18)}
        </text>
        {node.label.length > 18 && (
          <text
            x={pos.x + NODE_WIDTH / 2}
            y={pos.y + NODE_HEIGHT / 2 + 8}
            textAnchor="middle"
            fill={colors.text + 'aa'}
            fontSize="9"
          >
            {node.label.slice(18, 36)}
          </text>
        )}
      </g>
    )
  }

  const getEdgePath = (edge) => {
    const fromPos = positions[edge.from]
    const toPos = positions[edge.to]
    if (!fromPos || !toPos) return null

    const x1 = fromPos.x + NODE_WIDTH / 2
    const y1 = fromPos.y + NODE_HEIGHT
    const x2 = toPos.x + NODE_WIDTH / 2
    const y2 = toPos.y

    const midY = (y1 + y2) / 2

    return (
      <g key={`${edge.from}-${edge.to}`}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#3d4268" />
          </marker>
        </defs>
        <path
          d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
          fill="none"
          stroke="#3d4268"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
          strokeDasharray="4 2"
        />
        {edge.label && (
          <text
            x={(x1 + x2) / 2}
            y={midY}
            textAnchor="middle"
            fill="#64748b"
            fontSize="9"
            fontStyle="italic"
          >
            {edge.label}
          </text>
        )}
      </g>
    )
  }

  const activeNodeData = nodes.find(n => n.id === activeNode)

  return (
    <div className="flow-diagram">
      {/* Legend */}
      <div className="flow-legend">
        {Object.entries(NODE_COLORS).map(([type, colors]) => (
          <span key={type} className="legend-item" style={{ borderColor: colors.border, color: colors.text }}>
            {NODE_ICONS[type]} {type}
          </span>
        ))}
      </div>

      {/* Active node info */}
      {activeNodeData && (
        <div className="flow-node-info" style={{ borderColor: NODE_COLORS[activeNodeData.type]?.border }}>
          <span className="flow-node-info-type" style={{ color: NODE_COLORS[activeNodeData.type]?.text }}>
            {NODE_ICONS[activeNodeData.type]} {activeNodeData.type.toUpperCase()}
          </span>
          <span className="flow-node-info-label">{activeNodeData.label}</span>
          <span className="flow-node-info-desc">{activeNodeData.description}</span>
        </div>
      )}

      {/* SVG Flowchart */}
      <div className="flow-svg-wrapper">
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ minWidth: '100%' }}
        >
          {/* Edges first (behind nodes) */}
          {edges.map(edge => getEdgePath(edge))}
          {/* Nodes */}
          {nodes.map(node => getNodeShape(node, positions[node.id] || { x: 0, y: 0 }))}
        </svg>
      </div>

      <style>{`
        .flow-diagram {
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeIn 0.4s ease;
        }
        .flow-legend {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .legend-item {
          font-size: 10px;
          padding: 3px 8px;
          border: 1px solid;
          border-radius: 99px;
          font-family: sans-serif;
          font-weight: 500;
          text-transform: capitalize;
        }
        .flow-node-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid;
          border-radius: 8px;
          flex-wrap: wrap;
        }
        .flow-node-info-type {
          font-size: 11px;
          font-weight: 700;
          font-family: sans-serif;
        }
        .flow-node-info-label {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          font-family: sans-serif;
        }
        .flow-node-info-desc {
          font-size: 12px;
          color: #94a3b8;
          font-family: sans-serif;
        }
        .flow-svg-wrapper {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 12px;
          overflow: auto;
          padding: 16px;
          min-height: 300px;
        }
        .flow-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 300px;
          gap: 10px;
          color: #64748b;
          text-align: center;
        }
        .flow-placeholder-icon {
          font-size: 48px;
          opacity: 0.4;
        }
        .flow-placeholder p {
          font-size: 14px;
          color: #94a3b8;
        }
        .flow-placeholder small {
          font-size: 12px;
        }
      `}</style>
    </div>
  )
}

export default FlowDiagram