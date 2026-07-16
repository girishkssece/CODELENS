from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types
import os
import json
import subprocess
import tempfile
import traceback
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
from step_builder import build_execution_steps

load_dotenv()

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:5173",
    "http://localhost:5174",
    "https://your-frontend-url.com",
    "*"
])

# ── Gemini model config ──
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = "gemini-2.5-flash"
GROQ_MODEL = "qwen/qwen3.6-27b"

def _extract_json(text):
    """Robustly extract a JSON object from LLM output.
    Handles <think>...</think> tags, markdown fences, and stray text."""
    if not text:
        return None
    original_text = text
    # 1. Strip <think>...</think> blocks — try lazy first (safer), then greedy
    text = re.sub(r'<think>[\s\S]*?</think>', '', original_text).strip()
    if not text:
        # If lazy wiped everything, try greedy on original
        text = re.sub(r'<think>[\s\S]*</think>', '', original_text).strip()
    if not text:
        # Last resort: take everything after last </think>
        idx = original_text.rfind('</think>')
        if idx != -1:
            text = original_text[idx + len('</think>'):].strip()
        else:
            text = original_text.strip()
    # 2. Strip markdown fences
    text = re.sub(r'```(?:json)?\s*', '', text).strip()
    # 3. Strip leading/trailing non-JSON text (e.g. "Here is the JSON:")
    text = text.strip()
    # 4. Try direct parse
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass
    # 5. Try cleaning control characters then parse
    cleaned_text = re.sub(r'[\x00-\x1f\x7f]', ' ', text)
    try:
        return json.loads(cleaned_text)
    except (json.JSONDecodeError, ValueError):
        pass
    # 6. Find { ... } block with proper brace matching (handles nested and strings)
    search_start = 0
    while True:
        start = text.find('{', search_start)
        if start == -1:
            break
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == '\\' and in_string:
                escape = True
                continue
            if ch == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:i+1]
                    try:
                        return json.loads(candidate)
                    except (json.JSONDecodeError, ValueError):
                        # Try cleaning control chars
                        cleaned = re.sub(r'[\x00-\x1f\x7f]', ' ', candidate)
                        try:
                            return json.loads(cleaned)
                        except (json.JSONDecodeError, ValueError):
                            pass
                    break
        # Try next { if this one failed
        search_start = start + 1
    # 7. Last resort: regex-based extraction
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            cleaned = re.sub(r'[\x00-\x1f\x7f]', ' ', json_match.group())
            return json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def _groq_json_request(system_msg, user_prompt, max_tokens=2000):
    """Make a Gemini API call that reliably returns parsed JSON."""
    # Build system message that explicitly tells model not to think
    system_clean = system_msg.rstrip()
    if '/no_think' not in system_clean:
        system_clean += "\n/no_think"

    user_prompt_clean = user_prompt.rstrip() + "\n\n/no_think"

    def _call_gemini(prompt):
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2),
        )
        return getattr(response, "text", "")

    # Attempt 1: combined system + user prompt for structured JSON output
    try:
        prompt = f"{system_clean}\n\n{user_prompt_clean}"
        text = _call_gemini(prompt)
        result = _extract_json(text)
        if result:
            return result
        print(f"[Gemini] Attempt 1: JSON parsing failed. Raw length={len(text) if text else 0}")
    except Exception as e:
        print(f"[Gemini] Attempt 1 failed: {str(e)[:120]}")

    # Attempt 2: fallback — same prompt, free-form parsing
    try:
        prompt = f"{system_clean}\n\n{user_prompt_clean}"
        text = _call_gemini(prompt)
        result = _extract_json(text)
        if result:
            return result
        print(f"[Gemini] Attempt 2: Free-form response but parsing failed. Raw (first 500 chars): {text[:500] if text else 'EMPTY'}")
    except Exception as e:
        print(f"[Gemini] Attempt 2 failed: {str(e)[:120]}")

    # Attempt 3: simplified prompt — explicitly ask for JSON only
    try:
        simple_prompt = (
            "You are a JSON-only API. Output raw JSON with no markdown, no explanation, no thinking. "
            "Start your response with { and end with }.\n/no_think\n\n"
            f"{user_prompt_clean}"
        )
        text = _call_gemini(simple_prompt)
        result = _extract_json(text)
        if result:
            return result
        print(f"[Gemini] Attempt 3: Simplified prompt also failed. Raw (first 500 chars): {text[:500] if text else 'EMPTY'}")
    except Exception as e:
        print(f"[Gemini] Attempt 3 failed: {str(e)[:120]}")

    return None

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


