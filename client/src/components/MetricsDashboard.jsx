import { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts'
import API_BASE from '../config'

const COLORS = ['#58a6ff', '#3fb950', '#f78166', '#bc8cff', '#e3b341', '#39c5cf', '#f97316', '#4ade80', '#c084fc']

function MetricsDashboard({ token }) {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_BASE}/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setMetrics(response.data)
    } catch (err) {
      setError('Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="metrics-loading">
      <div className="metrics-spinner" />
      <span>Loading your analytics...</span>
    </div>
  )

  if (error) return (
    <div className="metrics-error">⚠️ {error}</div>
  )

  if (!metrics || metrics.total_analyses === 0) return (
    <div className="metrics-empty">
      <div style={{ fontSize: '48px', opacity: 0.3 }}>📊</div>
      <p>No analysis data yet</p>
      <small>Analyze some code to see your metrics!</small>
    </div>
  )

  // Prepare chart data
  const languageData = Object.entries(metrics.languages || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const complexityData = Object.entries(metrics.complexity_distribution || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Timeline data — group by date
  const timelineMap = {}
  ;(metrics.timeline || []).forEach(item => {
    const date = item.date
    if (!timelineMap[date]) timelineMap[date] = { date, count: 0, lines: 0 }
    timelineMap[date].count++
    timelineMap[date].lines += item.lines || 0
  })
  const timelineData = Object.values(timelineMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14) // last 14 days

  const qualityColor = metrics.avg_quality_score >= 80 ? '#3fb950'
    : metrics.avg_quality_score >= 60 ? '#e3b341' : '#f78166'

  return (
    <div className="metrics-dashboard">
      {/* Header */}
      <div className="metrics-header">
        <h2>📊 Your Code Analytics</h2>
        <button className="metrics-refresh" onClick={fetchMetrics}>↺ Refresh</button>
      </div>

      {/* Summary Cards */}
      <div className="metrics-cards">
        <div className="metric-card blue">
          <div className="metric-icon">🔍</div>
          <div className="metric-value">{metrics.total_analyses}</div>
          <div className="metric-label">Total Analyses</div>
        </div>
        <div className="metric-card green">
          <div className="metric-icon">💻</div>
          <div className="metric-value">{metrics.most_analyzed_language}</div>
          <div className="metric-label">Top Language</div>
        </div>
        <div className="metric-card red">
          <div className="metric-icon">🐛</div>
          <div className="metric-value">{metrics.bugs_found}</div>
          <div className="metric-label">Bugs Found</div>
        </div>
        <div className="metric-card yellow">
          <div className="metric-icon">💡</div>
          <div className="metric-value">{metrics.improvements_found}</div>
          <div className="metric-label">Improvements</div>
        </div>
        <div className="metric-card purple">
          <div className="metric-icon">👍</div>
          <div className="metric-value">{metrics.strengths_found}</div>
          <div className="metric-label">Strengths</div>
        </div>
        <div className="metric-card cyan">
          <div className="metric-icon">⭐</div>
          <div className="metric-value" style={{ color: qualityColor }}>
            {metrics.avg_quality_score}
            <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>/100</span>
          </div>
          <div className="metric-label">Avg Quality</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="metrics-charts-row">
        {/* Language Distribution */}
        <div className="metrics-chart-card">
          <div className="chart-title">🌐 Language Distribution</div>
          {languageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={languageData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {languageData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No data</div>
          )}
        </div>

        {/* Complexity Distribution */}
        <div className="metrics-chart-card">
          <div className="chart-title">⚡ Complexity Distribution</div>
          {complexityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={complexityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)'
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {complexityData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No data</div>
          )}
        </div>
      </div>

      {/* Timeline Chart */}
      {timelineData.length > 1 && (
        <div className="metrics-chart-card full-width">
          <div className="chart-title">📈 Analysis Activity (Last 14 Days)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timelineData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                tickFormatter={d => d.slice(5)}
              />
              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)'
                }}
                labelFormatter={d => `Date: ${d}`}
              />
              <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#58a6ff"
                strokeWidth={2}
                dot={{ fill: '#58a6ff', r: 4 }}
                name="Analyses"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Language Bar Chart */}
      {languageData.length > 0 && (
        <div className="metrics-chart-card full-width">
          <div className="chart-title">🏆 Languages Used</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={languageData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)'
                }}
              />
              <Bar dataKey="value" name="Analyses" radius={[4, 4, 0, 0]}>
                {languageData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ML Model Info */}
      <div className="metrics-ml-card">
        <div className="chart-title">🧠 ML Model Info</div>
        <div className="ml-info-grid">
          <div className="ml-info-item">
            <span className="ml-info-label">Model</span>
            <span className="ml-info-value">Naive Bayes</span>
          </div>
          <div className="ml-info-item">
            <span className="ml-info-label">Vectorizer</span>
            <span className="ml-info-value">TF-IDF</span>
          </div>
          <div className="ml-info-item">
            <span className="ml-info-label">Languages</span>
            <span className="ml-info-value">9 classes</span>
          </div>
          <div className="ml-info-item">
            <span className="ml-info-label">Features</span>
            <span className="ml-info-value">5000 max</span>
          </div>
          <div className="ml-info-item">
            <span className="ml-info-label">N-gram range</span>
            <span className="ml-info-value">(2, 4)</span>
          </div>
          <div className="ml-info-item">
            <span className="ml-info-label">Analyzer</span>
            <span className="ml-info-value">char_wb</span>
          </div>
        </div>
      </div>

      <style>{`
        .metrics-dashboard {
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: fadeIn 0.3s ease;
          padding: 4px;
        }
        .metrics-loading, .metrics-error, .metrics-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 300px;
          gap: 12px;
          color: var(--text-tertiary);
          font-family: sans-serif;
          font-size: 13px;
          text-align: center;
        }
        .metrics-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border);
          border-top-color: #58a6ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .metrics-error { color: var(--accent-orange); }
        .metrics-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .metrics-header h2 {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          font-family: sans-serif;
        }
        .metrics-refresh {
          padding: 5px 12px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-family: sans-serif;
          transition: all 0.15s;
        }
        .metrics-refresh:hover { background: var(--bg-hover); }
        .metrics-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .metric-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          text-align: center;
          transition: transform 0.2s;
          border-left: 3px solid;
        }
        .metric-card:hover { transform: translateY(-2px); }
        .metric-card.blue { border-left-color: #58a6ff; }
        .metric-card.green { border-left-color: #3fb950; }
        .metric-card.red { border-left-color: #f78166; }
        .metric-card.yellow { border-left-color: #e3b341; }
        .metric-card.purple { border-left-color: #bc8cff; }
        .metric-card.cyan { border-left-color: #39c5cf; }
        .metric-icon { font-size: 20px; margin-bottom: 6px; }
        .metric-value {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          font-family: monospace;
          margin-bottom: 4px;
        }
        .metric-label {
          font-size: 11px;
          color: var(--text-tertiary);
          font-family: sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .metrics-charts-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .metrics-chart-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
        }
        .metrics-chart-card.full-width { grid-column: 1 / -1; }
        .chart-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          font-family: sans-serif;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .chart-empty {
          height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
          font-family: sans-serif;
          font-size: 12px;
        }
        .metrics-ml-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          border-left: 3px solid #bc8cff;
        }
        .ml-info-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 8px;
        }
        .ml-info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px;
          background: var(--bg-tertiary);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .ml-info-label {
          font-size: 10px;
          color: var(--text-tertiary);
          font-family: sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ml-info-value {
          font-size: 13px;
          font-weight: 600;
          color: #bc8cff;
          font-family: monospace;
        }
        @media (max-width: 768px) {
          .metrics-cards { grid-template-columns: repeat(2, 1fr); }
          .metrics-charts-row { grid-template-columns: 1fr; }
          .ml-info-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}

export default MetricsDashboard