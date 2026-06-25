from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv
import os
import json
import subprocess
import tempfile
import re
from ml_detector import detector
from executor import execute_python_steps
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from models import db, User, History
from auth import auth_bp, bcrypt
import secrets
from algo_engine import build_algo_visualization
from code_tracer import (
    trace_javascript, trace_cpp, trace_java,
    trace_go, trace_rust, trace_ruby, trace_php,
    build_visualization_from_trace
)

load_dotenv()

app = Flask(__name__)
CORS(app)

# Database config
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///codelens.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', secrets.token_hex(32))
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False

# Initialize extensions
db.init_app(app)
bcrypt.init_app(app)
jwt = JWTManager(app)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/auth')

# Create tables
with app.app_context():
    db.create_all()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "auto")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    lang_str = "auto-detect the language and" if language == "auto" else f"treat this as {language} code and"

    prompt = f"""You are a code analysis engine. The user has pasted the following code. Please {lang_str} analyze it thoroughly.

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no explanation outside JSON):
{{
  "visual": {{
    "language": "detected language name",
    "complexity": "time complexity like O(n) or descriptive",
    "space_complexity": "space complexity like O(1), O(n) etc",
    "lines": <number of lines>,
    "summary": true,
    "steps": [
      {{
        "title": "Short step title (5-8 words)",
        "explanation": "Clear plain English explanation of what happens in this step.",
        "code": "Relevant code snippet (1-3 lines max)"
      }}
    ]
  }},
  "flow": {{
    "nodes": [
      {{
        "id": "1",
        "label": "Short label (2-4 words)",
        "type": "start/end/process/decision/loop",
        "description": "One line explanation"
      }}
    ],
    "edges": [
      {{
        "from": "1",
        "to": "2",
        "label": "optional edge label like yes/no"
      }}
    ]
  }},
  "review": {{
    "bugs": [{{"title": "Bug name", "detail": "Explanation"}}],
    "improvements": [{{"title": "Improvement", "detail": "Explanation"}}],
    "strengths": [{{"title": "Strength", "detail": "Explanation"}}],
    "info": [{{"title": "Info", "detail": "Details like complexity, purpose"}}]
  }},
  "variables": [
    {{
      "name": "variable name",
      "type": "inferred type",
      "initial_value": "initial value or parameter",
      "role": "what this variable does"
    }}
  ]
}}

Give 4-8 steps for visual. Give 5-10 nodes for flow with proper edges. Give at least 1 strength and 1 info item in review. Include all meaningful variables.

CODE TO ANALYZE:
{code}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {
                    "role": "system",
                    "content": "You are a code analysis engine. Always respond with valid JSON only. No markdown, no explanation, just JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        text = response.choices[0].message.content
        clean = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse AI response"}), 500
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!"}), 429
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

import subprocess
import tempfile

@app.route("/run", methods=["POST"])
def run_code():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "Python")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    try:
        if language == "Python":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["python", temp_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            return jsonify({"output": result.stdout, "error": result.stderr, "returncode": result.returncode})

        elif language == "Java":
            class_match = re.search(r'public\s+class\s+(\w+)', code)
            if not class_match:
                # If no public class, wrap in Main class
                wrapped_code = f"public class Main {{\n    public static void main(String[] args) {{\n        // Auto-wrapped\n    }}\n}}\n" + code
                class_name = 'Main'
            else:
                class_name = class_match.group(1)
                wrapped_code = code

            proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
            with open(proper_path, 'w') as f:
                f.write(wrapped_code)



            compile_result = subprocess.run(["javac", proper_path], capture_output=True, text=True, timeout=15)
            if compile_result.returncode != 0:
                os.unlink(proper_path)
                return jsonify({"output": "", "error": compile_result.stderr, "returncode": compile_result.returncode})

            run_result = subprocess.run(
                ["java", "-cp", tempfile.gettempdir(), class_name],
                capture_output=True, text=True, timeout=15
            )
            os.unlink(proper_path)
            class_file = os.path.join(tempfile.gettempdir(), f"{class_name}.class")
            if os.path.exists(class_file):
                os.unlink(class_file)
            return jsonify({"output": run_result.stdout, "error": run_result.stderr, "returncode": run_result.returncode})

        elif language == "Go":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.go', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["go", "run", temp_path], capture_output=True, text=True, timeout=30)
            os.unlink(temp_path)
            return jsonify({"output": result.stdout, "error": result.stderr, "returncode": result.returncode})

        elif language == "Rust":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rs', delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace('.rs', '.exe')
            compile_result = subprocess.run(["rustc", temp_path, "-o", exe_path], capture_output=True, text=True, timeout=30)
            if compile_result.returncode != 0:
                os.unlink(temp_path)
                return jsonify({"output": "", "error": compile_result.stderr, "returncode": compile_result.returncode})
            run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            if os.path.exists(exe_path):
                os.unlink(exe_path)
            return jsonify({"output": run_result.stdout, "error": run_result.stderr, "returncode": run_result.returncode})

        elif language == "PHP":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.php', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["php", temp_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            return jsonify({"output": result.stdout, "error": result.stderr, "returncode": result.returncode})

        elif language == "Ruby":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rb', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["ruby", temp_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            return jsonify({"output": result.stdout, "error": result.stderr, "returncode": result.returncode})

        else:
            return jsonify({"output": "", "error": f"Running {language} is not supported yet.", "returncode": 1})

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Code execution timed out (10s limit)", "output": "", "returncode": 1})
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!", "output": "", "returncode": 1}), 429
        return jsonify({"error": str(e), "output": "", "returncode": 1})
    
@app.route("/detect-language", methods=["POST"])
def detect_language():
    data = request.get_json()
    code = data.get("code", "")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    try:
        result = detector.detect(code)
        return jsonify(result)
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!"}), 429
        return jsonify({"error": str(e)}), 500
    
@app.route("/execute", methods=["POST"])
def execute():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "Python")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    # Real execution for Python
    if language == "Python":
        try:
            result = execute_python_steps(code)
            result["mode"] = "real"
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e), "steps": [], "total_steps": 0}), 500

    # For other languages — run code first then generate steps
    try:
        # Step 1 — Actually run the code
        actual_output = ""
        actual_error = ""

        if language == "JavaScript":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["node", temp_path], capture_output=True, text=True, timeout=10)
            actual_output = run_result.stdout
            actual_error = run_result.stderr
            os.unlink(temp_path)

        elif language in ["C", "C++"]:
            suffix = '.c' if language == "C" else '.cpp'
            compiler = "gcc" if language == "C" else "g++"
            with tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace(suffix, '.exe')
            compile_result = subprocess.run([compiler, temp_path, "-o", exe_path], capture_output=True, text=True, timeout=10)
            if compile_result.returncode == 0:
                run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
                actual_output = run_result.stdout
                actual_error = run_result.stderr
                os.unlink(exe_path)
            else:
                actual_error = compile_result.stderr
            os.unlink(temp_path)

        elif language == "Java":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.java', delete=False, dir=tempfile.gettempdir()) as f:
                f.write(code)
                temp_path = f.name

    # Find public class name
            class_match = re.search(r'public\s+class\s+(\w+)', code)
            if not class_match:
                # No public class found — wrap in Main
                class_name = 'Main'
                wrapped_code = code + f"\npublic class Main {{ public static void main(String[] args) {{}} }}"
            else:
                class_name = class_match.group(1)
                wrapped_code = code

            proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
            with open(proper_path, 'w') as f:
                f.write(wrapped_code)

            if os.path.exists(temp_path):
                os.unlink(temp_path)

            compile_result = subprocess.run(["javac", proper_path], capture_output=True, text=True, timeout=15)
            if compile_result.returncode != 0:
                actual_error = compile_result.stderr
                os.unlink(proper_path)
            else:
                run_result = subprocess.run(
                   ["java", "-cp", tempfile.gettempdir(), class_name],
                    capture_output=True, text=True, timeout=15
                )
                actual_output = run_result.stdout
                actual_error = run_result.stderr
                os.unlink(proper_path)
                class_file = os.path.join(tempfile.gettempdir(), f"{class_name}.class")
                if os.path.exists(class_file):
                    os.unlink(class_file)

        elif language == "Go":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.go', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["go", "run", temp_path], capture_output=True, text=True, timeout=30)
            actual_output = run_result.stdout
            actual_error = run_result.stderr
            os.unlink(temp_path)

        elif language == "Rust":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rs', delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace('.rs', '.exe')
            compile_result = subprocess.run(["rustc", temp_path, "-o", exe_path], capture_output=True, text=True, timeout=30)
            if compile_result.returncode == 0:
                run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
                actual_output = run_result.stdout
                actual_error = run_result.stderr
                os.unlink(exe_path)
            else:
                actual_error = compile_result.stderr
            os.unlink(temp_path)

        elif language == "PHP":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.php', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["php", temp_path], capture_output=True, text=True, timeout=10)
            actual_output = run_result.stdout
            actual_error = run_result.stderr
            os.unlink(temp_path)

        elif language == "Ruby":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rb', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["ruby", temp_path], capture_output=True, text=True, timeout=10)
            actual_output = run_result.stdout
            actual_error = run_result.stderr
            os.unlink(temp_path)

        else:
            actual_output = ""
            actual_error = f"{language} execution not supported"

        # Step 2 — Generate steps using AI based on actual output
        prompt = f"""Simulate step-by-step execution of this {language} code and return ONLY a JSON object.

