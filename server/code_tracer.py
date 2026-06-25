import subprocess
import tempfile
import os
import re
import json

def trace_javascript(code):
    """Inject array tracking into JavaScript and run it"""
    try:
        # Inject tracer
        tracer = '''
const __trace = [];
const __arrays = {};
const __output = [];

// Override console.log
const __origLog = console.log;
console.log = (...args) => {
    const val = args.join(' ');
    __output.push(val);
    __origLog(...args);
};

// Helper to snapshot arrays
function __snapshot(name, arr, indices=[]) {
    if (Array.isArray(arr) && arr.every(x => typeof x === 'number')) {
        __trace.push({
            type: 'array',
            name: name,
            state: [...arr],
            active_indices: indices
        });
    }
}

function __step(desc, line, vars={}) {
    __trace.push({type: 'step', desc, line, vars});
}

'''
        # Inject array snapshots after assignments
        lines = code.split('\n')
        instrumented = [tracer]
        
        for i, line in enumerate(lines):
            instrumented.append(line)
            stripped = line.strip()
            
            # Track array swaps
            if re.search(r'\[(\w+)\].*=.*\[(\w+)\]', stripped):
                match = re.search(r'(\w+)\[', stripped)
                if match:
                    arr_name = match.group(1)
                    instrumented.append(f'try {{ if(Array.isArray({arr_name})) __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')
            
            # Track variable assignments with arrays
            if re.search(r'(?:let|const|var)\s+(\w+)\s*=\s*\[', stripped):
                match = re.search(r'(?:let|const|var)\s+(\w+)', stripped)
                if match:
                    arr_name = match.group(1)
                    instrumented.append(f'try {{ __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

        instrumented.append('''
process.stderr.write(JSON.stringify({trace: __trace, output: __output}));
''')

        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
            f.write('\n'.join(instrumented))
            temp_path = f.name

        result = subprocess.run(['node', temp_path], capture_output=True, text=True, timeout=10)
        os.unlink(temp_path)

        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        trace_data = {}
        if stderr:
            try:
                trace_data = json.loads(stderr)
            except:
                pass

        return stdout, trace_data.get('trace', [])
    except Exception as e:
        print(f"JS trace error: {e}")
        return "", []


def trace_cpp(code):
    """Inject array tracking into C++ and run it"""
    try:
        # Add helper at the top
        helper = '''
#include<iostream>
#include<vector>
#include<string>
using namespace std;

void __printArray(string name, vector<int>& arr, int i=-1, int j=-1) {
    cerr << "ARR:" << name << ":";
    for(int k=0; k<arr.size(); k++) cerr << arr[k] << ",";
    cerr << ":IDX:" << i << "," << j << endl;
}
void __printArray(string name, int arr[], int n, int i=-1, int j=-1) {
    cerr << "ARR:" << name << ":";
    for(int k=0; k<n; k++) cerr << arr[k] << ",";
    cerr << ":IDX:" << i << "," << j << endl;
}
'''
        # Inject after swap operations
        lines = code.split('\n')
        instrumented = []
        
        # Add includes check
        has_include = any('#include' in l for l in lines)
        if has_include:
            # Add helper after first include
            added = False
            for line in lines:
                instrumented.append(line)
                if '#include' in line and not added:
                    instrumented.append(helper)
                    added = True
        else:
            instrumented = [helper] + lines

        # Inject array snapshots after swaps
        final_lines = []
        for i, line in enumerate(instrumented):
            final_lines.append(line)
            stripped = line.strip()
            if 'swap(' in stripped or ('=' in stripped and '[' in stripped and '++' not in stripped):
                # Try to detect array name
                match = re.search(r'(\w+)\[', stripped)
                if match:
                    arr_name = match.group(1)
                    final_lines.append(f'__printArray("{arr_name}", {arr_name}, sizeof({arr_name})/sizeof({arr_name}[0]));')

        with tempfile.NamedTemporaryFile(mode='w', suffix='.cpp', delete=False) as f:
            f.write('\n'.join(final_lines))
            temp_path = f.name

        exe_path = temp_path.replace('.cpp', '.exe')
        compile_result = subprocess.run(['g++', temp_path, '-o', exe_path], capture_output=True, text=True, timeout=10)
        
        if compile_result.returncode != 0:
            os.unlink(temp_path)
            return "", []

        run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
        os.unlink(temp_path)
        os.unlink(exe_path)

        stdout = run_result.stdout.strip()
        stderr = run_result.stderr.strip()

        # Parse array snapshots from stderr
        trace = []
        for line in stderr.split('\n'):
            if line.startswith('ARR:'):
                parts = line.split(':')
                if len(parts) >= 3:
                    arr_name = parts[1]
                    vals_str = parts[2]
                    vals = [int(x) for x in vals_str.split(',') if x.strip().lstrip('-').isdigit()]
                    idx_str = parts[4] if len(parts) > 4 else ''
                    indices = [int(x) for x in idx_str.split(',') if x.strip().lstrip('-').isdigit() and int(x) >= 0]
                    trace.append({'type': 'array', 'name': arr_name, 'state': vals, 'active_indices': indices})

        return stdout, trace
    except Exception as e:
        print(f"C++ trace error: {e}")
        return "", []


def trace_java(code):
    """Run Java and capture output"""
    try:
        class_match = re.search(r'(?:public\s+)?class\s+(\w+)', code)
        class_name = class_match.group(1) if class_match else 'Main'
        
        proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
        with open(proper_path, 'w') as f:
            f.write(code)

        compile_result = subprocess.run(['javac', proper_path], capture_output=True, text=True, timeout=15)
        if compile_result.returncode != 0:
            os.unlink(proper_path)
            return "", []

        run_result = subprocess.run(['java', '-cp', tempfile.gettempdir(), class_name], capture_output=True, text=True, timeout=15)
        
        os.unlink(proper_path)
        class_file = os.path.join(tempfile.gettempdir(), f"{class_name}.class")
        if os.path.exists(class_file):
            os.unlink(class_file)

        return run_result.stdout.strip(), []
    except Exception as e:
        print(f"Java trace error: {e}")
        return "", []


def trace_go(code):
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.go', delete=False) as f:
            f.write(code)
            temp_path = f.name
        run_result = subprocess.run(['go', 'run', temp_path], capture_output=True, text=True, timeout=30)
        os.unlink(temp_path)
        return run_result.stdout.strip(), []
    except Exception as e:
        return "", []


def trace_rust(code):
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.rs', delete=False) as f:
            f.write(code)
            temp_path = f.name
        exe_path = temp_path.replace('.rs', '.exe')
        compile_result = subprocess.run(['rustc', temp_path, '-o', exe_path], capture_output=True, text=True, timeout=30)
        if compile_result.returncode == 0:
            run_result = subprocess.run([exe_path], capture_output=True, text=True, timeout=10)
            os.unlink(exe_path)
            os.unlink(temp_path)
            return run_result.stdout.strip(), []
        os.unlink(temp_path)
        return "", []
    except Exception as e:
        return "", []


def trace_ruby(code):
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.rb', delete=False) as f:
            f.write(code)
            temp_path = f.name
        run_result = subprocess.run(['ruby', temp_path], capture_output=True, text=True, timeout=10)
        os.unlink(temp_path)
        return run_result.stdout.strip(), []
    except Exception as e:
        return "", []


def trace_php(code):
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.php', delete=False) as f:
            f.write(code)
            temp_path = f.name
        run_result = subprocess.run(['php', temp_path], capture_output=True, text=True, timeout=10)
        os.unlink(temp_path)
        return run_result.stdout.strip(), []
    except Exception as e:
        return "", []


def _detect_algo_info(code, language):
    """Detect algorithm type, title, and complexity from code"""
    code_lower = code.lower()

    if any(x in code_lower for x in ['fibonacci', 'fib(', 'fib ']):
        return 'recursion', 'Fibonacci', 'O(2^n)', 'O(n)'
    if any(x in code_lower for x in ['factorial', 'fact(']):
        return 'recursion', 'Factorial', 'O(n)', 'O(n)'
    if 'hanoi' in code_lower:
        return 'recursion', 'Tower of Hanoi', 'O(2^n)', 'O(n)'
    if any(x in code_lower for x in ['merge_sort', 'mergesort', 'merge sort']):
        return 'sorting', 'Merge Sort', 'O(n log n)', 'O(n)'
    if any(x in code_lower for x in ['quick_sort', 'quicksort', 'quick sort']):
        return 'sorting', 'Quick Sort', 'O(n log n)', 'O(log n)'
    if 'bubble' in code_lower:
        return 'sorting', 'Bubble Sort', 'O(n²)', 'O(1)'
    if 'selection' in code_lower and 'sort' in code_lower:
        return 'sorting', 'Selection Sort', 'O(n²)', 'O(1)'
    if 'insertion' in code_lower and 'sort' in code_lower:
        return 'sorting', 'Insertion Sort', 'O(n²)', 'O(1)'
    if any(x in code_lower for x in ['binary_search', 'binarysearch', 'binary search']):
        return 'searching', 'Binary Search', 'O(log n)', 'O(1)'
    if any(x in code_lower for x in ['bfs', 'breadth']):
        return 'graph', 'BFS', 'O(V+E)', 'O(V)'
    if any(x in code_lower for x in ['dfs', 'depth_first']):
        return 'graph', 'DFS', 'O(V+E)', 'O(V)'
    if any(x in code_lower for x in ['inorder', 'preorder', 'postorder', 'bst']):
        return 'tree', 'Tree Traversal', 'O(n)', 'O(h)'
    if '.sort' in code_lower or 'sorted(' in code_lower:
        return 'sorting', 'Sort', 'O(n log n)', 'O(n)'

    # Check for recursion (function calls itself)
    func_names = re.findall(r'(?:def|function|fn|func)\s+(\w+)', code)
    for fname in func_names:
        if re.search(rf'{fname}\s*\(', code[code.find(fname) + len(fname):]):
            return 'recursion', f'Recursive {fname}', 'O(?)', 'O(n)'

    return 'linear', f'{language} Algorithm', 'O(n)', 'O(1)'


def _detect_operation(line_text):
    """Detect operation type from a line of code"""
    s = line_text.strip().lower()
    if any(k in s for k in ['swap', 'temp']):
        return 'SWAP'
    if any(k in s for k in ['if ', 'else', '>', '<', '==', '!=', '>=', '<=']):
        return 'COMPARE'
    if any(k in s for k in ['for ', 'while ', 'foreach', '.each', '.map', '.filter']):
        return 'VISIT'
    if any(k in s for k in ['return', 'yield']):
        return 'RETURN'
    if any(k in s for k in ['split', 'slice', 'mid', 'half', 'partition']):
        return 'SPLIT'
    if any(k in s for k in ['merge', 'concat', 'join', 'append', 'push', 'extend']):
        return 'MERGE'
    if any(k in s for k in ['print', 'console.log', 'cout', 'fmt.print', 'puts', 'echo', 'system.out']):
        return 'CALL'
    return 'VISIT'


def build_visualization_from_trace(code, language, real_output, trace):
    """Build visualization from trace data with proper tree structure"""
    lines = code.split('\n')
    steps = []
    nodes = []

    algo_type, title, time_c, space_c = _detect_algo_info(code, language)

    # Build from array trace (sorting algorithms etc.)
    if trace:
        array_steps = [t for t in trace if t.get('type') == 'array']
        if array_steps:
            # Root node
            nodes.append({
                'id': 'n1', 'value': 'start', 'label': title,
                'left': 'n2' if len(array_steps) > 1 else None,
                'right': None, 'parent': None, 'depth': 0, 'x_offset': 0
            })
            for i, t in enumerate(array_steps[:18]):
                node_id = f"n{i+2}"
                arr = t.get('state', [])
                indices = t.get('active_indices', [])
                name = t.get('name', 'arr')
                depth = min(i // 2 + 1, 4)

                nodes.append({
                    'id': node_id,
                    'value': str(arr[:3])[1:-1] if len(arr) > 3 else str(arr),
                    'label': f"step {i+1}",
                    'left': f"n{i+3}" if i + 1 < len(array_steps) and i % 2 == 0 else None,
                    'right': None,
                    'parent': f"n{max(1, (i+2)//2)}" if i > 0 else 'n1',
                    'depth': depth,
                    'x_offset': 0
                })

                steps.append({
                    'id': f's{i+1}', 'node_id': node_id,
                    'operation': 'SWAP' if indices else 'COMPARE',
                    'description': f"Array: {arr}",
                    'code_line': 1,
                    'visited_nodes': [f"n{j+1}" for j in range(i+1)],
                    'output': [real_output] if i == len(array_steps) - 1 else [],
                    'highlighted_nodes': [node_id],
                    'edge_from': f"n{max(1, (i+2)//2)}" if i > 0 else 'n1',
                    'edge_to': node_id,
                    'array_state': arr,
                    'active_indices': indices,
                    'array_name': name
                })
        # If we got steps from array trace, return early
        if steps:
            return {
                'algo_type': algo_type, 'title': title,
                'description': f'Step-by-step {language} execution',
                'time_complexity': time_c, 'space_complexity': space_c,
                'tree_nodes': nodes[:20], 'steps': steps[:20],
                'final_output': [real_output] if real_output else [],
                'total_steps': len(steps[:20])
            }

    # Build from code lines — create a meaningful tree
    significant_lines = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith('//') and not stripped.startswith('#') and not stripped.startswith('/*'):
            significant_lines.append((i + 1, stripped))

    if not significant_lines:
        significant_lines = [(1, code.split('\n')[0] if code else 'empty')]

    # Limit to 15 lines
    significant_lines = significant_lines[:15]

    # Build tree: root node is the entry point, children are code blocks
    root_id = 'n1'
    root_line = significant_lines[0]
    nodes.append({
        'id': root_id, 'value': 'main', 'label': root_line[1][:15],
        'left': 'n2' if len(significant_lines) > 1 else None,
        'right': 'n3' if len(significant_lines) > 2 else None,
        'parent': None, 'depth': 0, 'x_offset': 0
    })

    for idx, (line_num, line_text) in enumerate(significant_lines[1:], start=2):
        node_id = f"n{idx}"
        # Calculate depth based on indentation
        original_line = lines[line_num - 1] if line_num <= len(lines) else ''
        indent = len(original_line) - len(original_line.lstrip())
        depth = min(indent // 4 + 1, 4) if indent > 0 else 1

        # Find parent: closest previous node with lower depth
        parent_id = root_id
        for prev_idx in range(idx - 1, 0, -1):
            prev_node = nodes[prev_idx - 1] if prev_idx <= len(nodes) else None
            if prev_node and prev_node.get('depth', 0) < depth:
                parent_id = prev_node['id']
                break

        nodes.append({
            'id': node_id, 'value': str(line_num), 'label': line_text[:15],
            'left': f"n{idx+1}" if idx < len(significant_lines) else None,
            'right': None,
            'parent': parent_id, 'depth': depth, 'x_offset': 0
        })

    # Build steps from significant lines
    for idx, (line_num, line_text) in enumerate(significant_lines):
        node_id = f"n{idx+1}"
        operation = _detect_operation(line_text)
        if idx == 0:
            operation = 'CALL'
        elif idx == len(significant_lines) - 1:
            operation = 'RETURN'

        steps.append({
            'id': f's{idx+1}', 'node_id': node_id,
            'operation': operation,
            'description': line_text[:50],
            'code_line': line_num,
            'visited_nodes': [f"n{j+1}" for j in range(idx)],
            'output': [real_output] if idx == len(significant_lines) - 1 and real_output else [],
            'highlighted_nodes': [node_id],
            'edge_from': nodes[idx].get('parent') if idx < len(nodes) else None,
            'edge_to': node_id,
            'array_state': None,
            'active_indices': [],
            'array_name': None
        })

    return {
        'algo_type': algo_type, 'title': title,
        'description': f'Step-by-step {language} execution',
        'time_complexity': time_c, 'space_complexity': space_c,
        'tree_nodes': nodes[:20], 'steps': steps[:20],
        'final_output': [real_output] if real_output else [],
        'total_steps': len(steps[:20])
    }