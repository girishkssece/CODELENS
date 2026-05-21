import { useState } from 'react'
import CodeEditor from './components/CodeEditor'
import Visualization from './components/Visualization'
import ReviewPanel from './components/ReviewPanel'
import VariablesPanel from './components/VariablesPanel'
import axios from 'axios'
import './App.css'
import ComplexityGraph from './components/ComplexityGraph'
import FlowDiagram from './components/FlowDiagram'

function App() {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('visual')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [darkMode, setDarkMode] = useState(true)
  const [runOutput, setRunOutput] = useState(null)
  const [runLoading, setRunLoading] = useState(false)
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('codelens-history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [mlDetection, setMlDetection] = useState(null)

  const analyzeCode = async () => {
    if (!code.trim()) {
      alert('Please paste some code first!')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await axios.post('http://localhost:5000/analyze', {
        code,
        language
      })
      setResult(response.data)
      setActiveTab('visual')

      // Save to history
      const historyItem = {
        id: Date.now(),
        code: code,
        language: language === 'auto' ? response.data.visual?.language || 'Unknown' : language,
        timestamp: new Date().toLocaleString(),
        result: response.data,
        preview: code.slice(0, 60) + (code.length > 60 ? '...' : '')
      }
      const newHistory = [historyItem, ...history.slice(0, 9)]
      setHistory(newHistory)
      localStorage.setItem('codelens-history', JSON.stringify(newHistory))

    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Is the Flask server running?')
    } finally {
      setLoading(false)
    }
  }

  const clearAll = () => {
  setCode('')
  setResult(null)
  setError(null)
  setRunOutput(null)
  setMlDetection(null)
  setLanguage('auto')  // reset dropdown
}

const newCode = () => {
  if (code.trim() && result) {
    const historyItem = {
      id: Date.now(),
      code: code,
      language: language,
      timestamp: new Date().toLocaleString(),
      result: result,
      preview: code.slice(0, 60) + (code.length > 60 ? '...' : '')
    }
    const newHistory = [historyItem, ...history.slice(0, 9)]
    setHistory(newHistory)
    localStorage.setItem('codelens-history', JSON.stringify(newHistory))
  }
  setCode('')
  setResult(null)
  setError(null)
  setRunOutput(null)
  setMlDetection(null)
  setLanguage('auto')
}

 const detectLanguage = async (codeText) => {
  if (!codeText || codeText.length < 10) return
  try {
    const response = await axios.post('http://localhost:5000/detect-language', {
      code: codeText
    })
    setMlDetection(response.data)
    
    // Always auto-set if confidence >= 70
    if (response.data.confidence >= 70) {
      setLanguage(response.data.language)
    } else {
      setLanguage('auto')
    }

  } catch (err) {
    console.error('ML detection failed:', err)
  }
}

  const runCode = async () => {
    if (!code.trim()) {
      alert('Please paste some code first!')
      return
    }
    setRunLoading(true)
    setRunOutput(null)
    setActiveTab('output')

    try {
      const response = await axios.post('http://localhost:5000/run', {
        code,
        language
      })
      setRunOutput(response.data)
    } catch (err) {
      setRunOutput({
        error: err.response?.data?.error || 'Failed to execute code. Is the Flask server running?'
      })
    } finally {
      setRunLoading(false)
    }
  }

  const loadFromHistory = (item) => {
    setCode(item.code)
    setLanguage(item.language)
    setResult(item.result)
    setActiveTab('visual')
    setShowHistory(false)
  }

  const clearHistory = () => {
  setHistory([])
  localStorage.removeItem('codelens-history')
}

  const exportPDF = async () => {
    if (!result) {
      alert('Please analyze some code first!')
      return
    }

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()

    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 20

    // Header
    doc.setFillColor(26, 29, 46)
    doc.rect(0, 0, pageWidth, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('CodeLens Report', 20, 25)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 35)

    y = 55

    // Language & Complexity
    if (result.visual) {
      doc.setFillColor(240, 245, 255)
      doc.rect(15, y - 6, pageWidth - 30, 20, 'F')
      doc.setTextColor(29, 158, 117)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Language: ${result.visual.language || 'Unknown'}`, 20, y + 4)
      doc.setTextColor(55, 138, 221)
      doc.text(`Complexity: ${result.visual.complexity || 'N/A'}`, 100, y + 4)
      doc.setTextColor(216, 90, 48)
      doc.text(`Lines: ${result.visual.lines || 'N/A'}`, 170, y + 4)
      y += 25
    }

    // Code Section
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Code', 20, y)
    y += 8
    doc.setFillColor(245, 245, 245)
    const codeLines = doc.splitTextToSize(code, pageWidth - 40)
    const codeHeight = codeLines.length * 5 + 10
    doc.rect(15, y - 4, pageWidth - 30, Math.min(codeHeight, 60), 'F')
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 60)
    const displayLines = codeLines.slice(0, 10)
    displayLines.forEach((line, i) => {
      doc.text(line, 20, y + (i * 5))
    })
    if (codeLines.length > 10) {
      doc.setTextColor(150, 150, 150)
      doc.text(`... and ${codeLines.length - 10} more lines`, 20, y + 52)
    }
    y += Math.min(codeHeight, 65)

    // Visualization Steps
    if (result.visual?.steps?.length > 0) {
      if (y > 220) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 30, 30)
      doc.text('Execution Steps', 20, y)
      y += 10

      result.visual.steps.forEach((step, index) => {
        if (y > 260) { doc.addPage(); y = 20 }
        doc.setFillColor(29, 158, 117)
        doc.circle(22, y - 1, 4, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(8)
        doc.text(`${index + 1}`, index < 9 ? 20.5 : 19.5, y + 1)
        doc.setTextColor(30, 30, 30)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(step.title, 30, y)
        y += 7
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(80, 80, 80)
        const expLines = doc.splitTextToSize(step.explanation, pageWidth - 50)
        expLines.forEach(line => {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.text(line, 30, y)
          y += 5
        })
        y += 4
      })
    }

    // Review Section
    if (result.review) {
      if (y > 220) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 30, 30)
      doc.text('Code Review', 20, y)
      y += 10

      const reviewSections = [
        { key: 'bugs', label: '🐛 Bugs & Issues', color: [248, 113, 113] },
        { key: 'improvements', label: '💡 Improvements', color: [251, 191, 36] },
        { key: 'strengths', label: '👍 Strengths', color: [74, 222, 128] },
        { key: 'info', label: 'ℹ️ Info', color: [122, 162, 247] }
      ]

      reviewSections.forEach(section => {
        const items = result.review[section.key]
        if (!items || items.length === 0) return
        if (y > 250) { doc.addPage(); y = 20 }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...section.color)
        doc.text(section.label, 20, y)
        y += 7

        items.forEach(item => {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(30, 30, 30)
          doc.text(`• ${item.title}:`, 25, y)
          y += 5
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(80, 80, 80)
          const detailLines = doc.splitTextToSize(item.detail, pageWidth - 55)
          detailLines.forEach(line => {
            if (y > 270) { doc.addPage(); y = 20 }
            doc.text(line, 30, y)
            y += 5
          })
          y += 2
        })
        y += 4
      })
    }

    // Variables Section
    if (result.variables?.length > 0) {
      if (y > 220) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 30, 30)
      doc.text('Variables', 20, y)
      y += 10

      // Table header
      doc.setFillColor(26, 29, 46)
      doc.rect(15, y - 5, pageWidth - 30, 10, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.text('Name', 20, y + 1)
      doc.text('Type', 60, y + 1)
      doc.text('Initial Value', 100, y + 1)
      doc.text('Role', 145, y + 1)
      y += 10

      result.variables.forEach((v, i) => {
        if (y > 270) { doc.addPage(); y = 20 }
        if (i % 2 === 0) {
          doc.setFillColor(245, 247, 255)
          doc.rect(15, y - 5, pageWidth - 30, 9, 'F')
        }
        doc.setTextColor(30, 30, 30)
        doc.setFont('courier', 'bold')
        doc.setFontSize(8)
        doc.text(v.name || '', 20, y)
        doc.setFont('courier', 'normal')
        doc.setTextColor(55, 138, 221)
        doc.text(v.type || '', 60, y)
        doc.setTextColor(74, 222, 128)
        doc.text(String(v.initial_value || '—').slice(0, 20), 100, y)
        doc.setTextColor(80, 80, 80)
        doc.setFont('helvetica', 'normal')
        const roleText = doc.splitTextToSize(v.role || '', 55)
        doc.text(roleText[0] || '', 145, y)
        y += 9
      })
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFillColor(26, 29, 46)
      doc.rect(0, 287, pageWidth, 10, 'F')
      doc.setTextColor(100, 116, 139)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('Generated by CodeLens — Visual Code Analyzer & Reviewer', 20, 294)
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 30, 294)
    }

    doc.save(`codelens-report-${Date.now()}.pdf`)
  }

  return (
    <div className={`app-container ${darkMode ? 'dark' : 'light'}`}>
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="logo">
            <span className="dot d1"></span>
            <span className="dot d2"></span>
            <span className="dot d3"></span>
            <h1>CodeLens</h1>
          </div>
          <span className="tagline">Visual Code Analyzer & Reviewer</span>
        </div>
        <div className="header-right">
          <span className="badge">Powered by LLaMA 3</span>
          <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <select
          className="lang-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="auto">Auto-detect language</option>
          <option value="Python">Python</option>
          <option value="JavaScript">JavaScript</option>
          <option value="TypeScript">TypeScript</option>
          <option value="Java">Java</option>
          <option value="C">C</option>
          <option value="C++">C++</option>
          <option value="C#">C#</option>
          <option value="Go">Go</option>
          <option value="Rust">Rust</option>
          <option value="Ruby">Ruby</option>
          <option value="PHP">PHP</option>
          <option value="Swift">Swift</option>
          <option value="Kotlin">Kotlin</option>
          <option value="SQL">SQL</option>
          <option value="Bash">Bash/Shell</option>
        </select>

        <button
          className="btn primary"
          onClick={analyzeCode}
          disabled={loading}
        >
          {loading ? '⚡ Analyzing...' : '▶ Analyze Code'}
        </button>

        <button
          className="btn run"
          onClick={runCode}
          disabled={runLoading}
        >
          {runLoading ? '⏳ Running...' : '▶▶ Run Code'}
        </button>

        <button className="btn secondary" onClick={clearAll}>
          ↺ Clear
        </button>

        <button className="btn newcode" onClick={newCode}>
          ✨ New Code
        </button>

        <button className="btn history" onClick={() => setShowHistory(!showHistory)}>
          📜 History {history.length > 0 && <span className="history-count">{history.length}</span>}
        </button>

        <button
          className="btn export"
          onClick={exportPDF}
          disabled={!result}
        >
          📤 Export PDF
        </button>
      </div>

      {mlDetection && (
        <div className="ml-detection-bar">
          <span className="ml-label">🧠 ML Detection:</span>
          <span className="ml-result">
            {mlDetection.language}
            <span className="ml-confidence">{mlDetection.confidence}% confident</span>
          </span>
          <div className="ml-top">
            {mlDetection.top_predictions?.map((p, i) => (
              <span key={i} className="ml-pill" style={{ opacity: i === 0 ? 1 : 0.6 }}>
                {p.language} {p.confidence}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="history-panel">
          <div className="history-header">
            <span>📜 Analysis History</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn secondary" onClick={clearHistory}>🗑 Clear</button>
              <button className="btn secondary" onClick={() => setShowHistory(false)}>✕ Close</button>
            </div>
          </div>
          {history.length === 0 ? (
            <div className="history-empty">No history yet. Analyze some code first!</div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div className="history-item" key={item.id} onClick={() => loadFromHistory(item)} style={{cursor:'pointer'}}>
                  <div className="history-item-header">
                    <span className="history-lang">{item.language}</span>
                    <span className="history-time">{item.timestamp}</span>
                    <button
                      className="history-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        const newHistory = history.filter(h => h.id !== item.id)
                        setHistory(newHistory)
                        localStorage.setItem('codelens-history', JSON.stringify(newHistory))
                      }}
                      title="Delete this entry"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="history-preview">
                    {item.preview}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Workspace */}
      <div className="workspace">
        <div className="panel">
          <div className="panel-header">
            <span>📝 Your Code</span>
          </div>
          <CodeEditor
            code={code}
            setCode={(newCode) => {
              setCode(newCode)
              if (newCode.length > 10) {
                clearTimeout(window._detectTimer)
                window._detectTimer = setTimeout(() => detectLanguage(newCode), 800)
              }
            }}
            language={language}
            darkMode={darkMode}
          />
        </div>

        <div className="panel">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'visual' ? 'active' : ''}`}
              onClick={() => setActiveTab('visual')}
            >
              👁 Visualization
            </button>
            <button
              className={`tab ${activeTab === 'review' ? 'active' : ''}`}
              onClick={() => setActiveTab('review')}
            >
              ✅ Review
            </button>
            <button
              className={`tab ${activeTab === 'vars' ? 'active' : ''}`}
              onClick={() => setActiveTab('vars')}
            >
              📦 Variables
            </button>
            <button
              className={`tab ${activeTab === 'complexity' ? 'active' : ''}`}
              onClick={() => setActiveTab('complexity')}
            >
              📊 Complexity
            </button>
            <button
              className={`tab ${activeTab === 'flow' ? 'active' : ''}`}
              onClick={() => setActiveTab('flow')}
            >
              🔀 Flow
            </button>
            <button
              className={`tab ${activeTab === 'output' ? 'active' : ''}`}
              onClick={() => setActiveTab('output')}
            >
              ⚡ Output
            </button>
          </div>

          <div className="output-area">
            {loading && (
              <div className="loading">
                <div className="spinner"></div>
                <span>Analyzing your code with LLaMA 3...</span>
              </div>
            )}

            {error && (
              <div className="error-box">
                ⚠️ {error}
              </div>
            )}

            {!loading && !error && !result && activeTab !== 'output' && (
              <div className="placeholder">
                <div className="placeholder-icon">🔍</div>
                <p>Paste your code and click <strong>Analyze Code</strong></p>
                <small>Step-by-step visual breakdown + smart review</small>
              </div>
            )}

            {!loading && result && activeTab !== 'output' && (
              <>
                {activeTab === 'visual' && <Visualization data={result.visual} />}
                {activeTab === 'review' && <ReviewPanel data={result.review} />}
                {activeTab === 'vars' && <VariablesPanel data={result.variables} />}
                {activeTab === 'complexity' && <ComplexityGraph data={result.visual} />}
                {activeTab === 'flow' && <FlowDiagram data={result.flow} />}
              </>
            )}

            {activeTab === 'output' && (
              <div className="run-output">
                {runLoading && (
                  <div className="loading">
                    <div className="spinner"></div>
                    <span>Running your code...</span>
                  </div>
                )}
                {!runLoading && runOutput && (
                  <>
                    {runOutput.output && (
                      <div className="output-box success">
                        <div className="output-label">✅ Output</div>
                        <pre>{runOutput.output}</pre>
                      </div>
                    )}
                    {runOutput.error && (
                      <div className="output-box error">
                        <div className="output-label">❌ Error</div>
                        <pre>{runOutput.error}</pre>
                      </div>
                    )}
                    {!runOutput.output && !runOutput.error && (
                      <div className="output-box success">
                        <div className="output-label">✅ Output</div>
                        <pre>Program ran successfully with no output.</pre>
                      </div>
                    )}
                  </>
                )}
                {!runLoading && !runOutput && (
                  <div className="placeholder">
                    <div className="placeholder-icon">⚡</div>
                    <p>Click <strong>Run Code</strong> to execute</p>
                    <small>Supports Python, JavaScript, C, C++, Java, Go, Ruby, PHP, Rust</small>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App