CODE:
{code[:400]}

ACTUAL OUTPUT FROM RUNNING THE CODE:
{actual_output[:200] if actual_output else "No output"}

ACTUAL ERROR (if any):
{actual_error[:200] if actual_error else "No error"}

Return this exact JSON structure:
{{
  "mode": "real",
  "language": "{language}",
  "total_steps": 6,
  "final_output": "{actual_output.strip()[:100] if actual_output else ''}",
  "steps": [
    {{
      "event": "line",
      "line": 1,
      "current_line": "actual code on this line",
      "func_name": "main",
      "local_vars": {{"var1": "value1"}},
      "global_vars": {{}},
      "stack": [{{"function": "main", "line": 1}}],
      "output": [],
      "final_output": "{actual_output.strip()[:100] if actual_output else ''}"
    }}
  ]
}}

Generate 6-12 steps. Use the ACTUAL OUTPUT to show correct variable values. Return ONLY JSON.
"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {
                    "role": "system",
                    "content": "You are a code execution simulator. Output ONLY valid JSON. No markdown."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        text = response.choices[0].message.content.strip()

        # Try multiple JSON extraction methods
        result = None
        try:
            result = json.loads(text)
        except:
            pass

        if not result:
            try:
                clean = text.replace("```json", "").replace("```", "").strip()
                result = json.loads(clean)
            except:
                pass

        if not result:
            try:
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end > start:
                    result = json.loads(text[start:end])
            except:
                pass

        if result:
            result["mode"] = "real"
            result["final_output"] = actual_output or actual_error
            return jsonify(result)
        else:
            # Return basic result with actual output even if steps failed
            return jsonify({
                "mode": "real",
                "language": language,
                "total_steps": 1,
                "final_output": actual_output or actual_error,
                "steps": [{
                    "event": "line",
                    "line": 1,
                    "current_line": code.split('\n')[0],
                    "func_name": "main",
                    "local_vars": {},
                    "global_vars": {},
                    "stack": [{"function": "main", "line": 1}],
                    "output": [],
                    "final_output": actual_output or actual_error
                }]
            })

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Code execution timed out (10s limit)", "steps": [], "total_steps": 0}), 500
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!"}), 429
        return jsonify({"error": str(e), "steps": [], "total_steps": 0}), 500
    
