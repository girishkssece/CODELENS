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

load_dotenv()

app = Flask(__name__)
CORS(app)

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
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)