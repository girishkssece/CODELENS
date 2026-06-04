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

        elif language == "JavaScript":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["node", temp_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            return jsonify({"output": result.stdout, "error": result.stderr, "returncode": result.returncode})

        elif language in ["C", "C++"]:
            suffix = '.c' if language == "C" else '.cpp'
            compiler = "gcc" if language == "C" else "g++"
            with tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace(suffix, '.exe')
            compile_result = subprocess.run([compiler, temp_path, "-o", exe_path], capture_output=True, text=True, timeout=10)
            if compile_result.returncode != 0:
                os.unlink(temp_path)
                return jsonify({"output": "", "error": compile_result.stderr, "returncode": compile_result.returncode})
            run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            os.unlink(exe_path)
            return jsonify({"output": run_result.stdout, "error": run_result.stderr, "returncode": run_result.returncode})

        elif language == "Java":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.java', delete=False, dir=tempfile.gettempdir()) as f:
                f.write(code)
                temp_path = f.name

            # Extract class name from code
            class_match = re.search(r'(?:public\s+)?class\s+(\w+)', code)
            class_name = class_match.group(1) if class_match else 'Main'

            # Rename file to match class name
            proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
            os.rename(temp_path, proper_path)

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
            class_match = re.search(r'(?:public\s+)?class\s+(\w+)', code)
            class_name = class_match.group(1) if class_match else 'Main'
            proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
            os.rename(temp_path, proper_path)
            compile_result = subprocess.run(["javac", proper_path], capture_output=True, text=True, timeout=15)
            if compile_result.returncode == 0:
                run_result = subprocess.run(["java", "-cp", tempfile.gettempdir(), class_name], capture_output=True, text=True, timeout=15)
                actual_output = run_result.stdout
                actual_error = run_result.stderr
            else:
                actual_error = compile_result.stderr
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
    
@app.route("/visualize-algo", methods=["POST"])
def visualize_algo():
    data = request.get_json()
    code = data.get("code", "")
    language = data.get("language", "auto")

    # Limit code length to avoid token issues
    if len(code) > 500:
        code = code[:500]

    if not code:
        return jsonify({"error": "No code provided"}), 400

    lang_str = "auto-detect the language and" if language == "auto" else f"treat this as {language} code and"

    # Count lines to determine complexity
    code_lines = len(code.strip().split('\n'))

    # Use simpler prompt for complex algorithms
    prompt = f"""Generate a JSON visualization for this algorithm. Return ONLY valid JSON, nothing else.

CODE:
{code[:400]}

Return this exact JSON structure with 6-8 nodes and 6-8 steps maximum:
{{
  "algo_type": "recursion",
  "title": "Tower of Hanoi",
  "description": "Move disks from source to target",
  "time_complexity": "O(2^n)",
  "space_complexity": "O(n)",
  "tree_nodes": [
    {{"id": "n1", "value": "hanoi(3)", "label": "hanoi(3,A,C)", "left": "n2", "right": "n3", "parent": null, "depth": 0, "x_offset": 0}},
    {{"id": "n2", "value": "hanoi(2)", "label": "hanoi(2,A,B)", "left": "n4", "right": "n5", "parent": "n1", "depth": 1, "x_offset": -1}},
    {{"id": "n3", "value": "hanoi(1)", "label": "hanoi(1,A,C)", "left": null, "right": null, "parent": "n1", "depth": 1, "x_offset": 1}},
    {{"id": "n4", "value": "hanoi(1)", "label": "hanoi(1,A,C)", "left": null, "right": null, "parent": "n2", "depth": 2, "x_offset": -1}},
    {{"id": "n5", "value": "hanoi(1)", "label": "hanoi(1,B,C)", "left": null, "right": null, "parent": "n2", "depth": 2, "x_offset": 1}}
  ],
  "steps": [
    {{"id": "s1", "node_id": "n1", "operation": "CALL", "description": "Start hanoi(3)", "code_line": 1, "visited_nodes": [], "output": [], "highlighted_nodes": ["n1"], "edge_from": null, "edge_to": null}},
    {{"id": "s2", "node_id": "n2", "operation": "CALL", "description": "Move 2 disks A to B", "code_line": 4, "visited_nodes": ["n1"], "output": [], "highlighted_nodes": ["n2"], "edge_from": "n1", "edge_to": "n2"}},
    {{"id": "s3", "node_id": "n4", "operation": "BASE_CASE", "description": "Move disk 1 A to C", "code_line": 2, "visited_nodes": ["n1","n2"], "output": ["Move 1: A→C"], "highlighted_nodes": ["n4"], "edge_from": "n2", "edge_to": "n4"}},
    {{"id": "s4", "node_id": "n5", "operation": "RETURN", "description": "Move disk 2 A to B", "code_line": 5, "visited_nodes": ["n1","n2","n4"], "output": ["Move 1: A→C","Move 2: A→B"], "highlighted_nodes": ["n5"], "edge_from": "n2", "edge_to": "n5"}},
    {{"id": "s5", "node_id": "n3", "operation": "BASE_CASE", "description": "Move disk 3 A to C", "code_line": 2, "visited_nodes": ["n1","n2","n4","n5"], "output": ["Move 1: A→C","Move 2: A→B","Move 3: A→C"], "highlighted_nodes": ["n3"], "edge_from": "n1", "edge_to": "n3"}}
  ],
  "final_output": ["7 total moves"],
  "total_steps": 5
}}

Generate the actual visualization for the given code. Keep it simple — max 8 nodes and 8 steps. Return ONLY JSON.
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {
                    "role": "system",
                    "content": "You are an algorithm visualization engine. Always respond with valid JSON only. No markdown."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
        text = response.choices[0].message.content
        print("AI RESPONSE:", text[:500])  # add this line
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            clean = text[start:end+1]
        else:
            clean = text.replace("```json", "").replace("```", "").strip()
            
        result = json.loads(clean)
        return jsonify(result)
    except json.JSONDecodeError as e:
        # Try to extract JSON from response
        try:
            import re
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return jsonify(result)
        except:
            pass
        return jsonify({"error": "Failed to parse AI response. Try again!"}), 500
    except Exception as e:
        if '429' in str(e):
            return jsonify({"error": "Rate limit hit. Please wait 1 minute and try again!"}), 429
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)