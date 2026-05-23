import { useState, useMemo } from 'react'
import * as Diff from 'diff'

function CodeDiff() {
  const [originalCode, setOriginalCode] = useState('')
  const [modifiedCode, setModifiedCode] = useState('')
  const [viewMode, setViewMode] = useState('split') // split or unified

  const diffResult = useMemo(() => {
    if (!originalCode && !modifiedCode) return []
    return Diff.diffLines(originalCode, modifiedCode)
  }, [originalCode, modifiedCode])

  const stats = useMemo(() => {
    let added = 0, removed = 0, unchanged = 0
    diffResult.forEach(part => {
      const lines = part.value.split('\n').filter(l => l !== '').length
      if (part.added) added += lines
      else if (part.removed) removed += lines
      else unchanged += lines
    })
    return { added, removed, unchanged }
  }, [diffResult])

  // Build split view lines
  const splitLines = useMemo(() => {
    const left = []
    const right = []
    let leftNum = 1
    let rightNum = 1

    diffResult.forEach(part => {
      const lines = part.value.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()

      if (part.removed) {
        lines.forEach(line => {
          left.push({ num: leftNum++, text: line, type: 'removed' })
          right.push({ num: null, text: '', type: 'empty' })
        })
      } else if (part.added) {
        lines.forEach(line => {
          left.push({ num: null, text: '', type: 'empty' })
          right.push({ num: rightNum++, text: line, type: 'added' })
        })
      } else {
        lines.forEach(line => {
          left.push({ num: leftNum++, text: line, type: 'unchanged' })
          right.push({ num: rightNum++, text: line, type: 'unchanged' })
        })
      }
    })
    return { left, right }
  }, [diffResult])

  // Build unified view lines
  const unifiedLines = useMemo(() => {
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
  }, [diffResult])

  const hasChanges = diffResult.some(p => p.added || p.removed)

  return (
    <div className="code-diff">

      {/* Header */}
      <div className="diff-header">
        <div className="diff-stats">
          {(originalCode || modifiedCode) && (
            <>
              <span className="diff-stat added">+{stats.added} added</span>
              <span className="diff-stat removed">-{stats.removed} removed</span>
              <span className="diff-stat unchanged">{stats.unchanged} unchanged</span>
            </>
          )}
        </div>
        <div className="diff-view-toggle">
          <button
            className={`diff-toggle-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            ⬜⬜ Split
          </button>
          <button
            className={`diff-toggle-btn ${viewMode === 'unified' ? 'active' : ''}`}
            onClick={() => setViewMode('unified')}
          >
            ☰ Unified
          </button>
        </div>
      </div>

      {/* Editors */}
      <div className="diff-editors">
        <div className="diff-editor-panel">
          <div className="diff-editor-header original">
            📄 Original Code
          </div>
          <textarea
            className="diff-textarea"
            value={originalCode}
            onChange={e => setOriginalCode(e.target.value)}
            placeholder="Paste your original code here..."
            spellCheck={false}
          />
        </div>
        <div className="diff-editor-panel">
          <div className="diff-editor-header modified">
            ✏️ Modified Code
          </div>
          <textarea
            className="diff-textarea"
            value={modifiedCode}
            onChange={e => setModifiedCode(e.target.value)}
            placeholder="Paste your modified code here..."
            spellCheck={false}
          />
        </div>
      </div>

      {/* Diff Result */}
      {(originalCode || modifiedCode) && (
        <div className="diff-result">
          <div className="diff-result-header">
            🔍 Diff Result
            {!hasChanges && originalCode && modifiedCode && (
              <span className="diff-no-changes">✅ No changes detected</span>
            )}
          </div>

          {viewMode === 'split' ? (
            <div className="diff-split-view">
              <div className="diff-split-pane">
                <div className="diff-pane-header">Original</div>
                {splitLines.left.map((line, i) => (
                  <div key={i} className={`diff-line diff-line-${line.type}`}>
                    <span className="diff-line-num">{line.num || ''}</span>
                    <span className="diff-line-prefix">
                      {line.type === 'removed' ? '-' : ' '}
                    </span>
                    <span className="diff-line-text">{line.text}</span>
                  </div>
                ))}
              </div>
              <div className="diff-split-divider" />
              <div className="diff-split-pane">
                <div className="diff-pane-header">Modified</div>
                {splitLines.right.map((line, i) => (
                  <div key={i} className={`diff-line diff-line-${line.type}`}>
                    <span className="diff-line-num">{line.num || ''}</span>
                    <span className="diff-line-prefix">
                      {line.type === 'added' ? '+' : ' '}
                    </span>
                    <span className="diff-line-text">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="diff-unified-view">
              {unifiedLines.map((line, i) => (
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
      )}

      {!originalCode && !modifiedCode && (
        <div className="diff-placeholder">
          <div style={{ fontSize: '48px', opacity: 0.4 }}>🔀</div>
          <p>Paste two versions of code above to compare</p>
          <small>See exactly what changed between versions</small>
        </div>
      )}

      <style>{`
        .code-diff {
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeIn 0.3s ease;
        }
        .diff-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .diff-stats {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .diff-stat {
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 99px;
          font-family: monospace;
        }
        .diff-stat.added {
          background: #1a3a1a;
          border: 1px solid #4ade80;
          color: #4ade80;
        }
        .diff-stat.removed {
          background: #3a1a1a;
          border: 1px solid #f87171;
          color: #f87171;
        }
        .diff-stat.unchanged {
          background: #1a1d2e;
          border: 1px solid #2d3154;
          color: #64748b;
        }
        .diff-view-toggle {
          display: flex;
          gap: 4px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 8px;
          padding: 3px;
        }
        .diff-toggle-btn {
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
        .diff-toggle-btn.active {
          background: #1a1d2e;
          color: #e2e8f0;
          border: 1px solid #2d3154;
        }
        .diff-editors {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .diff-editor-panel {
          display: flex;
          flex-direction: column;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .diff-editor-header {
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          border-bottom: 1px solid #2d3154;
        }
        .diff-editor-header.original {
          background: #2d1a1a;
          color: #f87171;
        }
        .diff-editor-header.modified {
          background: #1a2d1a;
          color: #4ade80;
        }
        .diff-textarea {
          flex: 1;
          resize: none;
          border: none;
          outline: none;
          padding: 12px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.7;
          background: #0f1117;
          color: #e2e8f0;
          min-height: 200px;
          tab-size: 2;
        }
        .diff-result {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .diff-result-header {
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .diff-no-changes {
          font-size: 12px;
          color: #4ade80;
          text-transform: none;
          font-weight: 500;
        }
        .diff-split-view {
          display: grid;
          grid-template-columns: 1fr 2px 1fr;
          max-height: 400px;
          overflow-y: auto;
        }
        .diff-split-divider {
          background: #2d3154;
        }
        .diff-split-pane {
          overflow-x: auto;
        }
        .diff-pane-header {
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: #1a1d2e;
          border-bottom: 1px solid #2d3154;
          position: sticky;
          top: 0;
        }
        .diff-unified-view {
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
        .diff-line-added {
          background: #1a3a1a;
        }
        .diff-line-removed {
          background: #3a1a1a;
        }
        .diff-line-unchanged {
          background: transparent;
        }
        .diff-line-empty {
          background: #1a1d2e;
          opacity: 0.3;
        }
        .diff-line-num {
          min-width: 30px;
          color: #3d4268;
          font-size: 10px;
          text-align: right;
          padding-right: 8px;
          user-select: none;
        }
        .diff-line-prefix {
          min-width: 16px;
          font-weight: 700;
          color: #64748b;
        }
        .diff-line-added .diff-line-prefix { color: #4ade80; }
        .diff-line-removed .diff-line-prefix { color: #f87171; }
        .diff-line-text {
          color: #e2e8f0;
          white-space: pre;
          flex: 1;
        }
        .diff-line-added .diff-line-text { color: #86efac; }
        .diff-line-removed .diff-line-text { color: #fca5a5; }
        .diff-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          gap: 10px;
          color: #64748b;
          text-align: center;
        }
        .diff-placeholder p {
          font-size: 13px;
          color: #94a3b8;
        }
        .diff-placeholder small {
          font-size: 11px;
        }
        @media (max-width: 768px) {
          .diff-editors { grid-template-columns: 1fr; }
          .diff-split-view { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

export default CodeDiff