import { useState } from 'react'
import axios from 'axios'
import API_BASE from '../config'

const LEVELS = [
    { id: 'eli5', label: '👶 ELI5', desc: 'Like I\'m 5' },
    { id: 'simple', label: '🙂 Simple', desc: 'Beginner' },
    { id: 'intermediate', label: '💻 Intermediate', desc: 'Developer' },
    { id: 'expert', label: '🧠 Expert', desc: 'Advanced' },
]

function CodeExplainer({ code, language }) {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [level, setLevel] = useState('simple')

    const explain = async () => {
        if (!code.trim()) {
            setError('Please paste some code first!')
            return
        }
        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const response = await axios.post(`${API_BASE}/explain`, {
                code,
                language,
                level
            })
            setResult(response.data)
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to explain code')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="explainer">
            {/* Controls */}
            <div className="explainer-controls">
                <div className="level-selector">
                    {LEVELS.map(l => (
                        <button
                            key={l.id}
                            className={`level-btn ${level === l.id ? 'active' : ''}`}
                            onClick={() => setLevel(l.id)}
                        >
                            {l.label}
                            <span className="level-desc">{l.desc}</span>
                        </button>
                    ))}
                </div>
                <button
                    className="explain-btn"
                    onClick={explain}
                    disabled={loading}
                >
                    {loading ? '⏳ Explaining...' : '💬 Explain Code'}
                </button>
            </div>

            {error && (
                <div className="explainer-error">⚠️ {error}</div>
            )}

            {loading && (
                <div className="explainer-loading">
                    <div className="explainer-spinner"></div>
                    <span>Generating explanation...</span>
                </div>
            )}

            {!result && !loading && !error && (
                <div className="explainer-placeholder">
                    <div style={{ fontSize: '48px', opacity: 0.4 }}>💬</div>
                    <p>Select a level and click <strong>Explain Code</strong></p>
                    <small>Get a plain English explanation of your code</small>
                </div>
            )}

            {result && (
                <div className="explainer-result">
                    {/* Title */}
                    <div className="explainer-title">
                        <span className="explainer-lang">{result.language}</span>
                        <h2>{result.title}</h2>
                    </div>

                    {/* Summary */}
                    <div className="explainer-summary">
                        <div className="explainer-summary-icon">📖</div>
                        <p>{result.summary}</p>
                    </div>

                    {/* Analogy */}
                    {result.analogy && (
                        <div className="explainer-analogy">
                            <div className="analogy-header">🎯 Think of it like this...</div>
                            <p>{result.analogy}</p>
                        </div>
                    )}

                    {/* Sections */}
                    {result.sections && result.sections.length > 0 && (
                        <div className="explainer-sections">
                            <div className="explainer-sections-header">📚 Step by Step</div>
                            {result.sections.map((section, i) => (
                                <div key={i} className="explainer-section">
                                    <div className="section-num">{i + 1}</div>
                                    <div className="section-content">
                                        <div className="section-heading">{section.heading}</div>
                                        <div className="section-explanation">{section.explanation}</div>
                                        {section.code && (
                                            <div className="section-code">
                                                <pre>{section.code}</pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Key Concepts */}
                    {result.key_concepts && result.key_concepts.length > 0 && (
                        <div className="explainer-concepts">
                            <div className="explainer-concepts-header">🔑 Key Concepts</div>
                            <div className="concepts-grid">
                                {result.key_concepts.map((concept, i) => (
                                    <div key={i} className="concept-card">
                                        <div className="concept-name">{concept.concept}</div>
                                        <div className="concept-explanation">{concept.explanation}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fun Fact */}
                    {result.fun_fact && (
                        <div className="explainer-funfact">
                            <span className="funfact-icon">🌟</span>
                            <span>{result.fun_fact}</span>
                        </div>
                    )}
                </div>
            )}

            <style>{`
        .explainer {
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeIn 0.3s ease;
        }
        .explainer-controls {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .level-selector {
          display: flex;
          gap: 4px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          padding: 4px;
        }
        .level-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 6px 12px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          background: none;
          color: #64748b;
          transition: all 0.15s;
          font-family: sans-serif;
          gap: 2px;
        }
        .level-btn.active {
          background: #1a2a4a;
          color: #7aa2f7;
          border: 1px solid #2d4a8a;
        }
        .level-btn:hover:not(.active) {
          color: #e2e8f0;
          background: #1a1d2e;
        }
        .level-desc {
          font-size: 9px;
          font-weight: 400;
          color: #475569;
        }
        .level-btn.active .level-desc {
          color: #7aa2f799;
        }
        .explain-btn {
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid #c084fc;
          background: #2a1a4a;
          color: #c084fc;
          transition: all 0.15s;
        }
        .explain-btn:hover:not(:disabled) { background: #3a2a5a; }
        .explain-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .explainer-error {
          background: #2d1a1a;
          border: 1px solid #5a2d2d;
          border-radius: 8px;
          padding: 12px;
          color: #f87171;
          font-size: 12px;
        }
        .explainer-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 24px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          font-size: 13px;
          color: #64748b;
          font-family: sans-serif;
        }
        .explainer-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #2d3154;
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .explainer-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 250px;
          gap: 10px;
          color: #64748b;
          text-align: center;
        }
        .explainer-placeholder p { font-size: 13px; color: #94a3b8; font-family: sans-serif; }
        .explainer-placeholder small { font-size: 11px; font-family: sans-serif; }
        .explainer-result {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .explainer-title {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .explainer-lang {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          background: #1a2a4a;
          border: 1px solid #2d4a8a;
          border-radius: 99px;
          color: #7aa2f7;
          font-family: sans-serif;
        }
        .explainer-title h2 {
          font-size: 16px;
          font-weight: 700;
          color: #e2e8f0;
          font-family: sans-serif;
        }
        .explainer-summary {
          display: flex;
          gap: 10px;
          padding: 14px;
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
        }
        .explainer-summary-icon { font-size: 18px; flex-shrink: 0; }
        .explainer-summary p {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.7;
          margin: 0;
          font-family: sans-serif;
        }
        .explainer-analogy {
          background: #1a2a1a;
          border: 1px solid #4ade80;
          border-radius: 10px;
          padding: 14px;
        }
        .analogy-header {
          font-size: 12px;
          font-weight: 700;
          color: #4ade80;
          margin-bottom: 8px;
          font-family: sans-serif;
        }
        .explainer-analogy p {
          font-size: 13px;
          color: #86efac;
          line-height: 1.7;
          margin: 0;
          font-family: sans-serif;
          font-style: italic;
        }
        .explainer-sections {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .explainer-sections-header {
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: sans-serif;
        }
        .explainer-section {
          display: flex;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid #2d315444;
        }
        .explainer-section:last-child { border-bottom: none; }
        .section-num {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #c084fc;
          color: white;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-family: sans-serif;
        }
        .section-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .section-heading {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          font-family: sans-serif;
        }
        .section-explanation {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.6;
          font-family: sans-serif;
        }
        .section-code {
          background: #1a1d2e;
          border: 1px solid #2d3154;
          border-radius: 6px;
          padding: 8px 10px;
          overflow-x: auto;
        }
        .section-code pre {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #7aa2f7;
          margin: 0;
          white-space: pre-wrap;
        }
        .explainer-concepts {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          overflow: hidden;
        }
        .explainer-concepts-header {
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid #2d3154;
          background: #1a1d2e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: sans-serif;
        }
        .concepts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0;
        }
        .concept-card {
          padding: 12px 14px;
          border-right: 1px solid #2d315444;
          border-bottom: 1px solid #2d315444;
        }
        .concept-name {
          font-size: 12px;
          font-weight: 700;
          color: #c084fc;
          margin-bottom: 4px;
          font-family: monospace;
        }
        .concept-explanation {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.5;
          font-family: sans-serif;
        }
        .explainer-funfact {
          display: flex;
          gap: 10px;
          padding: 12px 14px;
          background: #1a1a2e;
          border: 1px solid #3d2d6a;
          border-radius: 10px;
          font-size: 12px;
          color: #a78bfa;
          line-height: 1.6;
          font-family: sans-serif;
        }
        .funfact-icon { font-size: 16px; flex-shrink: 0; }
      `}</style>
        </div>
    )
}

export default CodeExplainer