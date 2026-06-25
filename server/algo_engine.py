import sys
import io
import traceback
import copy

def build_algo_visualization(code):
    """Execute Python code and build accurate visualization data"""
    
    steps = []
    tree_nodes = {}
    node_counter = [0]
    call_stack = []
    array_snapshots = []
    
    def safe_serialize(val, depth=0):
        if depth > 3:
            return str(val)
        try:
            if isinstance(val, (int, float, str, bool, type(None))):
                return val
            elif isinstance(val, (list, tuple)):
                return [safe_serialize(v, depth+1) for v in val[:20]]
            elif isinstance(val, dict):
                return {str(k): safe_serialize(v, depth+1) for k, v in list(val.items())[:10]}
            elif isinstance(val, set):
                return list(val)[:10]
            else:
                return str(val)
        except:
            return str(val)

    visited_nodes = []
    prev_arrays = {}

    def trace_calls(frame, event, arg):
        if frame.f_code.co_filename != '<string>':
            return trace_calls

        lineno = frame.f_lineno
        func_name = frame.f_code.co_name

        # Get local variables
        local_vars = {}
        array_vars = {}
        active_indices = []

        for k, v in frame.f_locals.items():
            if not k.startswith('__'):
                try:
                    serialized = safe_serialize(v)
                    local_vars[k] = serialized
                    # Detect array/list variables
                    if isinstance(v, list) and all(isinstance(x, (int, float)) for x in v):
                        array_vars[k] = serialized
                except:
                    pass

        # Detect active indices (i, j, mid, low, high etc.)
        index_vars = ['i', 'j', 'mid', 'low', 'high', 'left', 'right', 'k']
        for iv in index_vars:
            if iv in local_vars and isinstance(local_vars[iv], int):
                active_indices.append(local_vars[iv])

        # Get current line text
        try:
            lines = code.split('\n')
            current_line = lines[lineno - 1].strip() if lineno <= len(lines) else ''
        except:
            current_line = ''

        # Build call stack
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

        # Handle function calls
        node_id = None
        if event == 'call':
            args = []
            for k, v in local_vars.items():
                if not k.startswith('_'):
                    args.append(f"{k}={str(v)[:8]}")
                    if len(args) >= 2:
                        break

            label = f"{func_name}({', '.join(args)})" if args else func_name
            node_counter[0] += 1
            node_id = f"n{node_counter[0]}"

            parent_id = call_stack[-1] if call_stack else None
            depth = len(call_stack)

            tree_nodes[node_id] = {
                'id': node_id,
                'value': label[:12],
                'label': label[:20],
                'left': None,
                'right': None,
                'parent': parent_id,
                'depth': depth,
                'x_offset': 0,
                'func_name': func_name
            }

            if parent_id and parent_id in tree_nodes:
                parent = tree_nodes[parent_id]
                if parent['left'] is None:
                    parent['left'] = node_id
                elif parent['right'] is None:
                    parent['right'] = node_id

            call_stack.append(node_id)

        elif event in ('return', 'exception'):
            if call_stack:
                node_id = call_stack[-1]
                call_stack.pop()

        current_node = call_stack[-1] if call_stack else (node_id or 'n1')

        # Detect array changes
        changed_array = None
        changed_array_name = None
        for arr_name, arr_val in array_vars.items():
            prev = prev_arrays.get(arr_name)
            if prev != arr_val:
                changed_array = arr_val
                changed_array_name = arr_name
                prev_arrays[arr_name] = list(arr_val) if arr_val else arr_val

        # Capture output
        current_output = []
        try:
            out_val = sys.stdout.getvalue().strip()
            if out_val:
                current_output = out_val.split('\n')
        except:
            pass

        operation = {
            'call': 'CALL',
            'return': 'RETURN',
            'line': 'LINE',
            'exception': 'ERROR'
        }.get(event, 'LINE')

        # Determine operation more specifically
        if event == 'line':
            if 'swap' in current_line.lower() or ('=' in current_line and '[' in current_line):
                operation = 'SWAP'
            elif 'if' in current_line and ('>' in current_line or '<' in current_line):
                operation = 'COMPARE'
            elif 'for' in current_line or 'while' in current_line:
                operation = 'LOOP'
            elif 'print' in current_line:
                operation = 'PRINT'
            elif '=' in current_line:
                operation = 'ASSIGN'

        highlighted = [current_node] if current_node else []

        step = {
            'id': f's{len(steps)+1}',
            'node_id': current_node,
            'operation': operation,
            'description': f"{func_name}: {current_line}" if current_line else func_name,
            'code_line': lineno,
            'visited_nodes': list(visited_nodes),
            'output': current_output,
            'highlighted_nodes': highlighted,
            'edge_from': tree_nodes[current_node]['parent'] if current_node in tree_nodes else None,
            'edge_to': current_node,
            'local_vars': local_vars,
            'stack': stack,
            'return_value': safe_serialize(arg) if event == 'return' else None,
            # Array visualization data
            'array_state': changed_array if changed_array else (list(prev_arrays.values())[-1] if prev_arrays else None),
            'active_indices': active_indices,
            'array_name': changed_array_name or (list(prev_arrays.keys())[-1] if prev_arrays else None)
        }

        if event == 'return' and current_node and current_node not in visited_nodes:
            visited_nodes.append(current_node)

        steps.append(step)
        return trace_calls

    # Capture stdout
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        compiled = compile(code, '<string>', 'exec')
        sys.settrace(trace_calls)
        namespace = {}
        exec(compiled, namespace)
    except Exception as e:
        steps.append({
            'id': f's{len(steps)+1}',
            'node_id': 'n1',
            'operation': 'ERROR',
            'description': str(e),
            'code_line': 0,
            'visited_nodes': [],
            'output': [],
            'highlighted_nodes': [],
            'edge_from': None,
            'edge_to': None,
            'local_vars': {},
            'stack': [],
            'return_value': None,
            'array_state': None,
            'active_indices': [],
            'array_name': None
        })
    finally:
        sys.settrace(None)
        final_output = sys.stdout.getvalue()
        sys.stdout = old_stdout

    # Convert tree nodes to list
    nodes_list = list(tree_nodes.values())

    # Fix layout
    level_counts = {}
    level_index = {}
    for node in nodes_list:
        d = node['depth']
        level_counts[d] = level_counts.get(d, 0) + 1

    for node in nodes_list:
        d = node['depth']
        level_index[d] = level_index.get(d, 0)
        total = level_counts[d]
        idx = level_index[d]
        node['x_offset'] = (idx - total/2) / max(total, 1)
        level_index[d] += 1

    # Filter important steps
    important_steps = []
    seen_lines = set()

    for s in steps:
        op = s['operation']
        line = s['code_line']
        arr = s.get('array_state')

        # Always include these
        if op in ('CALL', 'RETURN', 'ERROR', 'SWAP'):
            important_steps.append(s)
        elif op == 'COMPARE' and line not in seen_lines:
            important_steps.append(s)
            seen_lines.add(line)
        elif arr and str(arr) != str(prev_arrays.get('_last')):
            important_steps.append(s)
            prev_arrays['_last'] = arr
        elif op in ('PRINT', 'ASSIGN') and len(important_steps) < 30:
            important_steps.append(s)

    # Keep max 25 steps
    if len(important_steps) > 25:
        # Keep first 10 and last 10 and some middle
        important_steps = important_steps[:10] + important_steps[len(important_steps)//2-2:len(important_steps)//2+3] + important_steps[-10:]

    # Detect algo type and extract meaningful info
    code_lower = code.lower()

    # Check for specific algorithms first
    if any(x in code_lower for x in ['fibonacci', 'fib(']):
        algo_type, title, time_c, space_c = 'recursion', 'Fibonacci', 'O(2^n)', 'O(n)'
    elif any(x in code_lower for x in ['factorial', 'fact(']):
        algo_type, title, time_c, space_c = 'recursion', 'Factorial', 'O(n)', 'O(n)'
    elif 'hanoi' in code_lower:
        algo_type, title, time_c, space_c = 'recursion', 'Tower of Hanoi', 'O(2^n)', 'O(n)'
    elif any(x in code_lower for x in ['merge_sort', 'mergesort']):
        algo_type, title, time_c, space_c = 'sorting', 'Merge Sort', 'O(n log n)', 'O(n)'
    elif any(x in code_lower for x in ['quick_sort', 'quicksort']):
        algo_type, title, time_c, space_c = 'sorting', 'Quick Sort', 'O(n log n)', 'O(log n)'
    elif 'bubble' in code_lower and 'sort' in code_lower:
        algo_type, title, time_c, space_c = 'sorting', 'Bubble Sort', 'O(n²)', 'O(1)'
    elif 'selection' in code_lower and 'sort' in code_lower:
        algo_type, title, time_c, space_c = 'sorting', 'Selection Sort', 'O(n²)', 'O(1)'
    elif 'insertion' in code_lower and 'sort' in code_lower:
        algo_type, title, time_c, space_c = 'sorting', 'Insertion Sort', 'O(n²)', 'O(1)'
    elif any(x in code_lower for x in ['binary_search', 'bisect']):
        algo_type, title, time_c, space_c = 'searching', 'Binary Search', 'O(log n)', 'O(1)'
    elif any(x in code_lower for x in ['bfs', 'breadth']):
        algo_type, title, time_c, space_c = 'graph', 'BFS', 'O(V+E)', 'O(V)'
    elif any(x in code_lower for x in ['dfs', 'depth_first']):
        algo_type, title, time_c, space_c = 'graph', 'DFS', 'O(V+E)', 'O(V)'
    elif any(x in code_lower for x in ['inorder', 'preorder', 'postorder', 'bst']):
        algo_type, title, time_c, space_c = 'tree', 'Tree Traversal', 'O(n)', 'O(h)'
    elif '.sort(' in code_lower or 'sorted(' in code_lower:
        algo_type, title, time_c, space_c = 'sorting', 'Sort', 'O(n log n)', 'O(n)'
    else:
        # Check for recursion: a function that calls itself
        import re as _re
        func_defs = _re.findall(r'def\s+(\w+)\s*\(', code)
        is_recursive = False
        for fname in func_defs:
            # Check if function name appears again after its def line
            after_def = code[code.find(f'def {fname}') + len(f'def {fname}'):]
            if _re.search(rf'\b{fname}\s*\(', after_def):
                is_recursive = True
                algo_type = 'recursion'
                title = f'Recursive {fname}'
                break

        if not is_recursive:
            if 'def ' in code:
                # Extract first function name for title
                first_func = func_defs[0] if func_defs else 'Function'
                algo_type = 'linear'
                title = f'{first_func} Execution'
            elif any(x in code_lower for x in ['for ', 'while ']):
                algo_type = 'linear'
                title = 'Loop Execution'
            else:
                algo_type = 'linear'
                title = 'Code Execution'

            # Estimate complexity for non-specific cases
            nested_loops = len(_re.findall(r'(?:for|while)\s+', code))
            if nested_loops >= 3:
                time_c, space_c = 'O(n³)', 'O(1)'
            elif nested_loops == 2:
                time_c, space_c = 'O(n²)', 'O(1)'
            elif nested_loops == 1:
                time_c, space_c = 'O(n)', 'O(1)'
            else:
                time_c, space_c = 'O(1)', 'O(1)'

        if is_recursive:
            time_c, space_c = 'O(2^n)', 'O(n)'

    return {
        'algo_type': algo_type,
        'title': title,
        'description': 'Real step-by-step execution',
        'time_complexity': time_c,
        'space_complexity': space_c,
        'tree_nodes': nodes_list[:20],
        'steps': important_steps[:25],
        'final_output': [final_output.strip()] if final_output.strip() else [],
        'total_steps': len(important_steps[:25])
    }