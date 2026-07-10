"""
Step Builder — generates execution steps from code + real output
without any AI calls. Fast, deterministic, and works for all languages.
"""

import re


def _detect_functions(code, language):
    """Detect function definitions and their line numbers."""
    patterns = {
        'Python':     r'def\s+(\w+)\s*\(',
        'JavaScript': r'(?:function\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()',
        'Java':       r'(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(',
        'C':          r'(?:int|void|float|double|char|long|short|unsigned)\s+(\w+)\s*\(',
        'C++':        r'(?:int|void|float|double|char|long|short|unsigned|auto|string|bool|vector)\s+(\w+)\s*\(',
        'Go':         r'func\s+(\w+)\s*\(',
        'Rust':       r'fn\s+(\w+)\s*\(',
        'Ruby':       r'def\s+(\w+)',
        'PHP':        r'function\s+(\w+)\s*\(',
    }
    pat = patterns.get(language, patterns.get('Python'))
    funcs = {}
    for m in re.finditer(pat, code):
        name = next((g for g in m.groups() if g), None)
        if name:
            line = code[:m.start()].count('\n') + 1
            funcs[line] = name
    return funcs


def _detect_vars_in_line(line_text, language):
    """Detect variable assignments in a single line of code."""
    vars_found = {}
    stripped = line_text.strip()

    # Skip comments
    if stripped.startswith('#') or stripped.startswith('//') or stripped.startswith('/*'):
        return {}

    # Language-specific assignment patterns
    patterns = []

    if language == 'Python':
        patterns = [
            r'(\w+)\s*=\s*(.+?)(?:\s*#|$)',           # x = value
            r'for\s+(\w+)\s+in\s+(.+):',               # for x in range
        ]
    elif language in ('JavaScript',):
        patterns = [
            r'(?:let|const|var)\s+(\w+)\s*=\s*(.+?)(?:\s*;|$)',  # let x = val
            r'(\w+)\s*=\s*(.+?)(?:\s*;|$)',                        # x = val
        ]
    elif language in ('Java',):
        patterns = [
            r'(?:int|double|float|String|boolean|long|char|short|byte)\s+(\w+)\s*=\s*(.+?)(?:\s*;|$)',
            r'(\w+)\s*=\s*(.+?)(?:\s*;|$)',
        ]
    elif language in ('C', 'C++'):
        patterns = [
            r'(?:int|double|float|char|long|short|bool|auto|string|unsigned)\s+(\w+)\s*=\s*(.+?)(?:\s*;|$)',
            r'(\w+)\s*=\s*(.+?)(?:\s*;|$)',
        ]
    elif language == 'Go':
        patterns = [
            r'(\w+)\s*:=\s*(.+?)(?:\s*$)',              # x := val
            r'var\s+(\w+)\s+\w+\s*=\s*(.+?)(?:\s*$)',   # var x int = val
        ]
    elif language == 'Rust':
        patterns = [
            r'let\s+(?:mut\s+)?(\w+)\s*(?::\s*\w+)?\s*=\s*(.+?)(?:\s*;|$)',
        ]
    elif language == 'Ruby':
        patterns = [
            r'(\w+)\s*=\s*(.+?)(?:\s*$)',
        ]
    elif language == 'PHP':
        patterns = [
            r'\$(\w+)\s*=\s*(.+?)(?:\s*;|$)',
        ]
    else:
        patterns = [
            r'(\w+)\s*=\s*(.+?)(?:\s*;|$)',
        ]

    for pat in patterns:
        for m in re.finditer(pat, stripped):
            name = m.group(1)
            val = m.group(2).strip().rstrip(';').strip()
            # Skip function definitions, class definitions, imports
            if name in ('def', 'class', 'import', 'from', 'return', 'if', 'else',
                        'elif', 'while', 'for', 'switch', 'case', 'function',
                        'const', 'let', 'var', 'int', 'void', 'float', 'double',
                        'string', 'bool', 'auto'):
                continue
            # Try to evaluate simple literals
            if val.isdigit():
                vars_found[name] = int(val)
            elif val.replace('.', '', 1).isdigit():
                vars_found[name] = float(val)
            elif (val.startswith('"') and val.endswith('"')) or \
                 (val.startswith("'") and val.endswith("'")):
                vars_found[name] = val[1:-1]
            elif val.lower() in ('true', 'True'):
                vars_found[name] = True
            elif val.lower() in ('false', 'False'):
                vars_found[name] = False
            elif val.lower() in ('none', 'null', 'nil', 'None'):
                vars_found[name] = None
            elif val.startswith('[') or val.startswith('{'):
                vars_found[name] = val[:60]
            else:
                vars_found[name] = val[:40]

    return vars_found


