# 🔍 CodeLens — Visual Code Analyzer & Reviewer

> An AI-powered code visualization and review tool built with React, Python Flask, and Machine Learning.

![CodeLens](https://img.shields.io/badge/AI-LLaMA%203-purple) ![Python](https://img.shields.io/badge/Python-Flask-blue) ![React](https://img.shields.io/badge/React-Vite-cyan) ![ML](https://img.shields.io/badge/ML-scikit--learn-orange)

---

## ✨ Features

- 🧠 **ML Language Detection** — Auto-detects programming language using scikit-learn
- 👁 **Step-by-step Visualization** — AI breaks down your code into easy steps
- ✅ **Smart Code Review** — Bugs, improvements, strengths and info
- 📦 **Variables Tracker** — Shows all variables with types and roles
- ▶ **Run Code** — Execute code in 9 languages (Python, JavaScript, C, C++, Java, Go, Rust, PHP, Ruby)
- 📊 **Complexity Graph** — Visual Time & Space complexity analysis with growth curves
- 📜 **History** — Persistent analysis history with delete support
- 📤 **Export PDF** — Download full analysis report as PDF
- 🌓 **Dark/Light Mode** — Toggle between themes
- ✨ **New Code** — Save current analysis and start fresh

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Python Flask |
| AI Model | LLaMA 3 (via Groq API) |
| ML | scikit-learn (Naive Bayes + TF-IDF) |
| Charts | Chart.js + react-chartjs-2 |
| PDF | jsPDF |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.x
- Node.js v20+
- Groq API Key (free at [console.groq.com](https://console.groq.com))

### Installation

1. **Clone the repo:**
```bash
git clone https://github.com/girishkssece/CODELENS.git
cd codelens
```

2. **Setup Backend:**
```bash
cd server
pip install -r requirements.txt
```

3. **Add your Groq API key** in `server/.env`:

4. **Setup Frontend:**
```bash
cd ../client
npm install
```

### Running the App

**Option 1 — One click (Windows):**
Double click `start.bat`

**Option 2 — Manual:**
```bash
# Terminal 1 — Backend
cd server
python app.py

# Terminal 2 — Frontend
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📊 Supported Languages

| Language | Analyze | Run |
|---|---|---|
| Python | ✅ | ✅ |
| JavaScript | ✅ | ✅ |
| C | ✅ | ✅ |
| C++ | ✅ | ✅ |
| Java | ✅ | ✅ |
| Go | ✅ | ✅ |
| Rust | ✅ | ✅ |
| PHP | ✅ | ✅ |
| Ruby | ✅ | ✅ |

---

## 🧠 ML Model

CodeLens uses a **Naive Bayes classifier** with **TF-IDF vectorization** trained on code samples from 9 programming languages. It detects the language with a confidence score and automatically updates the language selector.

---

## 📁 Project Structure

---

## 👨‍💻 Developer

Built by **Girish** — AIDS Student

---

## 📄 License

MIT License