@app.route("/fix", methods=["POST"])
def fix_code():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "auto")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    lang_str = "auto-detect the language and" if language == "auto" else f"treat this as {language} code and"

    prompt = f"""You are an expert code fixer and optimizer. The user has pasted the following code. Please {lang_str} analyze, fix, and optimize it.

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no explanation outside JSON):
{{
  "original_code": "the original code as-is",
  "fixed_code": "the fully fixed and optimized version of the code",
  "language": "detected language",
  "changes": [
    {{
      "type": "bug_fix/optimization/style/security",
      "title": "Short title of change",
      "description": "What was wrong and what was fixed",
      "line": <line number or null>
    }}
  ],
  "summary": "Overall summary of what was fixed and optimized",
  "score_before": <code quality score 0-100>,
  "score_after": <code quality score 0-100>
}}

Be thorough — fix ALL bugs, optimize ALL inefficiencies, improve readability. If code is already perfect, still return the structure with empty changes array.

CODE TO FIX:
{code}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert code fixer. Always respond with valid JSON only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        text = response.choices[0].message.content
        clean = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse AI response"}), 500
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!"}), 429
        return jsonify({"error": str(e)}), 500

@app.route("/explain", methods=["POST"])
def explain_code():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "auto")
    level = data.get("level", "simple")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    lang_str = "auto-detect the language and" if language == "auto" else f"treat this as {language} code and"

    level_prompts = {
        "eli5": "Explain like I'm 5 years old. Use very simple words, fun analogies and real-world examples a child would understand.",
        "simple": "Explain in simple English for a beginner programmer. Avoid jargon.",
        "intermediate": "Explain for an intermediate developer. Use proper technical terms but keep it clear.",
        "expert": "Explain in depth for an expert developer. Include technical details, patterns and best practices."
    }

    level_prompt = level_prompts.get(level, level_prompts["simple"])

    prompt = f"""You are a code explainer. The user has pasted the following code. Please {lang_str} explain it.

