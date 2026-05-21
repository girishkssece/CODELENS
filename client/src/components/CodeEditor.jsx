import { useRef } from 'react'

const PLACEHOLDERS = {
  auto: `// Paste any code here...
// Supports Python, JavaScript, Java, C++, Go, Rust and more!

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(6));`,
  Python: `# Paste your Python code here...

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(6))`,
  JavaScript: `// Paste your JavaScript code here...

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(6));`
}

function CodeEditor({ code, setCode, language }) {
  const textareaRef = useRef(null)

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const newCode = code.substring(0, start) + '  ' + code.substring(end)
      setCode(newCode)
      setTimeout(() => {
        textareaRef.current.selectionStart = start + 2
        textareaRef.current.selectionEnd = start + 2
      }, 0)
    }
  }

  return (
    <div className="code-editor-wrapper">
      <div className="line-numbers">
        {(code || '').split('\n').map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="code-textarea"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDERS[language] || PLACEHOLDERS.auto}
        spellCheck={false}
      />
      <style>{`
        .code-editor-wrapper {
          display: flex;
          flex: 1;
          overflow: auto;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.7;
        }
        .line-numbers {
          display: flex;
          flex-direction: column;
          padding: 14px 8px;
          background: #0f1117;
          color: #3d4268;
          text-align: right;
          user-select: none;
          min-width: 40px;
          border-right: 1px solid #2d3154;
        }
        .line-numbers span {
          font-size: 12px;
          line-height: 1.7;
        }
        .code-textarea {
          flex: 1;
          resize: none;
          border: none;
          outline: none;
          padding: 14px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.7;
          background: #0f1117;
          color: #e2e8f0;
          min-height: 460px;
          tab-size: 2;
        }
        .code-textarea::placeholder {
          color: #2d3154;
        }
      `}</style>
    </div>
  )
}

export default CodeEditor