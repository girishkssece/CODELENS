function VariablesPanel({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="no-vars">
        <span>📦</span>
        <p>No variables found</p>
      </div>
    )
  }

  return (
    <div className="variables-panel">
      <div className="vars-table-wrapper">
        <table className="vars-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Initial Value</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {data.map((v, index) => (
              <tr key={index}>
                <td className="var-name">{v.name}</td>
                <td className="var-type">{v.type || 'unknown'}</td>
                <td className="var-value">{v.initial_value || '—'}</td>
                <td className="var-role">{v.role || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .variables-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .no-vars {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          gap: 10px;
          color: #475569;
          font-size: 13px;
        }
        .no-vars span {
          font-size: 36px;
          opacity: 0.4;
        }
        .vars-table-wrapper {
          overflow-x: auto;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .vars-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .vars-table thead {
          background: #0f1117;
        }
        .vars-table th {
          padding: 10px 14px;
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d3154;
        }
        .vars-table tbody tr {
          border-bottom: 1px solid #2d3154;
          transition: background 0.15s;
        }
        .vars-table tbody tr:last-child {
          border-bottom: none;
        }
        .vars-table tbody tr:hover {
          background: #1a1d2e;
        }
        .vars-table td {
          padding: 10px 14px;
          vertical-align: top;
        }
        .var-name {
          font-family: 'Courier New', monospace;
          font-weight: 700;
          color: #e2e8f0;
        }
        .var-type {
          font-family: 'Courier New', monospace;
          color: #7aa2f7;
        }
        .var-value {
          font-family: 'Courier New', monospace;
          color: #4ade80;
        }
        .var-role {
          color: #94a3b8;
          line-height: 1.5;
        }
      `}</style>
    </div>
  )
}

export default VariablesPanel