import sys
import io
import traceback
import copy
import json

def execute_python_steps(code):
    steps = []
    output_lines = []
    call_stack = []
    
    # Variables to track
    global_vars_history = {}
    local_vars_history = {}

    def safe_serialize(val):
        try:
            if isinstance(val, (int, float, str, bool, type(None))):
                return val
            elif isinstance(val, (list, tuple)):
                return [safe_serialize(v) for v in val[:20]]
            elif isinstance(val, dict):
                return {str(k): safe_serialize(v) for k, v in list(val.items())[:20]}
            elif isinstance(val, set):
                return list(val)[:20]
            else:
                return str(val)
        except:
            return str(val)

    def trace_calls(frame, event, arg):
        if event not in ('call', 'line', 'return', 'exception'):
            return trace_calls

        filename = frame.f_code.co_filename
        if filename != '<string>':
            return trace_calls

        lineno = frame.f_lineno
        func_name = frame.f_code.co_name

        # Get local variables
        local_vars = {}
        for k, v in frame.f_locals.items():
            if not k.startswith('__'):
                local_vars[k] = safe_serialize(v)

        # Get global variables
        global_vars = {}
        for k, v in frame.f_globals.items():
            if not k.startswith('__') and not callable(v):
                global_vars[k] = safe_serialize(v)

        # Get current line
        try:
            lines = code.split('\n')
            current_line = lines[lineno - 1].strip() if lineno <= len(lines) else ''
        except:
            current_line = ''

        # Build stack
        stack = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == '<string>':
                stack.append({
                    'function': f.f_code.co_name,
                    'line': f.f_lineno
                })
            f = f.f_back
        stack.reverse()

        step = {
            'event': event,
            'line': lineno,
            'current_line': current_line,
            'func_name': func_name,
            'local_vars': local_vars,
            'global_vars': global_vars,
            'stack': stack,
            'output': list(output_lines),
            'arg': str(arg) if arg is not None and event == 'exception' else None
        }

        steps.append(step)
        return trace_calls

    # Capture stdout
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        # Compile and run with trace
        compiled = compile(code, '<string>', 'exec')
        sys.settrace(trace_calls)
        
        namespace = {}
        exec(compiled, namespace)
        
    except Exception as e:
        steps.append({
            'event': 'error',
            'line': 0,
            'current_line': '',
            'func_name': '',
            'local_vars': {},
            'global_vars': {},
            'stack': [],
            'output': list(output_lines),
            'arg': traceback.format_exc()
        })
    finally:
        sys.settrace(None)
        output = sys.stdout.getvalue()
        sys.stdout = old_stdout

    # Add output to each step
    stdout_lines = output.split('\n') if output else []
    captured_output = []
    
    for step in steps:
        if step['event'] == 'line':
            # Check if new output was printed
            pass
    
    # Final output
    if steps:
        steps[-1]['final_output'] = output

    return {
        'steps': steps,
        'total_steps': len(steps),
        'final_output': output,
        'error': None
    }