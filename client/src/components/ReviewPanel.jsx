function ReviewPanel({ data }) {
  if (!data || typeof data !== 'object') return (
    <div style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>
      <span style={{ fontSize: '36px', opacity: 0.4 }}>✅</span>
      <p>No review data available</p>
    </div>
  )

  const sections = [
    {
      key: 'bugs',
      label: 'Bugs & Issues',
      icon: '🐛',
      className: 'badge-bug'
    },
    {
      key: 'improvements',
      label: 'Improvements',
      icon: '💡',
      className: 'badge-improve'
    },
    {
      key: 'strengths',
      label: 'Strengths',
      icon: '👍',
      className: 'badge-good'
    },
    {
      key: 'info',
      label: 'Info',
      icon: 'ℹ️',
      className: 'badge-info'
    }
  ]

  // Normalize items — handle cases where items are strings or have different key names
  const normalizeItem = (item) => {
    if (typeof item === 'string') {
      return { title: 'Note', detail: item }
    }
    if (typeof item === 'object' && item !== null) {
      return {
        title: item.title || item.name || item.issue || 'Item',
        detail: item.detail || item.description || item.explanation || item.message || JSON.stringify(item)
      }
    }
    return { title: 'Note', detail: String(item) }
  }

  const hasAnyItems = sections.some(section => {
    const items = data[section.key]
    return Array.isArray(items) && items.length > 0
  })

  if (!hasAnyItems) return (
    <div style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>
      <span style={{ fontSize: '36px', opacity: 0.4 }}>✅</span>
      <p>No issues found — code looks good!</p>
    </div>
  )

  return (
    <div className="review-panel">
      {sections.map((section) => {
        const rawItems = data[section.key]
        if (!Array.isArray(rawItems) || rawItems.length === 0) return null
        const items = rawItems.map(normalizeItem)

        return (
          <div className="review-section" key={section.key}>
            <div className={`review-badge ${section.className}`}>
              {section.icon} {section.label} ({items.length})
            </div>
            <div className="review-items">
              {items.map((item, index) => (
                <div className="review-item" key={index}>
                  <span className="review-item-title">{item.title}:</span>
                  <span className="review-item-detail"> {item.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <style>{`
        .review-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .review-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .review-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          width: fit-content;
        }
        .badge-bug {
          background: #2d1a1a;
          border: 1px solid #5a2d2d;
          color: #f87171;
        }
        .badge-improve {
          background: #2a2010;
          border: 1px solid #5a4a10;
          color: #fbbf24;
        }
        .badge-good {
          background: #1a2a1a;
          border: 1px solid #2d5a2d;
          color: #4ade80;
        }
        .badge-info {
          background: #1a2744;
          border: 1px solid #2d4a8a;
          color: #7aa2f7;
        }
        .review-items {
          display: flex;
          flex-direction: column;
          gap: 0;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 8px;
          overflow: hidden;
        }
        .review-item {
          padding: 10px 14px;
          font-size: 12px;
          line-height: 1.65;
          border-bottom: 1px solid #2d3154;
          color: #94a3b8;
        }
        .review-item:last-child {
          border-bottom: none;
        }
        .review-item-title {
          font-weight: 600;
          color: #e2e8f0;
        }
        .review-item-detail {
          color: #94a3b8;
        }
      `}</style>
    </div>
  )
}

export default ReviewPanel