def _classify_line(line_text, language):
    """Classify a line of code into an event type."""
    s = line_text.strip().lower()

    if not s or s.startswith('#') or s.startswith('//') or s.startswith('/*') or s.startswith('*'):
        return None  # skip

    # Function definitions
    func_keywords = {
        'Python': 'def ',
        'JavaScript': ('function ', '=>'),
        'Java': None,  # handled by braces
        'C': None,
        'C++': None,
        'Go': 'func ',
        'Rust': 'fn ',
        'Ruby': 'def ',
        'PHP': 'function ',
    }

    fk = func_keywords.get(language, 'def ')
    if fk:
        if isinstance(fk, tuple):
            if any(k in s for k in fk):
                return 'call'
        elif s.startswith(fk) or (fk + ' ') in s:
            return 'call'

    # Return statements
    if s.startswith('return ') or s == 'return' or s.startswith('return;'):
        return 'return'

    # Print/output statements
    print_keywords = ['print(', 'console.log(', 'cout', 'fmt.print', 'println!',
                       'puts ', 'echo ', 'system.out', 'printf(']
    if any(k in s for k in print_keywords):
        return 'line'

    # Conditionals
    if any(s.startswith(k) for k in ['if ', 'if(', 'else ', 'else{', 'elif ',
                                      'else if', '} else']):
        return 'line'

    # Loops
    if any(s.startswith(k) for k in ['for ', 'for(', 'while ', 'while(',
                                      'loop ', 'loop{', '.each ', '.foreach']):
        return 'line'

    # Import/include
    if any(s.startswith(k) for k in ['import ', 'from ', '#include', 'require(',
                                      'use ', 'using ', 'package ']):
        return 'line'

    # General line
    return 'line'


def build_execution_steps(code, language, actual_output, actual_error):
    """
    Build execution steps from code + real output.
    Returns the same schema that executor.py's execute_python_steps returns.
    """
    lines = code.split('\n')
    steps = []
    functions = _detect_functions(code, language)
    accumulated_vars = {}
    current_func = 'main'
    call_stack = [{'function': 'main', 'line': 1}]

    # Determine output lines for progressive display
    output_text = actual_output.strip() if actual_output else ''
    output_lines_list = output_text.split('\n') if output_text else []

    # Track which lines have print statements for progressive output
    print_line_indices = []
    for i, line in enumerate(lines):
        s = line.strip().lower()
        if any(k in s for k in ['print(', 'console.log(', 'cout', 'fmt.print',
                                  'println!', 'puts ', 'echo ', 'system.out',
                                  'printf(']):
            print_line_indices.append(i)

    output_cursor = 0  # tracks which output line to show next

    for i, line in enumerate(lines):
        stripped = line.strip()
        line_num = i + 1

        # Skip empty lines, comments, and pure braces
        if not stripped:
            continue
        if stripped.startswith('#') or stripped.startswith('//'):
            continue
        if stripped.startswith('/*') or stripped.startswith('*'):
            continue
        if stripped in ('{', '}', '};', 'end', '});', ');'):
            continue

        event_type = _classify_line(stripped, language)
        if event_type is None:
            continue

        # Update current function context
        if line_num in functions:
            fn_name = functions[line_num]
            current_func = fn_name
            call_stack.append({'function': fn_name, 'line': line_num})
            event_type = 'call'

        if stripped.startswith('return') and len(call_stack) > 1:
            event_type = 'return'

        # Detect variable assignments
        new_vars = _detect_vars_in_line(stripped, language)
        accumulated_vars.update(new_vars)

        # Build output snapshot — show output progressively
        current_output = []
        if i in print_line_indices and output_cursor < len(output_lines_list):
            output_cursor += 1
        current_output = output_lines_list[:output_cursor]

        # Create step
        step = {
            'event': event_type,
            'line': line_num,
            'current_line': stripped,
            'func_name': current_func,
            'local_vars': dict(accumulated_vars),
            'global_vars': {},
            'stack': [dict(s) for s in call_stack],
            'output': current_output,
            'final_output': None,
            'arg': None,
        }

        steps.append(step)

        # Pop stack on return
        if event_type == 'return' and len(call_stack) > 1:
            call_stack.pop()
            current_func = call_stack[-1]['function'] if call_stack else 'main'

    # If no steps were generated, create at least one
    if not steps:
        steps.append({
            'event': 'line',
            'line': 1,
            'current_line': lines[0] if lines else '',
            'func_name': 'main',
            'local_vars': {},
            'global_vars': {},
            'stack': [{'function': 'main', 'line': 1}],
            'output': [],
            'final_output': output_text or actual_error or '',
            'arg': None,
        })

    # Set final output on last step
    if steps:
        final = output_text if output_text else actual_error or ''
        steps[-1]['final_output'] = final

    # Handle error — add error step
    if actual_error and not actual_output:
        steps.append({
            'event': 'error',
            'line': 0,
            'current_line': '',
            'func_name': current_func,
            'local_vars': dict(accumulated_vars),
            'global_vars': {},
            'stack': list(call_stack),
            'output': [],
            'final_output': actual_error,
            'arg': actual_error,
        })

    return {
        'mode': 'real',
        'language': language,
        'steps': steps,
        'total_steps': len(steps),
        'final_output': output_text if output_text else actual_error or '',
        'error': None if not actual_error or actual_output else actual_error,
    }