@app.route("/check-languages", methods=["GET"])
def check_languages():
    import shutil
    checks = {
        'python': shutil.which('python') or shutil.which('python3'),
        'node': shutil.which('node'),
        'javac': shutil.which('javac'),
        'gcc': shutil.which('gcc'),
        'g++': shutil.which('g++'),
        'go': shutil.which('go'),
        'rustc': shutil.which('rustc'),
        'ruby': shutil.which('ruby'),
        'php': shutil.which('php'),
    }
    return jsonify(checks)


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
        result = _groq_json_request(
            "You are a code analysis engine. Always respond with valid JSON only. No markdown, no explanation, just JSON.",
            prompt,
            max_tokens=6000
        )
        if result:
            # Normalize response — ensure all required keys exist with proper defaults
            normalized = {
                "visual": result.get("visual", {
                    "language": "Unknown",
                    "complexity": "N/A",
                    "space_complexity": "N/A",
                    "lines": 0,
                    "summary": True,
                    "steps": []
                }),
                "flow": result.get("flow", {"nodes": [], "edges": []}),
                "review": result.get("review", {"bugs": [], "improvements": [], "strengths": [], "info": []}),
                "variables": result.get("variables", [])
            }
            # Ensure review sub-keys exist
            review = normalized["review"]
            if not isinstance(review, dict):
                review = {"bugs": [], "improvements": [], "strengths": [], "info": []}
                normalized["review"] = review
            for key in ["bugs", "improvements", "strengths", "info"]:
                if key not in review or not isinstance(review[key], list):
                    review[key] = []
            # Ensure variables is a list
            if not isinstance(normalized["variables"], list):
                normalized["variables"] = []
            # Ensure visual has steps
            visual = normalized["visual"]
            if not isinstance(visual, dict):
                visual = {"language": "Unknown", "complexity": "N/A", "lines": 0, "steps": []}
                normalized["visual"] = visual
            if "steps" not in visual or not isinstance(visual.get("steps"), list):
                visual["steps"] = []
            return jsonify(normalized)
        print("[Analyze] All JSON extraction attempts failed — returning error to client")
        return jsonify({"error": "Failed to parse AI response. Please try again!"}), 500

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
            compile_result = subprocess.run([compiler, temp_path, "-o", exe_path], capture_output=True, text=True, timeout=15)
            if compile_result.returncode != 0:
                os.unlink(temp_path)
                return jsonify({"output": "", "error": compile_result.stderr, "returncode": compile_result.returncode})
            run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
            os.unlink(temp_path)
            if os.path.exists(exe_path):
                os.unlink(exe_path)
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
    try:
        data = request.get_json()
        code = data.get("code", "")
        language = data.get("language", "Python")
        print(f"EXECUTE: lang={language}, code={code[:50]}")

        if not code:
            return jsonify({"error": "No code provided"}), 400

        # Real execution for Python
        if language == "Python":
            try:
                result = execute_python_steps(code)
                result["mode"] = "real"
                print(f"Python result: {len(result.get('steps', []))} steps")
                return jsonify(result)
            except Exception as e:
                print(f"Python executor error: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({"error": str(e), "steps": [], "total_steps": 0}), 500
    except Exception as e:
        print(f"Execute route error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    # For other languages — run code then build steps locally (no AI)
    try:
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

            class_match = re.search(r'public\s+class\s+(\w+)', code)
            if not class_match:
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

        # Build steps locally — no AI call needed
        result = build_execution_steps(code, language, actual_output, actual_error)
        return jsonify(result)

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
        result = _groq_json_request(
            "You are an expert code fixer. Always respond with valid JSON only.",
            prompt
        )
        if result:
            return jsonify(result)
        return jsonify({"error": "Failed to parse AI response"}), 500

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

    prompt = f"""Analyze and explain the following {language} code. {level_prompt}

You MUST return a JSON object with ALL fields filled with real, meaningful content.
Do NOT use placeholder values like "..." — write actual explanations.

JSON structure:
{{
  "title": "<write a one-line summary of what this code does>",
  "language": "<the programming language>",
  "summary": "<write 2-3 sentences explaining what the code does overall>",
  "analogy": "<write a fun real-world analogy for what this code does>",
  "sections": [
    {{
      "heading": "<section title>",
      "explanation": "<detailed plain English explanation of this part>",
      "code": "<the relevant code snippet from the user's code>"
    }}
  ],
  "key_concepts": [
    {{
      "concept": "<concept name like recursion, linked list, etc>",
      "explanation": "<what this concept means in simple terms>"
    }}
  ],
  "fun_fact": "<an interesting fact about the algorithm or concepts used>"
}}

IMPORTANT: Generate 3-6 sections with REAL explanations (not "..."). Generate 2-5 key concepts with REAL descriptions. Every field must have actual content.

Here is the code to explain:
```
{code}
```"""

    try:
        result = _groq_json_request(
            "You are a code explainer. Return valid JSON with all fields filled with real content. Never use placeholder values.",
            prompt,
            max_tokens=4000
        )
        if result:
            return jsonify(result)
        return jsonify({"error": "Failed to parse AI response"}), 500
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

    # Resolve auto language
    if language == "auto":
        try:
            detection = detector.detect(code)
            language = detection.get("language", "Python")
        except:
            language = "Python"

    # ── Python: use real execution engine ──
    if language == "Python":
        try:
            result = build_algo_visualization(code)
            if result and result.get('steps') and len(result['steps']) > 0:
                return jsonify(result)
        except Exception as e:
            print(f"Python engine error: {e}")
        # Fall through to Gemini if engine fails

    # ── All languages: run code first to get real output ──
    real_output = ""
    real_error = ""
    try:
        if language == "JavaScript":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write(code)
                temp_path = f.name
            r = subprocess.run(["node", temp_path], capture_output=True, text=True, timeout=10)
            real_output = r.stdout.strip()
            real_error = r.stderr.strip()
            os.unlink(temp_path)

        elif language in ["C", "C++"]:
            suffix = '.c' if language == "C" else '.cpp'
            compiler = "gcc" if language == "C" else "g++"
            with tempfile.NamedTemporaryFile(mode='w', suffix=suffix, delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace(suffix, '.exe')
            cr = subprocess.run([compiler, temp_path, "-o", exe_path], capture_output=True, text=True, timeout=10)
            if cr.returncode == 0:
                r = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
                real_output = r.stdout.strip()
                real_error = r.stderr.strip()
                if os.path.exists(exe_path): os.unlink(exe_path)
            else:
                real_error = cr.stderr.strip()
            os.unlink(temp_path)

        elif language == "Java":
            class_match = re.search(r'(?:public\s+)?class\s+(\w+)', code)
            class_name = class_match.group(1) if class_match else 'Main'
            proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
            with open(proper_path, 'w') as f:
                f.write(code)
            cr = subprocess.run(["javac", proper_path], capture_output=True, text=True, timeout=15)
            if cr.returncode == 0:
                r = subprocess.run(["java", "-cp", tempfile.gettempdir(), class_name], capture_output=True, text=True, timeout=15)
                real_output = r.stdout.strip()
                real_error = r.stderr.strip()
            else:
                real_error = cr.stderr.strip()
            if os.path.exists(proper_path): os.unlink(proper_path)
            class_file = os.path.join(tempfile.gettempdir(), f"{class_name}.class")
            if os.path.exists(class_file): os.unlink(class_file)

        elif language == "Go":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.go', delete=False) as f:
                f.write(code)
                temp_path = f.name
            r = subprocess.run(["go", "run", temp_path], capture_output=True, text=True, timeout=30)
            real_output = r.stdout.strip()
            real_error = r.stderr.strip()
            os.unlink(temp_path)

        elif language == "Rust":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rs', delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace('.rs', '.exe')
            cr = subprocess.run(["rustc", temp_path, "-o", exe_path], capture_output=True, text=True, timeout=30)
            if cr.returncode == 0:
                r = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
                real_output = r.stdout.strip()
                if os.path.exists(exe_path): os.unlink(exe_path)
            else:
                real_error = cr.stderr.strip()
            os.unlink(temp_path)

        elif language == "Ruby":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rb', delete=False) as f:
                f.write(code)
                temp_path = f.name
            r = subprocess.run(["ruby", temp_path], capture_output=True, text=True, timeout=10)
            real_output = r.stdout.strip()
            os.unlink(temp_path)

        elif language == "PHP":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.php', delete=False) as f:
                f.write(code)
                temp_path = f.name
            r = subprocess.run(["php", temp_path], capture_output=True, text=True, timeout=10)
            real_output = r.stdout.strip()
            os.unlink(temp_path)

        elif language == "Python":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                temp_path = f.name
            r = subprocess.run(["python", temp_path], capture_output=True, text=True, timeout=10)
            real_output = r.stdout.strip()
            real_error = r.stderr.strip()
            os.unlink(temp_path)

    except Exception as run_err:
        print(f"Run error: {run_err}")

    # ── Detect algorithm info ──
    code_lower = code.lower()
    if any(x in code_lower for x in ['bubble', 'bubblesort']):
        algo_title = "Bubble Sort"
        viz_type = "array"
        time_c, space_c = "O(n²)", "O(1)"
    elif any(x in code_lower for x in ['merge', 'mergesort']):
        algo_title = "Merge Sort"
        viz_type = "array"
        time_c, space_c = "O(n log n)", "O(n)"
    elif any(x in code_lower for x in ['quick', 'quicksort', 'partition']):
        algo_title = "Quick Sort"
        viz_type = "array"
        time_c, space_c = "O(n log n)", "O(log n)"
    elif any(x in code_lower for x in ['selection', 'selectionsort']):
        algo_title = "Selection Sort"
        viz_type = "array"
        time_c, space_c = "O(n²)", "O(1)"
    elif any(x in code_lower for x in ['insertion', 'insertionsort']):
        algo_title = "Insertion Sort"
        viz_type = "array"
        time_c, space_c = "O(n²)", "O(1)"
    elif any(x in code_lower for x in ['binary_search', 'binarysearch', 'binary search']):
        algo_title = "Binary Search"
        viz_type = "array"
        time_c, space_c = "O(log n)", "O(1)"
    elif any(x in code_lower for x in ['fibonacci', 'fib(']):
        algo_title = "Fibonacci"
        viz_type = "simple"
        time_c, space_c = "O(2^n)", "O(n)"
    elif any(x in code_lower for x in ['factorial']):
        algo_title = "Factorial"
        viz_type = "simple"
        time_c, space_c = "O(n)", "O(n)"
    elif any(x in code_lower for x in ['inorder', 'preorder', 'postorder']):
        algo_title = "Tree Traversal"
        viz_type = "tree"
        time_c, space_c = "O(n)", "O(h)"
    elif any(x in code_lower for x in ['bfs', 'breadth']):
        algo_title = "BFS"
        viz_type = "graph"
        time_c, space_c = "O(V+E)", "O(V)"
    elif any(x in code_lower for x in ['dfs', 'depth']):
        algo_title = "DFS"
        viz_type = "graph"
        time_c, space_c = "O(V+E)", "O(V)"
    elif any(x in code_lower for x in ['dp', 'memo', 'knapsack', 'coin']):
        algo_title = "Dynamic Programming"
        viz_type = "dp_table"
        time_c, space_c = "O(n²)", "O(n)"
    else:
        algo_title = f"{language} Algorithm"
        viz_type = "simple"
        time_c, space_c = "O(n)", "O(1)"

    # ── Use Gemini to generate visualization with real output ──
    code_short = code[:800] if len(code) > 800 else code
    output_info = f"ACTUAL OUTPUT: {real_output[:200]}" if real_output else "No output captured"
    error_info = f"COMPILE/RUN ERROR: {real_error[:100]}" if real_error else ""

    prompt = f"""You are an algorithm visualization expert. Generate step-by-step visualization data for this {language} code.

LANGUAGE: {language}
ALGORITHM: {algo_title}
VIZ TYPE: {viz_type}
{output_info}
{error_info}

CODE:
{code_short}

CRITICAL RULES:
1. Use EXACT values from the code — never make up values
2. For sorting (bubble/merge/quick/selection): show array state at EACH important step
3. For searching (binary search): show low/mid/high pointer positions at each step
4. For trees: show actual node values from code
5. Steps should be human-readable: "Compare arr[2]=5 with arr[3]=3" NOT "line 5"
6. Generate 8-15 steps maximum

Return ONLY this JSON (no markdown, no explanation):
{{
  "viz_type": "{viz_type}",
  "title": "{algo_title}",
  "time_complexity": "{time_c}",
  "space_complexity": "{space_c}",
  "steps": [
    {{
      "id": 1,
      "code_line": 1,
      "operation": "COMPARE",
      "description": "human readable description with actual values",
      "variables": {{"i": 0, "j": 1}},
      "output_so_far": [],
      "arrays": {{"arr": [12, 11, 13, 5, 6, 7]}},
      "pointers": [{{"name": "low", "index": 0}}, {{"name": "high", "index": 5}}],
      "highlights": [{{"index": 0, "type": "compare"}}],
      "sorted_indices": []
    }}
  ],
  "final_output": ["{real_output[:100] if real_output else 'computed'}"],
  "total_steps": 8
}}

Operation types: CALL, RETURN, COMPARE, SWAP, ASSIGN, VISIT, MERGE, SPLIT, FILL, PRINT
For sorting: include "arrays" with current state and "highlights" showing which indices are being compared/swapped
For binary search: include "arrays" with the array, "pointers" with low/mid/high positions
For trees: include node states
For simple code: include "variables" showing values at each step

Generate visualization for {algo_title} with EXACT values from the code above."""

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )
        text = response.text.strip()

        # Extract JSON
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

        if result and result.get('steps'):
            # Ensure required fields
            result['viz_type'] = result.get('viz_type', viz_type)
            result['title'] = result.get('title', algo_title)
            result['time_complexity'] = result.get('time_complexity', time_c)
            result['space_complexity'] = result.get('space_complexity', space_c)
            result['final_output'] = result.get('final_output', [real_output] if real_output else [])
            result['total_steps'] = len(result['steps'])
            return jsonify(result)

    except Exception as e:
        print(f"Gemini error: {e}")

    # ── Final fallback: build from code lines ──
    lines = code.split('\n')
    steps = []
    sig_lines = [(i+1, l.strip()) for i, l in enumerate(lines)
                 if l.strip() and not l.strip().startswith('//')
                 and not l.strip().startswith('#')
                 and l.strip() not in ('{', '}')][:20]

    out_lines = [l for l in real_output.split('\n') if l] if real_output else []

    for idx, (lnum, ltext) in enumerate(sig_lines):
        op = 'CALL' if idx == 0 else 'RETURN' if idx == len(sig_lines)-1 else 'LINE'
        if any(k in ltext.lower() for k in ['if ', 'while ', 'for ']):
            op = 'COMPARE'
        elif '=' in ltext and '==' not in ltext:
            op = 'ASSIGN'
        elif 'swap' in ltext.lower():
            op = 'SWAP'
        elif 'print' in ltext.lower() or 'cout' in ltext.lower() or 'console' in ltext.lower():
            op = 'PRINT'

        steps.append({
            'id': idx + 1,
            'code_line': lnum,
            'operation': op,
            'description': ltext[:60],
            'variables': {},
            'output_so_far': out_lines if idx == len(sig_lines)-1 else [],
            'arrays': {},
            'pointers': [],
            'highlights': [],
            'sorted_indices': [],
        })

    return jsonify({
        'viz_type': viz_type,
        'title': algo_title,
        'time_complexity': time_c,
        'space_complexity': space_c,
        'steps': steps,
        'final_output': out_lines,
        'total_steps': len(steps),
    })


def _build_fallback_viz(code, language):
    """Build a simple but always-working visualization from code lines"""
    from code_tracer import _detect_algo_info, _detect_operation
    
    lines = code.split('\n')
    algo_type, title, time_c, space_c = _detect_algo_info(code, language)
    
    # Run code to get real output
    real_output = ""
    try:
        if language == "Python":
            import tempfile, subprocess
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["python", temp_path], capture_output=True, text=True, timeout=10)
            real_output = result.stdout.strip()
            os.unlink(temp_path)
        elif language == "JavaScript":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write(code)
                temp_path = f.name
            result = subprocess.run(["node", temp_path], capture_output=True, text=True, timeout=10)
            real_output = result.stdout.strip()
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
                real_output = run_result.stdout.strip()
                os.unlink(exe_path)
            os.unlink(temp_path)
        elif language == "Java":
            class_match = re.search(r'(?:public\s+)?class\s+(\w+)', code)
            class_name = class_match.group(1) if class_match else 'Main'
            proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
            with open(proper_path, 'w') as f:
                f.write(code)
            compile_result = subprocess.run(["javac", proper_path], capture_output=True, text=True, timeout=15)
            if compile_result.returncode == 0:
                run_result = subprocess.run(["java", "-cp", tempfile.gettempdir(), class_name], capture_output=True, text=True, timeout=15)
                real_output = run_result.stdout.strip()
            os.unlink(proper_path)
        elif language == "Go":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.go', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["go", "run", temp_path], capture_output=True, text=True, timeout=30)
            real_output = run_result.stdout.strip()
            os.unlink(temp_path)
        elif language == "Rust":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rs', delete=False) as f:
                f.write(code)
                temp_path = f.name
            exe_path = temp_path.replace('.rs', '.exe')
            compile_result = subprocess.run(["rustc", temp_path, "-o", exe_path], capture_output=True, text=True, timeout=30)
            if compile_result.returncode == 0:
                run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
                real_output = run_result.stdout.strip()
                os.unlink(exe_path)
            os.unlink(temp_path)
        elif language == "Ruby":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.rb', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["ruby", temp_path], capture_output=True, text=True, timeout=10)
            real_output = run_result.stdout.strip()
            os.unlink(temp_path)
        elif language == "PHP":
            with tempfile.NamedTemporaryFile(mode='w', suffix='.php', delete=False) as f:
                f.write(code)
                temp_path = f.name
            run_result = subprocess.run(["php", temp_path], capture_output=True, text=True, timeout=10)
            real_output = run_result.stdout.strip()
            os.unlink(temp_path)
    except Exception as e:
        print(f"Fallback run error: {e}")

    # Build steps from significant lines
    steps = []
    significant = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith('//') and \
           not stripped.startswith('#') and not stripped.startswith('/*') and \
           not stripped.startswith('*') and stripped != '{' and stripped != '}':
            significant.append((i + 1, stripped))

    significant = significant[:30]

    output_lines = [l for l in real_output.split('\n') if l] if real_output else []

    for idx, (line_num, line_text) in enumerate(significant):
        op = _detect_operation(line_text)
        if idx == 0:
            op = 'CALL'
        elif idx == len(significant) - 1:
            op = 'RETURN'

        out = output_lines if idx == len(significant) - 1 else []

        steps.append({
            'id': idx + 1,
            'code_line': line_num,
            'operation': op,
            'description': line_text[:60],
            'variables': {},
            'output_so_far': out,
            'changed_vars': [],
            'call_stack': [{'function': 'main', 'line': line_num}],
        })

    return {
        'viz_type': 'simple',
        'title': title,
        'description': f'{language} — Step by step execution',
        'time_complexity': time_c,
        'space_complexity': space_c,
        'steps': steps,
        'final_output': output_lines,
        'total_steps': len(steps),
    }

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    static_folder = os.path.join(os.path.dirname(__file__), 'static')
    if path != '' and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)
    return send_from_directory(static_folder, 'index.html')

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)