{level_prompt}

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no explanation outside JSON):
{{
  "title": "What this code does in one line",
  "language": "detected language",
  "summary": "2-3 sentence plain English summary",
  "analogy": "A fun real-world analogy that explains what this code does",
  "sections": [
    {{
      "heading": "Section heading",
      "explanation": "Plain English explanation of this section",
      "code": "relevant code snippet"
    }}
  ],
  "key_concepts": [
    {{
      "concept": "concept name",
      "explanation": "what it means in simple terms"
    }}
  ],
  "fun_fact": "An interesting fact about this code or the concepts it uses"
}}

Give 3-6 sections and 2-5 key concepts.

CODE TO EXPLAIN:
{code}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {
                    "role": "system",
                    "content": "You are a friendly code explainer. Always respond with valid JSON only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
        text = response.choices[0].message.content
        clean = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        return jsonify(result)
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse AI response"}), 500
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!"}), 429
        return jsonify({"error": str(e)}), 500
    
def _detect_language_from_code(code):
    """Detect programming language from code content using keyword heuristics"""
    code_stripped = code.strip()

    # Java — must check before C/C++ because of similar syntax
    if re.search(r'public\s+class\s+\w+', code) or re.search(r'System\.out\.print', code):
        return "Java"
    # JavaScript / Node.js
    if re.search(r'\b(console\.log|function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|=>|require\(|module\.exports)', code):
        return "JavaScript"
    # Go
    if re.search(r'package\s+main|func\s+main\s*\(|fmt\.(Print|Scan)', code):
        return "Go"
    # Rust
    if re.search(r'fn\s+main\s*\(|println!\s*\(|let\s+mut\s+', code):
        return "Rust"
    # Ruby
    if re.search(r'\bputs\s+|def\s+\w+.*\bend\b|\.each\s+do', code):
        return "Ruby"
    # PHP
    if re.search(r'<\?php|\$\w+\s*=|echo\s+', code):
        return "PHP"
    # C++ — check before C
    if re.search(r'#include\s*<iostream>|cout\s*<<|cin\s*>>|using\s+namespace\s+std|std::', code):
        return "C++"
    # C
    if re.search(r'#include\s*<stdio\.h>|printf\s*\(|scanf\s*\(|int\s+main\s*\(', code):
        return "C"
    # Python — default fallback for indentation-based, def/class, print()
    if re.search(r'def\s+\w+\s*\(|class\s+\w+|print\s*\(|import\s+\w+|from\s+\w+\s+import', code):
        return "Python"

    return "Python"  # default


@app.route("/visualize-algo", methods=["POST"])
def visualize_algo():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "auto")

    if not code:
        return jsonify({"error": "No code provided"}), 400

    # Resolve "auto" to an actual language
    if language == "auto":
        language = _detect_language_from_code(code)

    # Python — real execution engine with sys.settrace
    if language == "Python":
        try:
            result = build_algo_visualization(code)
            if result.get('tree_nodes') and result.get('steps'):
                return jsonify(result)
        except Exception as e:
            print(f"Python engine error: {e}")

    real_output = ""
    trace = []

    # Language-specific tracers
    tracer_map = {
        "JavaScript": trace_javascript,
        "C": trace_cpp,
        "C++": trace_cpp,
        "Java": trace_java,
        "Go": trace_go,
        "Rust": trace_rust,
        "Ruby": trace_ruby,
        "PHP": trace_php,
    }

    tracer_fn = tracer_map.get(language)
    if tracer_fn:
        try:
            real_output, trace = tracer_fn(code)
            result = build_visualization_from_trace(code, language, real_output, trace)
            if result.get('tree_nodes') and result.get('steps'):
                return jsonify(result)
        except Exception as e:
            print(f"{language} tracer error: {e}")

    # Final fallback — AI-generated visualization
    prompt = f"""Analyze this {language} algorithm and return ONLY a JSON visualization.

CODE:
{code[:500]}

ACTUAL OUTPUT FROM RUNNING THE CODE: {real_output[:200] if real_output else 'not available'}

Return this EXACT JSON structure with ACCURATE values from the code.
Build a proper execution tree with parent-child relationships.
Each tree_node must have an appropriate depth value for tree layout.
Give at least 5 steps and 3 tree nodes.

{{
  "algo_type": "recursion/sorting/searching/tree/graph/linear",
  "title": "descriptive algorithm name",
  "description": "what it does",
  "time_complexity": "O(?)",
  "space_complexity": "O(?)",
  "tree_nodes": [
    {{"id":"n1","value":"main","label":"main()","left":"n2","right":"n3","parent":null,"depth":0,"x_offset":0}},
    {{"id":"n2","value":"step1","label":"step 1","left":null,"right":null,"parent":"n1","depth":1,"x_offset":0}},
    {{"id":"n3","value":"step2","label":"step 2","left":null,"right":null,"parent":"n1","depth":1,"x_offset":0}}
  ],
  "steps": [
    {{"id":"s1","node_id":"n1","operation":"CALL","description":"description of what happens","code_line":1,"visited_nodes":[],"output":[],"highlighted_nodes":["n1"],"edge_from":null,"edge_to":"n1"}},
    {{"id":"s2","node_id":"n2","operation":"VISIT","description":"description","code_line":2,"visited_nodes":["n1"],"output":[],"highlighted_nodes":["n2"],"edge_from":"n1","edge_to":"n2"}}
  ],
  "final_output": ["{real_output.strip()[:100] if real_output else ''}"],
  "total_steps": 5
}}

IMPORTANT: Use operation types from: CALL, RETURN, VISIT, COMPARE, SWAP, SPLIT, MERGE, BASE_CASE.
tree_nodes MUST have proper depth values (0 for root, 1 for children, 2 for grandchildren, etc.)
and parent references to form a valid tree structure."""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=3000,
            messages=[
                {"role": "system", "content": "You are an algorithm visualization engine. Output ONLY valid JSON with exact values from the code. Build proper tree structures with parent-child relationships and correct depth values."},
                {"role": "user", "content": prompt}
            ]
        )
        text = response.choices[0].message.content.strip()
        result = None
        try:
            result = json.loads(text)
        except:
            pass
        if not result:
            try:
                clean = text.replace("```json","").replace("```","").strip()
                result = json.loads(clean)
            except:
                pass
        if not result:
            try:
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end > start:
                    result = json.loads(text[start:end])
            except:
                pass
        if result:
            # Validate tree_nodes have required fields
            if 'tree_nodes' in result:
                for node in result['tree_nodes']:
                    node.setdefault('depth', 0)
                    node.setdefault('parent', None)
                    node.setdefault('left', None)
                    node.setdefault('right', None)
                    node.setdefault('x_offset', 0)
            return jsonify(result)
        return jsonify({"error": "Failed to visualize. Try again!"}), 500
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Wait 1 minute!"}), 429
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)