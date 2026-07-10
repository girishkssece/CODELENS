import subprocess
import tempfile
import os
import re
import json

def trace_javascript(code):
    """Inject comprehensive array tracking into JavaScript and run it."""
    try:
        tracer = '''
const __trace = [];
const __output = [];
let __stepCount = 0;
let __lastSnap = {};

const __origLog = console.log;
console.log = (...args) => {
    const val = args.join(' ');
    __output.push(val);
    __origLog(...args);
};

function __snapshot(name, arr, indices=[]) {
    if (!Array.isArray(arr)) return;
    if (arr.length === 0 || arr.length > 200) return;
    if (__stepCount > 300) return;
    // Skip sparse/empty arrays (new Array(n) creates holes)
    const defined = arr.filter(x => x !== undefined && x !== null);
    if (defined.length === 0) return;
    const nums = defined.filter(x => typeof x === 'number');
    if (nums.length === 0) return;
    // Skip if identical to last snapshot of same array
    const key = name + ':' + arr.join(',');
    if (__lastSnap && __lastSnap[name] === key) return;
    if (!__lastSnap) __lastSnap = {};
    __lastSnap[name] = key;
    __trace.push({
        type: 'array',
        name: name,
        state: [...arr],
        active_indices: indices
    });
    __stepCount++;
}
'''
        lines = code.split('\n')
        instrumented = [tracer]

        # Collect ALL array variable names
        array_vars = set()
        for line in lines:
            stripped = line.strip()
            # let/const/var declarations with arrays
            m = re.search(r'(?:let|const|var)\s+(\w+)\s*=\s*\[', stripped)
            if m:
                array_vars.add(m.group(1))
            # assignments
            m = re.search(r'^(\w+)\s*=\s*\[', stripped)
            if m:
                array_vars.add(m.group(1))
            # common array parameter names
            for name in re.findall(r'\b(arr|array|nums|list|data|items|result|left|right|sorted|merged|output)\b', stripped):
                array_vars.add(name)
            # function parameters that are likely arrays
            m = re.search(r'function\s+\w+\s*\(([^)]+)\)', stripped)
            if m:
                params = [p.strip() for p in m.group(1).split(',')]
                for p in params:
                    if any(name in p.lower() for name in ['arr', 'list', 'nums', 'data', 'items']):
                        array_vars.add(p)

        for i, line in enumerate(lines):
            instrumented.append(line)
            stripped = line.strip()

            # After array declarations
            m = re.search(r'(?:let|const|var)\s+(\w+)\s*=\s*\[', stripped)
            if m:
                arr_name = m.group(1)
                instrumented.append(f'try {{ __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

            # After array index assignment: arr[i] = ...
            elif re.search(r'(\w+)\[.+\]\s*=\s*[^=]', stripped):
                m = re.search(r'(\w+)\[', stripped)
                if m:
                    arr_name = m.group(1)
                    instrumented.append(f'try {{ if(Array.isArray({arr_name})) __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

            # After concat/spread assignments: result = left.concat(right) or [...left, ...right]
            elif re.search(r'(?:let|const|var)\s+(\w+)\s*=.*(?:concat|\.\.\.)', stripped):
                m = re.search(r'(?:let|const|var)\s+(\w+)', stripped)
                if m:
                    arr_name = m.group(1)
                    instrumented.append(f'try {{ if(Array.isArray({arr_name})) __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

            # After push operations
            elif re.search(r'(\w+)\.push\(', stripped):
                m = re.search(r'(\w+)\.push', stripped)
                if m:
                    arr_name = m.group(1)
                    instrumented.append(f'try {{ if(Array.isArray({arr_name})) __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

            # After slice operations
            elif re.search(r'(?:let|const|var)\s+(\w+)\s*=\s*\w+\.slice\(', stripped):
                m = re.search(r'(?:let|const|var)\s+(\w+)', stripped)
                if m:
                    arr_name = m.group(1)
                    instrumented.append(f'try {{ if(Array.isArray({arr_name})) __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

            # After return with array
            elif stripped.startswith('return ') and any(v in stripped for v in array_vars):
                for arr_name in array_vars:
                    instrumented.append(f'try {{ if(typeof {arr_name} !== "undefined" && Array.isArray({arr_name})) __snapshot("{arr_name}", {arr_name}); }} catch(e) {{}}')

        # Final snapshots
        final_snaps = '\n'.join([
            f'try {{ if(typeof {v} !== "undefined" && Array.isArray({v})) __snapshot("{v}", {v}); }} catch(e) {{}}'
            for v in array_vars
        ])
        instrumented.append(final_snaps)
        instrumented.append('process.stderr.write(JSON.stringify({trace: __trace, output: __output}));')

        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
            f.write('\n'.join(instrumented))
            temp_path = f.name

        result = subprocess.run(['node', temp_path], capture_output=True, text=True, timeout=15)
        os.unlink(temp_path)

        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        trace_data = {}
        if stderr:
            try:
                trace_data = json.loads(stderr)
            except:
                # Try to find JSON in stderr
                try:
                    start = stderr.find('{')
                    end = stderr.rfind('}') + 1
                    if start != -1 and end > start:
                        trace_data = json.loads(stderr[start:end])
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
    """Inject array tracking AND variable tracking into Java and run it.

    For sorting algorithms this captures array mutations.
    For searching algorithms (binary search, etc.) this captures pointer
    variables (low, mid, high, i, j, etc.) so the frontend can render
    interactive array visualizations with pointer arrows.
    """
    try:
        # Detect array variables in the code
        array_vars = set()
        lines = code.split('\n')

        for line in lines:
            stripped = line.strip()
            # int[] arr = {1,2,3}; or int[] arr = new int[10];
            m = re.search(r'(?:int|double|float|long)\s*\[\s*\]\s+(\w+)', stripped)
            if m:
                array_vars.add(m.group(1))
            # Arrays passed to methods (common names)
            for name in re.findall(r'\b(arr|array|nums|list|data|items|numbers)\b', stripped):
                array_vars.add(name)

        # Detect pointer / search variables used in the code
        pointer_var_names = {
            'i', 'j', 'k', 'l', 'r', 'left', 'right',
            'low', 'high', 'mid', 'start', 'end',
            'ptr', 'index', 'pos', 'pivot', 'head', 'tail',
            'front', 'back', 'p', 'q', 'lo', 'hi', 'target',
            'key', 'result', 'temp', 'n', 'size', 'len',
        }
        # Find which pointer vars are actually declared/used as ints
        used_pointer_vars = set()
        for line in lines:
            stripped = line.strip()
            # int low = 0, high = arr.length - 1;
            int_decl = re.findall(r'\bint\s+([^;]+);', stripped)
            for decl_group in int_decl:
                for part in decl_group.split(','):
                    var_m = re.match(r'\s*(\w+)\s*=', part.strip())
                    if var_m and var_m.group(1) in pointer_var_names:
                        used_pointer_vars.add(var_m.group(1))
                    # Also catch: int mid = ...  (single declaration)
                    var_m2 = re.match(r'\s*(\w+)\s*$', part.strip())
                    if var_m2 and var_m2.group(1) in pointer_var_names:
                        used_pointer_vars.add(var_m2.group(1))
            # Assignment without declaration: mid = (low + high) / 2;
            assign_m = re.match(r'\s*(\w+)\s*=\s*[^=]', stripped)
            if assign_m and assign_m.group(1) in pointer_var_names:
                used_pointer_vars.add(assign_m.group(1))

        # Determine first array var for snapshots
        first_arr_var = next(iter(array_vars), None)

        # Build VARS: print for a specific set of in-scope variables
        def _build_vars_print(in_scope_vars, arr_var):
            """Generate a Java statement that prints VARS: to stderr.
            Only references variables that are confirmed in-scope."""
            parts = []
            scoped = sorted(in_scope_vars)
            if scoped:
                var_exprs = [f'"{v}=" + {v}' for v in scoped]
                concat = ' + "," + '.join(var_exprs)
                parts.append(f'System.err.println("VARS:" + {concat});')
            if arr_var:
                parts.append(f'__printArr("{arr_var}", {arr_var});')
            return ' '.join(parts) if parts else None

        # Inject helper method to print array state
        helper = '''
    static void __printArr(String name, int[] a) {
        System.err.print("ARR:" + name + ":");
        for(int k=0; k<a.length; k++) { System.err.print(a[k]); if(k<a.length-1) System.err.print(","); }
        System.err.println();
    }
'''
        # Find the class and inject helper + array tracking + variable tracking
        instrumented_lines = []
        class_found = False
        helper_injected = False
        # Scope tracking: brace depth + vars declared at each depth
        brace_depth = 0
        # Map: var_name -> depth where it was declared
        var_scope = {}

        for i, line in enumerate(lines):
            instrumented_lines.append(line)
            stripped = line.strip()

            # Track when we enter the class body
            if not class_found and re.search(r'(?:public\s+)?class\s+\w+', stripped):
                class_found = True

            if class_found and '{' in stripped and not helper_injected:
                # Inject helper right after first { in class
                instrumented_lines.append(helper)
                helper_injected = True

            # Track brace depth for scope management
            open_braces = stripped.count('{')
            close_braces = stripped.count('}')

            # Track variable declarations BEFORE updating depth for close braces
            # so vars declared on this line are at the current depth
            int_decl = re.findall(r'\bint\s+([^;{]+);', stripped)
            for decl_group in int_decl:
                # Current depth for this declaration
                decl_depth = brace_depth + (1 if '{' in stripped.split('int')[0] else 0)
                for part in decl_group.split(','):
                    var_m = re.match(r'\s*(\w+)\s*=', part.strip())
                    if var_m and var_m.group(1) in used_pointer_vars:
                        var_scope[var_m.group(1)] = decl_depth
                    var_m2 = re.match(r'\s*(\w+)\s*$', part.strip())
                    if var_m2 and var_m2.group(1) in used_pointer_vars:
                        var_scope[var_m2.group(1)] = decl_depth

            # Update brace depth
            brace_depth += open_braces - close_braces

            # Remove out-of-scope variables
            out_of_scope = [v for v, d in var_scope.items() if d > brace_depth]
            for v in out_of_scope:
                del var_scope[v]

            # Current in-scope pointer variables
            in_scope_vars = set(var_scope.keys())

            # Check if the NEXT line starts with 'else' — if so, don't inject here
            next_line = lines[i + 1].strip() if i + 1 < len(lines) else ''
            next_is_else = next_line.startswith('else')

            if next_is_else:
                continue  # Skip injection — would break the if/else chain

            # After array swaps: temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
            if re.search(r'(\w+)\[.+\]\s*=', stripped) and 'new ' not in stripped and '//' not in stripped:
                match = re.search(r'(\w+)\[', stripped)
                if match and match.group(1) in array_vars:
                    arr_name = match.group(1)
                    instrumented_lines.append(f'        try {{ __printArr("{arr_name}", {arr_name}); }} catch(Exception e) {{}}')

            # After Arrays.sort calls
            if 'Arrays.sort(' in stripped:
                for av in array_vars:
                    if av in stripped:
                        instrumented_lines.append(f'        try {{ __printArr("{av}", {av}); }} catch(Exception e) {{}}')

            # After array initialization: int[] arr = {1,2,3};
            if re.search(r'(?:int|double|float|long)\s*\[\s*\]\s+(\w+)\s*=\s*\{', stripped):
                match = re.search(r'(?:int|double|float|long)\s*\[\s*\]\s+(\w+)', stripped)
                if match:
                    arr_name = match.group(1)
                    instrumented_lines.append(f'        try {{ __printArr("{arr_name}", {arr_name}); }} catch(Exception e) {{}}')

            # ── NEW: Track pointer variables for search algorithms ──
            if used_pointer_vars and in_scope_vars:
                should_inject_vars = False
                # After comparisons involving array access: if(arr[mid] == target)
                if re.search(r'if\s*\(', stripped) and re.search(r'\w+\[', stripped):
                    should_inject_vars = True
                # After while/for loop headers
                elif re.match(r'\s*while\s*\(', stripped) or re.match(r'\s*for\s*\(', stripped):
                    should_inject_vars = True
                # After assignments to pointer vars: low = mid + 1; mid = (low+high)/2;
                elif re.match(r'\s*(?:int\s+)?(\w+)\s*=\s*[^=]', stripped):
                    am = re.match(r'\s*(?:int\s+)?(\w+)\s*=', stripped)
                    if am and am.group(1) in used_pointer_vars:
                        should_inject_vars = True
                # After return statements (capture final state)
                elif stripped.startswith('return '):
                    should_inject_vars = True

                if should_inject_vars:
                    vars_stmt = _build_vars_print(in_scope_vars, first_arr_var)
                    if vars_stmt:
                        instrumented_lines.append(f'        try {{ {vars_stmt} }} catch(Exception e) {{}}')

        instrumented_code = '\n'.join(instrumented_lines)

        # Add java.util.Arrays import if not present
        if 'import java.util.Arrays' not in instrumented_code:
            instrumented_code = 'import java.util.Arrays;\n' + instrumented_code

        class_match = re.search(r'(?:public\s+)?class\s+(\w+)', instrumented_code)
        class_name = class_match.group(1) if class_match else 'Main'

        proper_path = os.path.join(tempfile.gettempdir(), f"{class_name}.java")
        with open(proper_path, 'w') as f:
            f.write(instrumented_code)

        compile_result = subprocess.run(['javac', proper_path], capture_output=True, text=True, timeout=15)
        if compile_result.returncode != 0:
            # Compilation failed with instrumentation — try running original code
            print(f"Java instrumented compilation failed: {compile_result.stderr[:200]}")
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

        stdout = run_result.stdout.strip()
        stderr = run_result.stderr.strip()

        # Parse array snapshots AND variable snapshots from stderr
        trace = []
        last_vars = {}
        if stderr:
            for line in stderr.split('\n'):
                if line.startswith('ARR:'):
                    parts = line.split(':')
                    if len(parts) >= 3:
                        arr_name = parts[1]
                        vals_str = parts[2]
                        vals = [int(x) for x in vals_str.split(',') if x.strip().lstrip('-').isdigit()]
                        if vals:
                            trace.append({
                                'type': 'array',
                                'name': arr_name,
                                'state': vals,
                                'active_indices': [],
                                'vars': dict(last_vars),
                            })
                elif line.startswith('VARS:'):
                    # Parse VARS:low=0,high=6,mid=3
                    vars_str = line[5:]
                    current_vars = {}
                    for pair in vars_str.split(','):
                        if '=' in pair:
                            k, v = pair.split('=', 1)
                            k = k.strip()
                            v = v.strip()
                            try:
                                current_vars[k] = int(v)
                            except ValueError:
                                current_vars[k] = v
                    last_vars = current_vars
                    # If we haven't seen a matching ARR line yet but have
                    # vars, attach to previous trace entry or create one
                    if trace and trace[-1].get('type') == 'array':
                        trace[-1]['vars'] = dict(current_vars)

        return stdout, trace
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
    """Build visualization from trace data — outputs AlgoVisualizer-compatible format.

    Handles:
    - Sorting algorithms → array mutations with swap highlights
    - Searching algorithms → static array with pointer arrows (low/mid/high)
    - General code → simple variable-tracking visualization
    """
    lines = code.split('\n')
    steps = []

    algo_type, title, time_c, space_c = _detect_algo_info(code, language)

    # ── Pointer variable names used for array visualization ──
    SEARCH_POINTER_NAMES = frozenset(
        'i j k l r left right low high mid start end '
        'ptr index pos pivot lo hi'.split()
    )

    # Build from array trace (sorting / searching algorithms)
    if trace:
        array_steps = [t for t in trace if t.get('type') == 'array']

        if array_steps:
            # ── Check if this is a SEARCH algorithm ──
            # Search: array never changes, but pointer vars do
            is_search = algo_type == 'searching'
            if not is_search:
                # Heuristic: if all array snapshots are identical, it's a search
                first_state = array_steps[0].get('state', [])
                all_same = all(t.get('state') == first_state for t in array_steps)
                has_vars = any(t.get('vars') for t in array_steps)
                if all_same and has_vars and len(array_steps) > 1:
                    is_search = True

            if is_search:
                # ── Build search-specific visualization ──
                base_arr = array_steps[0].get('state', [])
                arr_name = array_steps[0].get('name', 'arr')

                # Deduplicate consecutive identical var states
                deduped = []
                prev_vars = None
                for t in array_steps:
                    cur_vars = t.get('vars', {})
                    if cur_vars != prev_vars:
                        deduped.append(t)
                        prev_vars = dict(cur_vars)
                if not deduped:
                    deduped = array_steps[:1]

                for i, t in enumerate(deduped[:60]):
                    v = t.get('vars', {})
                    arr = t.get('state', base_arr)

                    # Build ALL pointers
                    pointers = []
                    for pname in sorted(SEARCH_POINTER_NAMES):
                        if pname in v:
                            val = v[pname]
                            if isinstance(val, int) and 0 <= val < len(arr):
                                pointers.append({'name': pname, 'index': val})

                    # Sort pointers: low first, mid second, high third
                    order = {'low': 0, 'lo': 0, 'left': 0, 'l': 0, 'start': 0,
                             'mid': 1, 'middle': 1,
                             'high': 2, 'hi': 2, 'right': 2, 'r': 2, 'end': 2}
                    pointers.sort(key=lambda p: order.get(p['name'], 3))

                    # Get key values
                    low_val = v.get('low', v.get('lo', v.get('left', v.get('l', v.get('start', None)))))
                    high_val = v.get('high', v.get('hi', v.get('right', v.get('r', v.get('end', None)))))
                    mid_val = v.get('mid', v.get('middle', None))
                    target_val = v.get('target', v.get('key', v.get('x', v.get('val', '?'))))

                    # Build highlights
                    highlights = []
                    if isinstance(mid_val, int) and 0 <= mid_val < len(arr):
                        highlights.append({'index': mid_val, 'type': 'compare'})

                    # Eliminated indices (outside search window)
                    sorted_indices = []
                    if isinstance(low_val, int) and isinstance(high_val, int):
                        for si in range(len(arr)):
                            if si < low_val or si > high_val:
                                sorted_indices.append(si)

                    # Build rich description
                    if i == 0:
                        desc = f"Start: search for {target_val} in {arr_name}[0..{len(arr)-1}]"
                        op = 'ASSIGN'
                    elif isinstance(mid_val, int) and 0 <= mid_val < len(arr):
                        arr_at_mid = arr[mid_val]
                        if isinstance(low_val, int) and isinstance(high_val, int):
                            desc_mid = f"mid=({low_val}+{high_val})//2={mid_val}"
                        else:
                            desc_mid = f"mid={mid_val}"

                        if arr_at_mid == target_val:
                            desc = f"✅ Found! {arr_name}[{mid_val}]={arr_at_mid} == {target_val}"
                            op = 'VISIT'
                        elif isinstance(arr_at_mid, (int, float)) and isinstance(target_val, (int, float)):
                            if arr_at_mid < target_val:
                                desc = f"{desc_mid} → {arr_name}[{mid_val}]={arr_at_mid} < {target_val} → low={mid_val+1}"
                            else:
                                desc = f"{desc_mid} → {arr_name}[{mid_val}]={arr_at_mid} > {target_val} → high={mid_val-1}"
                            op = 'COMPARE'
                        else:
                            desc = f"Check {arr_name}[{mid_val}]={arr_at_mid} vs {target_val}"
                            op = 'COMPARE'
                    else:
                        parts = []
                        if isinstance(low_val, int): parts.append(f"low={low_val}")
                        if isinstance(high_val, int): parts.append(f"high={high_val}")
                        desc = f"Update: {', '.join(parts)}" if parts else "Update pointers"
                        op = 'ASSIGN'

                    display_vars = {k: val for k, val in v.items()
                                   if not isinstance(val, list) and k not in ('__builtins__',)}

                    out_lines = []
                    if i == len(deduped) - 1 and real_output:
                        out_lines = [l for l in real_output.strip().split('\n') if l]

                    steps.append({
                        'id': i + 1,
                        'code_line': 1,
                        'operation': op,
                        'description': desc,
                        'variables': display_vars,
                        'output_so_far': out_lines,
                        'arrays': {arr_name: list(arr)},
                        'pointers': pointers,
                        'highlights': highlights,
                        'sorted_indices': sorted_indices,
                    })

                if steps:
                    return {
                        'viz_type': 'array',
                        'title': title,
                        'description': f'Step-by-step {language} execution',
                        'time_complexity': time_c,
                        'space_complexity': space_c,
                        'steps': steps,
                        'final_output': [real_output] if real_output else [],
                        'total_steps': len(steps),
                    }

            else:
                # ── Sorting / mutation-based array visualization ──
                prev_arr = None
                for i, t in enumerate(array_steps[:80]):
                    arr = t.get('state', [])
                    indices = t.get('active_indices', [])
                    name = t.get('name', 'arr')
                    v = t.get('vars', {})

                    # Skip duplicate states
                    if arr == prev_arr and not indices and not v:
                        continue

                    # Build highlights
                    highlights = []
                    if indices:
                        for idx in indices:
                            if 0 <= idx < len(arr):
                                highlights.append({'index': idx, 'type': 'swap'})
                    elif prev_arr is not None and len(prev_arr) == len(arr):
                        for idx_c in range(len(arr)):
                            if arr[idx_c] != prev_arr[idx_c]:
                                highlights.append({'index': idx_c, 'type': 'swap'})

                    # Build pointers
                    pointers = []
                    for pname in sorted(SEARCH_POINTER_NAMES):
                        if pname in v:
                            val = v[pname]
                            if isinstance(val, int) and 0 <= val < len(arr):
                                pointers.append({'name': pname, 'index': val})

                    if not highlights:
                        for pt in pointers:
                            highlights.append({'index': pt['index'], 'type': 'compare'})

                    # Rich descriptions
                    pivot_val = v.get('pivot')
                    low_val = v.get('low', v.get('lo', v.get('left', None)))
                    high_val = v.get('high', v.get('hi', v.get('right', None)))

                    if any(h['type'] == 'swap' for h in highlights):
                        changed = [h['index'] for h in highlights if h['type'] == 'swap']
                        if len(changed) >= 2:
                            i1, i2 = changed[0], changed[1]
                            desc = f"Swap arr[{i1}]={arr[i1]} ↔ arr[{i2}]={arr[i2]}"
                        else:
                            desc = f"Array updated: {arr[:8]}{'...' if len(arr) > 8 else ''}"
                        op = 'SWAP'
                    elif pivot_val is not None:
                        desc = f"Pivot={pivot_val}, partitioning [{low_val}..{high_val}]"
                        op = 'COMPARE'
                    elif pointers:
                        ptr_desc = ', '.join(f"{p['name']}={p['index']}" for p in pointers[:3])
                        desc = f"Pointers: {ptr_desc} → arr={arr[:6]}{'...' if len(arr)>6 else ''}"
                        op = 'COMPARE'
                    else:
                        desc = f"Array: {arr[:8]}{'...' if len(arr) > 8 else ''}"
                        op = 'COMPARE'

                    out_lines = []
                    if i == len(array_steps) - 1 and real_output:
                        out_lines = [l for l in real_output.strip().split('\n') if l]

                    steps.append({
                        'id': len(steps) + 1,
                        'code_line': 1,
                        'operation': op,
                        'description': desc,
                        'variables': {k: val for k, val in v.items()
                                     if not isinstance(val, list)} if v else {},
                        'output_so_far': out_lines,
                        'arrays': {name: arr},
                        'pointers': pointers,
                        'highlights': highlights,
                        'sorted_indices': [],
                    })
                    prev_arr = arr

                if steps:
                    return {
                        'viz_type': 'array',
                        'title': title,
                        'description': f'Step-by-step {language} execution',
                        'time_complexity': time_c,
                        'space_complexity': space_c,
                        'steps': steps,
                        'final_output': [real_output] if real_output else [],
                        'total_steps': len(steps),
                    }

    # No array trace — build from code lines (simple visualization)
    significant_lines = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith('//') and not stripped.startswith('#') and not stripped.startswith('/*'):
            significant_lines.append((i + 1, stripped))

    if not significant_lines:
        significant_lines = [(1, code.split('\n')[0] if code else 'empty')]

    # Limit to 25 lines for richer visualization
    significant_lines = significant_lines[:25]

    # Build steps from significant lines
    for idx, (line_num, line_text) in enumerate(significant_lines):
        operation = _detect_operation(line_text)
        if idx == 0:
            operation = 'CALL'
        elif idx == len(significant_lines) - 1:
            operation = 'RETURN'

        out_lines = []
        if idx == len(significant_lines) - 1 and real_output:
            out_lines = [l for l in real_output.strip().split('\n') if l]

        steps.append({
            'id': idx + 1,
            'code_line': line_num,
            'operation': operation,
            'description': line_text[:60],
            'variables': {},
            'output_so_far': out_lines,
            'changed_vars': [],
            'call_stack': [{'function': 'main', 'line': line_num}],
        })

    return {
        'viz_type': 'simple',
        'title': title,
        'description': f'Step-by-step {language} execution',
        'time_complexity': time_c,
        'space_complexity': space_c,
        'steps': steps,
        'final_output': [real_output] if real_output else [],
        'total_steps': len(steps),
    }