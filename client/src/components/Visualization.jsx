function Visualization({ data }) {
  if (!data) return null

  return (
    <div className="visualization">
      {/* Summary Bar */}
      <div className="summary-bar">
        {data.language && (
          <span className="summary-pill lang">
            🖥 {data.language}
          </span>
        )}
        {data.complexity && (
          <span className="summary-pill complexity">
            ⚡ {data.complexity}
          </span>
        )}
        {data.lines && (
          <span className="summary-pill lines">
            📄 {data.lines} lines
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="steps">
        {(data.steps || []).map((step, index) => (
          <div className="step-card" key={index} style={{ animationDelay: `${index * 0.08}s` }}>
            <div className="step-header">
              <div className="step-num">{index + 1}</div>
              <div className="step-title">{step.title}</div>
            </div>
            <div className="step-explanation">{step.explanation}</div>
            {step.code && (
              <div className="step-code">
                <pre>{step.code}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .visualization {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .summary-bar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 4px;
        }
        .summary-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 99px;
          font-weight: 500;
        }
        .summary-pill.lang {
          background: #1a2744;
          border: 1px solid #2d4a8a;
          color: #7aa2f7;
        }
        .summary-pill.complexity {
          background: #1a2a1a;
          border: 1px solid #2d5a2d;
          color: #7ac97a;
        }
        .summary-pill.lines {
          background: #2a1a2a;
          border: 1px solid #5a2d5a;
          color: #c97ac9;
        }
        .steps {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .step-card {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          padding: 12px 14px;
          animation: slideIn 0.3s ease both;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .step-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .step-num {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #1D9E75;
          color: white;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .step-title {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
        }
        .step-explanation {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.65;
          margin-left: 34px;
        }
        .step-code {
          margin-top: 8px;
          margin-left: 34px;
          background: #1a1d2e;
          border: 1px solid #2d3154;
          border-radius: 6px;
          padding: 8px 12px;
          overflow-x: auto;
        }
        .step-code pre {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #7aa2f7;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  )
}

export default Visualization