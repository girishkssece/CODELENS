<div align="center">

# 🔍 CodeLens
### Visual Code Analyzer & Reviewer

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-codelens--81rz.onrender.com-blue?style=for-the-badge)](https://codelens-81rz.onrender.com)
[![GitHub](https://img.shields.io/badge/GitHub-girishkssece%2FCODELENS-black?style=for-the-badge&logo=github)](https://github.com/girishkssece/CODELENS)
[![Python](https://img.shields.io/badge/Python-3.11-blue?style=for-the-badge&logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-Vite-cyan?style=for-the-badge&logo=react)](https://react.dev)
[![Gemini](https://img.shields.io/badge/AI-Gemini_2.5_Flash-orange?style=for-the-badge&logo=google)](https://ai.google.dev)
[![scikit-learn](https://img.shields.io/badge/ML-scikit--learn-orange?style=for-the-badge&logo=scikit-learn)](https://scikit-learn.org)

*An AI-powered full-stack code visualization and review platform built with React, Python Flask, Google Gemini AI, and Machine Learning. Supports 9 programming languages with real step-by-step execution tracing, algorithm visualization, and intelligent code analysis.*

</div>

---

## 🌐 Live Demo

**🔗 [https://codelens-81rz.onrender.com](https://codelens-81rz.onrender.com)**

> Create a free account to start analyzing your code!

---

## ✨ Features

### 🧠 AI & Machine Learning
| Feature | Description |
|---|---|
| **ML Language Detection** | Auto-detects programming language using Naive Bayes + TF-IDF (scikit-learn) with confidence score |
| **AI Code Analysis** | Step-by-step visualization, review, and variable tracking powered by Google Gemini 2.5 Flash |
| **Fix & Optimize** | AI automatically fixes bugs and optimizes code with before/after quality scores |
| **Code Explainer** | Explains code at 4 levels — ELI5, Simple, Intermediate, Expert |
| **Flow Diagram** | AI generates visual execution flow diagrams |

### ⚡ Code Execution
| Feature | Description |
|---|---|
| **Run Code** | Execute code in 9 languages with real output |
| **Step-by-step Executor** | Real execution tracer using `sys.settrace` (Python) and AI simulation (others) |
| **Algo Visualizer** | AlgoMaster-style visualization — trees, arrays, DP tables, graphs |
| **Code Diff** | Compare two versions of code with highlighted changes |

### 📊 Analysis & Visualization
| Feature | Description |
|---|---|
| **Complexity Graph** | Time & Space complexity visualization with growth curves (Chart.js) |
| **Variables Tracker** | Track all variables with types, values, and roles |
| **Code Review** | Bugs, improvements, strengths, and info panels |
| **Metrics Dashboard** | Analytics — language distribution, complexity trends, quality scores |

### 🛠 Developer Experience
| Feature | Description |
|---|---|
| **Code Templates** | Starter code for all 9 languages |
| **History** | Persistent analysis history with pin, search, and delete |
| **Export PDF** | Download complete analysis report as PDF |
| **Dark/Light Mode** | Toggle between themes |
| **Font Size Control** | Adjustable editor font size |

### 🔐 Authentication
| Feature | Description |
|---|---|
| **Register/Login** | Full JWT authentication system |
| **User-specific History** | Each user has their own analysis history |
| **SQLite Database** | Persistent storage with SQLAlchemy ORM |

---

## 🛠 Tech Stack

### Frontend

React 18 + Vite → Modern UI framework
Chart.js → Complexity & metrics charts
Recharts → Dashboard analytics charts
jsPDF → PDF export
axios → HTTP client


### Backend

Python Flask → REST API server
Flask-JWT-Extended → Authentication
Flask-SQLAlchemy → ORM
Flask-Bcrypt → Password hashing
SQLite → Database


### AI & ML

Google Gemini 2.5 Flash → Code analysis, fix, explain, visualize
scikit-learn → Naive Bayes + TF-IDF language detection
sys.settrace → Real Python execution tracing


### Deployment

Render → Backend hosting (free tier)
GitHub → Version control


---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js v20+
- Google Gemini API Key (free at [aistudio.google.com](https://aistudio.google.com))

### Installation

**1. Clone the repository:**
```bash
git clone https://github.com/girishkssece/CODELENS.git
cd CODELENS
```

**2. Setup Backend:**
```bash
cd server
pip install -r requirements.txt
```

**3. Configure environment variables:**

Create `server/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET_KEY=your_secret_key_here
```

**4. Setup Frontend:**
```bash
cd ../client
npm install
```

**5. Configure API URL:**

Create `client/src/config.js`:
```javascript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
export default API_BASE
```

### Running Locally

**Option 1 — One Click (Windows):**

Double click start.bat


**Option 2 — Manual:**
```bash
# Terminal 1 — Backend
cd server
python app.py

# Terminal 2 — Frontend  
cd client
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🌐 Supported Languages

| Language | Analyze | Run | Execute | Algo Viz |
|---|---|---|---|---|
| 🐍 Python | ✅ | ✅ | ✅ Real | ✅ |
| 🟨 JavaScript | ✅ | ✅ | ✅ Real | ✅ |
| ☕ Java | ✅ | ✅ | ✅ Real | ✅ |
| 🔵 C | ✅ | ✅ | ✅ Real | ✅ |
| ⚙️ C++ | ✅ | ✅ | ✅ Real | ✅ |
| 🐹 Go | ✅ | ✅ | ✅ Real | ✅ |
| 🦀 Rust | ✅ | ✅ | ✅ Real | ✅ |
| 💎 Ruby | ✅ | ✅ | ✅ Real | ✅ |
| 🐘 PHP | ✅ | ✅ | ✅ Real | ✅ |

---

## 🧠 Machine Learning Component

CodeLens uses a **Naive Bayes classifier** with **TF-IDF vectorization** for automatic programming language detection:

```python
Pipeline([
    ('tfidf', TfidfVectorizer(
        analyzer='char_wb',    # Character n-grams
        ngram_range=(2, 4),    # Bigrams to 4-grams
        max_features=5000,     # Top 5000 features
        sublinear_tf=True      # Log normalization
    )),
    ('clf', MultinomialNB(alpha=0.1))  # Naive Bayes
])
```

**Training Data:** 10 samples × 9 languages = 90 training examples
**Features:** Character-level n-grams (2-4 chars)
**Output:** Language prediction + confidence score + top-3 predictions

---

## 📊 Algorithm Visualizer

CodeLens features an **AlgoMaster-style** algorithm visualizer that adapts to different data structures:

| Algorithm Type | Visualization |
|---|---|
| **Sorting** (Bubble, Merge, Quick) | Animated bar chart with swap/compare highlights |
| **Searching** (Binary Search) | Array with low/mid/high pointer arrows |
| **Tree Traversal** | Animated binary tree with node state colors |
| **Graph** (BFS, DFS) | Interactive graph with visited/queued states |
| **Dynamic Programming** | DP table with cell-by-cell filling |
| **Recursion** | Call tree with actual argument values |

---

## 📁 Project Structure

CODELENS/
├── client/ # React + Vite Frontend
│ └── src/
│ ├── components/
│ │ ├── AlgoVisualizer.jsx # Algorithm visualization
│ │ ├── CodeDiff.jsx # Code comparison
│ │ ├── CodeEditor.jsx # Editor with line numbers
│ │ ├── CodeExplainer.jsx # AI code explainer
│ │ ├── CodeFixer.jsx # Fix & optimize
│ │ ├── CodeTemplates.jsx # Starter templates
│ │ ├── ComplexityGraph.jsx # Complexity charts
│ │ ├── Executor.jsx # Step-by-step executor
│ │ ├── FlowDiagram.jsx # Flow visualization
│ │ ├── Login.jsx # Authentication
│ │ ├── MetricsDashboard.jsx # Analytics dashboard
│ │ ├── ReviewPanel.jsx # Code review
│ │ ├── VariablesPanel.jsx # Variables tracker
│ │ └── Visualization.jsx # Step visualization
│ ├── App.jsx # Main application
│ ├── config.js # API configuration
│ └── main.jsx # Entry point
│
├── server/ # Python Flask Backend
│ ├── algo_engine.py # Python algorithm tracer
│ ├── app.py # Main Flask application
│ ├── auth.py # JWT authentication
│ ├── code_tracer.py # Multi-language tracer
│ ├── executor.py # Python step executor
│ ├── ml_detector.py # Naive Bayes ML model
│ ├── models.py # SQLAlchemy models
│ ├── step_builder.py # Execution step builder
│ ├── requirements.txt # Python dependencies
│ └── static/ # React build (production)
│
├── start.bat # One-click Windows launcher
└── README.md


---

## 🎓 About

Built by **Girish K S** — AIDS (Artificial Intelligence & Data Science) Student

**Project Domain:** EdTech + AI + Data Science

**Key Technologies for AIDS:**
- Machine Learning (scikit-learn, Naive Bayes, TF-IDF)
- Natural Language Processing (code analysis)
- Large Language Models (Google Gemini)
- Data Visualization (Chart.js, Recharts)
- Full-stack Development (React, Flask)
- Database Management (SQLite, SQLAlchemy)

---

## 📄 License

This project is licensed under the MIT License.

---

<div align="center">

**⭐ Star this repo if you found it helpful!**

Made with ❤️ by Girish K S

</div>


