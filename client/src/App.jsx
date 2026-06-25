import { useState, useEffect } from 'react'
import CodeEditor from './components/CodeEditor'
import Visualization from './components/Visualization'
import ReviewPanel from './components/ReviewPanel'
import VariablesPanel from './components/VariablesPanel'
import axios from 'axios'
import './App.css'
import ComplexityGraph from './components/ComplexityGraph'
import FlowDiagram from './components/FlowDiagram'
import Executor from './components/Executor'
import CodeDiff from './components/CodeDiff'
import CodeFixer from './components/CodeFixer'
import CodeTemplates from './components/CodeTemplates'
import CodeExplainer from './components/CodeExplainer'
import AlgoVisualizer from './components/AlgoVisualizer'
import Login from './components/Login'

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
  const [historySearch, setHistorySearch] = useState('')
  const [historySort, setHistorySort] = useState('date') // date or language
  const [pinnedHistory, setPinnedHistory] = useState([])
  const [fontSize, setFontSize] = useState(13)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [mlDetection, setMlDetection] = useState(null)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('codelens_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('codelens_token') || null)

  // Safety check for result rendering
  const safeResult = result ? {
    visual: result.visual || { language: 'Unknown', complexity: 'N/A', lines: 0, steps: [] },
    review: result.review || { bugs: [], improvements: [], strengths: [], info: [] },
    variables: result.variables || [],
    flow: result.flow || null
  } : null

  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` }
  }

  // Load history from server on login
  useEffect(() => {
    if (token) loadHistory()
  }, [token])

  const loadHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/auth/history', authHeaders)
      setHistory(response.data)
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

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

      // Validate response before setting
      const data = response.data
      if (!data || typeof data !== 'object') {
        setError('Invalid response from server. Please try again!')
        return
      }

      // Ensure all required fields exist
      const safeResult = {
        visual: data.visual || { language: 'Unknown', complexity: 'N/A', lines: 0, steps: [] },
        review: data.review || { bugs: [], improvements: [], strengths: [], info: [] },
        variables: data.variables || [],
        flow: data.flow || null
      }

      setResult(safeResult)
      setActiveTab('visual')

      // Save to server
      try {
        const historyResponse = await axios.post('http://localhost:5000/auth/history', {
          code,
          language: language === 'auto' ? safeResult.visual?.language || 'Unknown' : language,
          preview: code.slice(0, 60) + (code.length > 60 ? '...' : ''),
          result: safeResult
        }, authHeaders)
        setHistory(prev => [historyResponse.data, ...prev])
      } catch (histErr) {
        console.error('Failed to save history:', histErr)
      }

    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.response?.data?.error || 'Analysis failed. Please try again!')
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

  const newCode = async () => {
    if (code.trim() && result) {
      try {
        const response = await axios.post('http://localhost:5000/auth/history', {
          code,
          language,
          preview: code.slice(0, 60) + (code.length > 60 ? '...' : ''),
          result
        }, authHeaders)
        setHistory(prev => [response.data, ...prev])
      } catch (err) {
        console.error('Failed to save history:', err)
      }
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

  const clearHistory = async () => {
    try {
      await axios.delete('http://localhost:5000/auth/history/clear', authHeaders)
      setHistory([])
    } catch (err) {
      console.error('Failed to clear history:', err)
    }
  }

  const pinHistory = async (id) => {
    try {
      const response = await axios.put(`http://localhost:5000/auth/history/${id}/pin`, {}, authHeaders)
      setHistory(prev => prev.map(h => h.id === id ? response.data : h))
    } catch (err) {
      console.error('Failed to pin history:', err)
    }
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
    if (safeResult.visual) {
      doc.setFillColor(240, 245, 255)
      doc.rect(15, y - 6, pageWidth - 30, 20, 'F')
      doc.setTextColor(29, 158, 117)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Language: ${safeResult.visual.language || 'Unknown'}`, 20, y + 4)
      doc.setTextColor(55, 138, 221)
      doc.text(`Complexity: ${safeResult.visual.complexity || 'N/A'}`, 100, y + 4)
      doc.setTextColor(216, 90, 48)
      doc.text(`Lines: ${safeResult.visual.lines || 'N/A'}`, 170, y + 4)
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
    if (safeResult.visual?.steps?.length > 0) {
      if (y > 220) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 30, 30)
      doc.text('Execution Steps', 20, y)
      y += 10

      safeResult.visual.steps.forEach((step, index) => {
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
    if (safeResult.review) {
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
        const items = safeResult.review[section.key]
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
    if (safeResult.variables?.length > 0) {
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

      safeResult.variables.forEach((v, i) => {
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

  const filteredHistory = history
    .filter(item =>
      item.preview.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.language.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.timestamp.toLowerCase().includes(historySearch.toLowerCase())
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (historySort === 'language') return a.language.localeCompare(b.language)
      return b.id - a.id // date — newest first
    })

  const handleLogin = (userData, userToken) => {
    setUser(userData)
    setToken(userToken)
    localStorage.setItem('codelens_token', userToken)
    localStorage.setItem('codelens_user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('codelens_token')
    localStorage.removeItem('codelens_user')
    setCode('')
    setResult(null)
    setHistory([])
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
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
          <div className="user-info">
            <div className="user-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span>{user.name}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            🚪 Logout
          </button>
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
          <option value="Java">Java</option>
          <option value="C">C</option>
          <option value="C++">C++</option>
          <option value="Go">Go</option>
          <option value="Rust">Rust</option>
          <option value="Ruby">Ruby</option>
          <option value="PHP">PHP</option>
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
          className="btn templates"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          📋 Templates
        </button>

        <button
          className="btn export"
          onClick={exportPDF}
          disabled={!result}
        >
          📤 Export PDF
        </button>

        <div className="font-controls">
          <button className="font-btn" onClick={() => setFontSize(p => Math.max(10, p - 1))}>A-</button>
          <span className="font-size-label">{fontSize}px</span>
          <button className="font-btn" onClick={() => setFontSize(p => Math.min(20, p + 1))}>A+</button>
        </div>
      </div>

      {showTemplates && (
        <div className="templates-wrapper">
          <div className="templates-wrapper-header">
            <span>📋 Code Templates</span>
            <button className="btn secondary" onClick={() => setShowTemplates(false)}>✕ Close</button>
          </div>
          <CodeTemplates
            currentLanguage={language}
            onSelect={(templateCode, templateLang) => {
              setCode(templateCode)
              setLanguage(templateLang)
              setShowTemplates(false)
            }}
          />
        </div>
      )}

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
            <span>📜 Analysis History ({history.length})</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn secondary" onClick={clearHistory}>🗑 Clear</button>
              <button className="btn secondary" onClick={() => setShowHistory(false)}>✕ Close</button>
            </div>
          </div>

          {/* Search & Sort */}
          <div className="history-toolbar">
            <div className="history-search">
              <input
                type="text"
                placeholder="🔍 Search by language, code or time..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="history-search-input"
              />
              {historySearch && (
                <button className="history-search-clear" onClick={() => setHistorySearch('')}>✕</button>
              )}
            </div>
            <div className="history-sort">
              <button
                className={`sort-btn ${historySort === 'date' ? 'active' : ''}`}
                onClick={() => setHistorySort('date')}
              >
                📅 Date
              </button>
              <button
                className={`sort-btn ${historySort === 'language' ? 'active' : ''}`}
                onClick={() => setHistorySort('language')}
              >
                💻 Language
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="history-empty">
              {historySearch ? `No results for "${historySearch}"` : 'No history yet. Analyze some code first!'}
            </div>
          ) : (
            <div className="history-list">
              {filteredHistory.map((item) => (
                <div
                  className={`history-item ${item.pinned ? 'pinned' : ''}`}
                  key={item.id}
                  onClick={() => loadFromHistory(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="history-item-header">
                    {/* Language Icon */}
                    <span className="history-lang-icon">
                      {item.language === 'Python' ? '🐍' :
                       item.language === 'JavaScript' ? '🟨' :
                       item.language === 'Java' ? '☕' :
                       item.language === 'C++' ? '⚙️' :
                       item.language === 'C' ? '🔵' :
                       item.language === 'Go' ? '🐹' :
                       item.language === 'Rust' ? '🦀' :
                       item.language === 'Ruby' ? '💎' :
                       item.language === 'PHP' ? '🐘' : '💻'}
                    </span>
                    <span className="history-lang">{item.language}</span>
                    {item.pinned && <span className="history-pinned-badge">📌 Pinned</span>}
                    <span className="history-time">{item.timestamp}</span>
                    <div className="history-actions">
                      <button
                        className="history-pin-btn"
                        onClick={(e) => { e.stopPropagation(); pinHistory(item.id) }}
                        title={item.pinned ? 'Unpin' : 'Pin'}
                      >
                        {item.pinned ? '📌' : '📍'}
                      </button>
                      <button
                        className="history-delete-btn"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await axios.delete(`http://localhost:5000/auth/history/${item.id}`, authHeaders)
                            setHistory(prev => prev.filter(h => h.id !== item.id))
                          } catch (err) {
                            console.error('Failed to delete history:', err)
                          }
                        }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="history-preview">{item.preview}</div>

                  {/* Result Preview */}
                  {item.result?.visual && (
                    <div className="history-result-preview">
                      <span className="hrp-badge">
                        ⚡ {item.result.visual.complexity || 'N/A'}
                      </span>
                      <span className="hrp-badge">
                        📄 {item.result.visual.lines || 0} lines
                      </span>
                      {item.result.review?.bugs?.length > 0 && (
                        <span className="hrp-badge bug">
                          🐛 {item.result.review.bugs.length} bug{item.result.review.bugs.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {item.result.review?.strengths?.length > 0 && (
                        <span className="hrp-badge good">
                          👍 {item.result.review.strengths.length} strength{item.result.review.strengths.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
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
            fontSize={fontSize}
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
              className={`tab ${activeTab === 'executor' ? 'active' : ''}`}
              onClick={() => setActiveTab('executor')}
            >
              ⚡ Executor
            </button>
            <button
              className={`tab ${activeTab === 'output' ? 'active' : ''}`}
              onClick={() => setActiveTab('output')}
            >
              ⚡ Output
            </button>
            <button
              className={`tab ${activeTab === 'diff' ? 'active' : ''}`}
              onClick={() => setActiveTab('diff')}
            >
              🔀 Diff
            </button>

            <button
              className={`tab ${activeTab === 'fix' ? 'active' : ''}`}
              onClick={() => setActiveTab('fix')}
            >
              🔧 Fix
            </button>
            <button
              className={`tab ${activeTab === 'explain' ? 'active' : ''}`}
              onClick={() => setActiveTab('explain')}
            >
              💬 Explain
            </button>
            <button
              className={`tab ${activeTab === 'algo' ? 'active' : ''}`}
              onClick={() => setActiveTab('algo')}
            >
              🌳 Algo
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

            {!loading && !error && !result && activeTab !== 'output' && activeTab !== 'algo' && activeTab !== 'explain' && activeTab !== 'executor' && activeTab !== 'fix' && (
              <div className="placeholder">
                <div className="placeholder-icon">🔍</div>
                <p>Paste your code and click <strong>Analyze Code</strong></p>
                <small>Step-by-step visual breakdown + smart review</small>
              </div>
            )}

            {!loading && safeResult && activeTab !== 'output' && activeTab !== 'algo' && activeTab !== 'explain' && activeTab !== 'executor' && activeTab !== 'fix' && (
              <>
                {activeTab === 'visual' && <Visualization data={safeResult.visual} />}
                {activeTab === 'review' && <ReviewPanel data={safeResult.review} />}
                {activeTab === 'vars' && <VariablesPanel data={safeResult.variables} />}
                {activeTab === 'complexity' && <ComplexityGraph data={safeResult.visual} />}
                {activeTab === 'flow' && <FlowDiagram data={safeResult.flow} />}
                {activeTab === 'diff' && <CodeDiff />}
              </>
            )}

            {/* Independent tabs — work without Analyze Code */}
            {activeTab === 'executor' && <Executor code={code} language={language} />}
            {activeTab === 'fix' && <CodeFixer code={code} language={language} />}
            {activeTab === 'explain' && <CodeExplainer code={code} language={language} />}
            {activeTab === 'algo' && <AlgoVisualizer code={code} language={language} />}

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