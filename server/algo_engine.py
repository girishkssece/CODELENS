"""
Smart Algorithm Visualization Engine for CodeLens.
Detects data structures at runtime via sys.settrace and builds
adaptive, AlgoMaster-quality visualization data.

Viz types: tree | array | dp_table | graph | simple
"""

import sys
import io
import re
import math

# ═══════════════════════════════════════════════════════════════
# SECTION 1 — HELPERS
# ═══════════════════════════════════════════════════════════════

def _safe_repr(val, depth=0):
    """JSON-safe serialization of any Python value."""
    if depth > 3:
        return str(val)[:30]
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        return val[:100]
    if isinstance(val, (list, tuple)):
        return [_safe_repr(v, depth + 1) for v in val[:30]]
    if isinstance(val, dict):
        return {str(k): _safe_repr(v, depth + 1) for k, v in list(val.items())[:15]}
    if isinstance(val, set):
        try:
            items = sorted(val)
        except TypeError:
            items = list(val)
        return [_safe_repr(x, depth + 1) for x in items[:15]]
    try:
        name = type(val).__name__
        if name == 'deque':
            return [_safe_repr(v, depth + 1) for v in list(val)[:30]]
    except Exception:
        pass
    return str(val)[:50]


def _is_tree_node(obj):
    """Check if *obj* looks like a binary-tree node."""
    if obj is None or isinstance(obj, (int, float, str, bool, list, dict, tuple, set, type)):
        return False
    has_children = hasattr(obj, 'left') or hasattr(obj, 'right')
    has_value = hasattr(obj, 'val') or hasattr(obj, 'value') or hasattr(obj, 'data') or hasattr(obj, 'key')
    return has_children and has_value


def _get_node_val(obj):
    """Get display value from a tree / linked-list node."""
    for attr in ('val', 'value', 'data', 'key'):
        if hasattr(obj, attr):
            v = getattr(obj, attr)
            if isinstance(v, (int, float, str)):
                return v
    return '?'


def _serialize_tree(root):
    """BFS-serialize a binary tree.

    Returns
    -------
    nodes : list[dict]   — each has id, val, left, right, parent, depth, _obj_id
    obj_to_sid : dict     — maps ``id(obj)`` → string-id like ``"tn1"``
    """
    if root is None or not _is_tree_node(root):
        return [], {}

    nodes = []
    obj_to_sid = {}
    queue = [(root, None, 0)]
    seen = set()
    counter = 0

    while queue:
        obj, parent_sid, depth = queue.pop(0)
        if obj is None or id(obj) in seen or not _is_tree_node(obj):
            continue
        seen.add(id(obj))
        counter += 1
        sid = f"tn{counter}"
        obj_to_sid[id(obj)] = sid

        val = _get_node_val(obj)
        left_obj = getattr(obj, 'left', None)
        right_obj = getattr(obj, 'right', None)

        left_oid = id(left_obj) if _is_tree_node(left_obj) else None
        right_oid = id(right_obj) if _is_tree_node(right_obj) else None

        nodes.append({
            'id': sid,
            'val': val,
            'parent': parent_sid,
            'depth': depth,
            '_left_oid': left_oid,
            '_right_oid': right_oid,
            '_obj_id': id(obj),
        })

        if _is_tree_node(left_obj):
            queue.append((left_obj, sid, depth + 1))
        if _is_tree_node(right_obj):
            queue.append((right_obj, sid, depth + 1))

    # Resolve left / right string-ids
    for n in nodes:
        n['left'] = obj_to_sid.get(n.pop('_left_oid'))
        n['right'] = obj_to_sid.get(n.pop('_right_oid'))

    return nodes, obj_to_sid


def _is_numeric_list(v):
    return (isinstance(v, list) and 0 < len(v) <= 100
            and all(isinstance(x, (int, float)) for x in v))


def _is_adjacency_dict(d):
    """dict where every value is a list/tuple/set → adjacency list."""
    if not isinstance(d, dict) or len(d) < 2:
        return False
    return all(isinstance(v, (list, tuple, set)) for v in d.values())


# ═══════════════════════════════════════════════════════════════
# SECTION 2 — CODE-ANALYSIS HELPERS
# ═══════════════════════════════════════════════════════════════

POINTER_NAMES = frozenset(
    'i j k l r left right low high mid start end '
    'ptr index pos pivot head tail front back p q'.split()
)

DP_NAMES = frozenset('dp memo table cache cost ways count f opt'.split())


def _detect_traversal_type(code):
    """Return (name, order_list) for tree-traversal code, else (None, None)."""
    funcs = re.findall(r'def\s+(\w+)\s*\(', code)
    for fn in funcs:
        m = re.search(rf'def\s+{fn}\s*\([^)]*\)\s*:', code)
        if not m:
            continue
        body = code[m.end():]
        left_pos = right_pos = visit_pos = -1
        for mx in re.finditer(rf'{fn}\s*\(.*\.left', body):
            left_pos = mx.start(); break
        for mx in re.finditer(rf'{fn}\s*\(.*\.right', body):
            right_pos = mx.start(); break
        for mx in re.finditer(r'(print\(|\.append\(|\.add\(|visit\(|yield )', body):
            p = mx.start()
            ctx = body[max(0, p - 20):p + 20]
            if '.left' not in ctx and '.right' not in ctx:
                visit_pos = p; break
        if left_pos >= 0 and right_pos >= 0 and visit_pos >= 0:
            if visit_pos < left_pos:
                return 'Preorder Traversal', ['VISIT', 'LEFT', 'RIGHT']
            elif visit_pos > right_pos:
                return 'Postorder Traversal', ['LEFT', 'RIGHT', 'VISIT']
            else:
                return 'Inorder Traversal', ['LEFT', 'VISIT', 'RIGHT']
    return None, None


def _analyze_complexity(code):
    """Return (title, time, space) based on code patterns."""
    lo = code.lower()
    checks = [
        (['fibonacci', 'fib('], lambda: (
            ('Fibonacci (DP)', 'O(n)', 'O(n)')
            if any(x in lo for x in ['memo', 'dp', 'cache'])
            else ('Fibonacci', 'O(2^n)', 'O(n)'))),
        (['factorial', 'fact('], lambda: ('Factorial', 'O(n)', 'O(n)')),
        (['hanoi'], lambda: ('Tower of Hanoi', 'O(2^n)', 'O(n)')),
        (['merge_sort', 'mergesort'], lambda: ('Merge Sort', 'O(n log n)', 'O(n)')),
        (['quick_sort', 'quicksort'], lambda: ('Quick Sort', 'O(n log n)', 'O(log n)')),
        (['bubble_sort', 'bubblesort', 'bubble sort'], lambda: ('Bubble Sort', 'O(n²)', 'O(1)')),
        (['selection_sort', 'selectionsort'], lambda: ('Selection Sort', 'O(n²)', 'O(1)')),
        (['insertion_sort', 'insertionsort'], lambda: ('Insertion Sort', 'O(n²)', 'O(1)')),
        (['binary_search', 'binarysearch'], lambda: ('Binary Search', 'O(log n)', 'O(1)')),
        (['bfs', 'breadth_first'], lambda: ('BFS', 'O(V+E)', 'O(V)')),
        (['dfs', 'depth_first'], lambda: ('DFS', 'O(V+E)', 'O(V)')),
        (['inorder', 'in_order'], lambda: ('Inorder Traversal', 'O(n)', 'O(h)')),
        (['preorder', 'pre_order'], lambda: ('Preorder Traversal', 'O(n)', 'O(h)')),
        (['postorder', 'post_order'], lambda: ('Postorder Traversal', 'O(n)', 'O(h)')),
        (['coin_change', 'coinchange', 'coin change'], lambda: ('Coin Change', 'O(amount × coins)', 'O(amount)')),
        (['knapsack'], lambda: ('Knapsack', 'O(n × W)', 'O(n × W)')),
        (['longest common', 'lcs'], lambda: ('LCS', 'O(m × n)', 'O(m × n)')),
    ]
    for keywords, factory in checks:
        if any(k in lo for k in keywords):
            return factory()

    # Recursion detection
    func_defs = re.findall(r'def\s+(\w+)\s*\(', code)
    for fn in func_defs:
        after = code[code.find(f'def {fn}') + len(f'def {fn}'):]
        if re.search(rf'\b{fn}\s*\(', after):
            calls = len(re.findall(rf'{fn}\s*\(', after))
            if calls >= 2:
                return f'Recursive {fn}', 'O(2^n)', 'O(n)'
            return f'Recursive {fn}', 'O(n)', 'O(n)'

    # Loop counting
    loops = len(re.findall(r'\b(?:for|while)\s+', code))
    if loops >= 3:
        tc = 'O(n³)'
    elif loops == 2:
        tc = 'O(n²)'
    elif loops == 1:
        tc = 'O(n)'
    else:
        tc = 'O(1)'

    name = func_defs[0] if func_defs else 'Code'
    return f'{name} Execution', tc, 'O(1)'


def _classify_op(event, line_text):
    if event == 'call':
        return 'CALL'
    if event == 'return':
        return 'RETURN'
    if event == 'exception':
        return 'ERROR'
    s = line_text.strip().lower()
    if 'swap' in s or ('temp' in s and '=' in s):
        return 'SWAP'
    if any(k in s for k in ['if ', 'elif ', '>', '<', '==', '!=']):
        return 'COMPARE'
    if any(k in s for k in ['for ', 'while ']):
        return 'LOOP'
    if 'print(' in s:
        return 'PRINT'
    if '.append(' in s or '.add(' in s or '.push(' in s:
        return 'PUSH'
    if '.pop(' in s or '.popleft(' in s:
        return 'POP'
    if 'return ' in s:
        return 'RETURN'
    if '=' in s and '==' not in s and '!=' not in s and '>=' not in s and '<=' not in s:
        return 'ASSIGN'
    return 'LINE'


def _clean_vars(lv, exclude_key=None):
    """Remove functions, modules, classes, and arrays from variables display."""
    clean = {}
    for k, v in lv.items():
        if exclude_key and k == exclude_key:
            continue
        if isinstance(v, str) and ('<function' in v or '<module' in v or '<class' in v):
            continue
        if isinstance(v, list):
            continue
        if str(v).startswith('<'):
            continue
        clean[k] = v
    return clean


# ═══════════════════════════════════════════════════════════════
# SECTION 3 — VIZ-TYPE-SPECIFIC BUILDERS
# ═══════════════════════════════════════════════════════════════

def _build_tree_viz(code, raw, final_out, tree_nodes, obj_to_sid, oid_info, title, tc, sc):
    """Build tree visualization from raw trace events."""
    trav_name, trav_order = _detect_traversal_type(code)
    if trav_name:
        title = trav_name

    # ── filter interesting events ──
    filtered = []
    for i, ev in enumerate(raw):
        fn = ev['func_name']
        if fn == '__init__':
            continue
        event = ev['event']
        line = ev['line_text']
        if event in ('call', 'return'):
            filtered.append((i, ev))
        elif event == 'line':
            ll = line.lower()
            if any(k in ll for k in ['print(', '.append(', '.add(', 'visit(', 'yield ', 'result']):
                filtered.append((i, ev))

    # ── build steps ──
    steps = []
    visited_set = set()           # obj-ids already "processed"

    for idx, (raw_idx, ev) in enumerate(filtered):
        event = ev['event']
        line_text = ev['line_text']
        lineno = ev['lineno']
        t_stack = ev.get('tree_stack', [])
        t_param = ev.get('tree_node_id')

        # active node = topmost non-None on the stack
        active_oid = None
        for tid in reversed(t_stack):
            if tid is not None:
                active_oid = tid
                break
        active_sid = obj_to_sid.get(active_oid)

        # node states
        node_states = {}
        on_stack = set(x for x in t_stack if x is not None)
        for tn in tree_nodes:
            oid = tn['_obj_id']
            if oid == active_oid:
                node_states[tn['id']] = 'active'
            elif oid in visited_set:
                node_states[tn['id']] = 'visited'
            elif oid in on_stack:
                node_states[tn['id']] = 'processing'
            else:
                node_states[tn['id']] = 'unvisited'

        # description
        if event == 'call':
            if t_param is None or t_param not in oid_info:
                desc = 'Base case — node is null, return'
                op = 'BASE_CASE'
            else:
                val = oid_info[t_param]['val']
                prev_line = raw[raw_idx - 1]['line_text'] if raw_idx > 0 else ''
                if '.left' in prev_line:
                    desc = f'Go LEFT → node {val}'
                elif '.right' in prev_line:
                    desc = f'Go RIGHT → node {val}'
                else:
                    desc = f'Start traversal at node {val}'
                op = 'CALL'
        elif event == 'return':
            if t_param and t_param in oid_info:
                val = oid_info[t_param]['val']
                desc = f'Done with subtree of node {val}'
                visited_set.add(t_param)
            else:
                desc = 'Return from base case'
            op = 'RETURN'
        else:
            val = oid_info.get(active_oid, {}).get('val', '?')
            desc = f'Process node {val}'
            op = 'VISIT'
            if active_oid:
                visited_set.add(active_oid)

        # output snapshot
        out = ev.get('output', '')
        out_lines = [l for l in out.strip().split('\n') if l] if out.strip() else []

        # active edge
        active_edge = None
        if active_sid:
            for tn in tree_nodes:
                if tn['id'] == active_sid and tn.get('parent'):
                    active_edge = {'from': tn['parent'], 'to': active_sid}
                    break

        steps.append({
            'id': idx + 1,
            'code_line': lineno,
            'operation': op,
            'description': desc,
            'variables': _clean_vars(ev.get('locals', {})),
            'output_so_far': out_lines,
            'node_states': node_states,
            'active_edge': active_edge,
        })

    if len(steps) > 80:
        steps = steps[:40] + steps[-40:]

    # strip internal fields from tree_nodes for the response
    clean_nodes = [{k: v for k, v in n.items() if not k.startswith('_')} for n in tree_nodes]

    return {
        'viz_type': 'tree',
        'title': title,
        'time_complexity': tc,
        'space_complexity': sc,
        'traversal_order': trav_order,
        'tree_nodes': clean_nodes,
        'steps': steps,
        'final_output': [final_out.strip()] if final_out.strip() else [],
        'total_steps': len(steps),
    }


def _build_array_viz(code, raw, final_out, arr_name, title, tc, sc):
    """Build array / sorting / searching visualization with pointer tracking."""
    steps = []
    prev_arr = None
    prev_pointers = []

    # Detect if this is a search (array doesn't change) or sort (array changes)
    all_list_vars = []
    for ev in raw:
        lv = ev.get('list_vars', {})
        if arr_name in lv:
            all_list_vars.append(lv[arr_name])

    is_search = len(all_list_vars) > 1 and all(a == all_list_vars[0] for a in all_list_vars)

    for i, ev in enumerate(raw):
        if ev['func_name'] == '__init__':
            continue

        lvars = ev.get('list_vars', {})
        arr = lvars.get(arr_name)

        if arr is None:
            for k, v in lvars.items():
                if k not in DP_NAMES and _is_numeric_list(v):
                    arr = v
                    arr_name = k
                    break

        if arr is None and prev_arr is None:
            continue

        current_arr = list(arr) if arr is not None else list(prev_arr)
        lv = ev.get('locals', {})

        # ── Detect ALL pointer variables ──
        pointers = []
        for pname in POINTER_NAMES:
            if pname in lv:
                val = lv[pname]
                if isinstance(val, int) and 0 <= val < len(current_arr):
                    pointers.append({'name': pname, 'index': val})

        # Also capture any int variable that could be an index
        for k, v in lv.items():
            if k not in POINTER_NAMES and isinstance(v, int) and 0 <= v < len(current_arr):
                if k not in [p['name'] for p in pointers]:
                    pointers.append({'name': k, 'index': v})

        # ── For search: only emit step when pointers change ──
        if is_search:
            ptr_sig = [(p['name'], p['index']) for p in pointers]
            prev_ptr_sig = [(p['name'], p['index']) for p in prev_pointers]
            if ptr_sig == prev_ptr_sig and len(steps) > 0:
                prev_arr = current_arr
                continue
        else:
            # For sort: skip if array unchanged and no pointer change
            arr_changed = (prev_arr is None) or (current_arr != prev_arr)
            ptr_changed = pointers != prev_pointers
            if not arr_changed and not ptr_changed and len(steps) > 3:
                prev_arr = current_arr
                prev_pointers = pointers
                continue

        # ── Build highlights ──
        highlights = []

        # Swap highlights (array changed)
        if prev_arr is not None and len(prev_arr) == len(current_arr):
            for idx_c in range(len(current_arr)):
                if current_arr[idx_c] != prev_arr[idx_c]:
                    highlights.append({'index': idx_c, 'type': 'swap'})

        # Pointer highlights
        mid_ptr = next((p for p in pointers if p['name'] == 'mid'), None)
        low_ptr = next((p for p in pointers if p['name'] in ('low', 'left', 'l', 'lo', 'start')), None)
        high_ptr = next((p for p in pointers if p['name'] in ('high', 'right', 'r', 'hi', 'end')), None)

        if mid_ptr and not any(h['index'] == mid_ptr['index'] for h in highlights):
            highlights.append({'index': mid_ptr['index'], 'type': 'compare'})

        # Sorted/eliminated indices (outside search window)
        sorted_indices = []
        if is_search and low_ptr and high_ptr:
            for si in range(len(current_arr)):
                if si < low_ptr['index'] or si > high_ptr['index']:
                    sorted_indices.append(si)

        # ── Build description ──
        op = _classify_op(ev['event'], ev['line_text'])
        line = ev['line_text']
        desc = line if len(line) <= 60 else line[:57] + '...'

        if is_search:
            # Rich search descriptions
            if mid_ptr and low_ptr and high_ptr:
                mid_val = current_arr[mid_ptr['index']] if mid_ptr['index'] < len(current_arr) else '?'
                target_val = lv.get('target', lv.get('key', lv.get('x', '?')))
                if 'return' in line.lower() and 'mid' in line.lower():
                    desc = f"✅ Found! arr[{mid_ptr['index']}]={mid_val} == target={target_val}"
                    op = 'VISIT'
                elif 'low' in line.lower() and '=' in line and 'mid' in line.lower():
                    desc = f"arr[mid]={mid_val} < target={target_val} → move low to {mid_ptr['index'] + 1}"
                    op = 'ASSIGN'
                elif 'high' in line.lower() and '=' in line and 'mid' in line.lower():
                    desc = f"arr[mid]={mid_val} > target={target_val} → move high to {mid_ptr['index'] - 1}"
                    op = 'ASSIGN'
                elif 'if' in line.lower():
                    desc = f"Check arr[mid={mid_ptr['index']}]={mid_val} vs target={target_val}"
                    op = 'COMPARE'
                elif 'mid' in line.lower() and '=' in line:
                    desc = f"mid = ({low_ptr['index']} + {high_ptr['index']}) // 2 = {mid_ptr['index']}"
                    op = 'ASSIGN'
            elif low_ptr or high_ptr:
                parts = []
                if low_ptr: parts.append(f"low={low_ptr['index']}")
                if high_ptr: parts.append(f"high={high_ptr['index']}")
                desc = f"Update pointers: {', '.join(parts)}"
                op = 'ASSIGN'
        else:
            # Rich sort descriptions
            if op == 'SWAP' and len(pointers) >= 2:
                p1, p2 = pointers[0], pointers[1]
                if p1['index'] < len(current_arr) and p2['index'] < len(current_arr):
                    desc = f"Swap arr[{p1['index']}]={current_arr[p1['index']]} ↔ arr[{p2['index']}]={current_arr[p2['index']]}"
            elif op == 'COMPARE' and len(pointers) >= 2:
                p1, p2 = pointers[0], pointers[1]
                if p1['index'] < len(current_arr) and p2['index'] < len(current_arr):
                    v1 = current_arr[p1['index']]
                    v2 = current_arr[p2['index']]
                    sym = '>' if v1 > v2 else '<' if v1 < v2 else '=='
                    desc = f"Compare arr[{p1['index']}]={v1} {sym} arr[{p2['index']}]={v2}"
            elif 'pivot' in lv:
                pivot_val = lv['pivot']
                desc = f"Pivot = {pivot_val}, partitioning array"

        out = ev.get('output', '')
        out_lines = [l for l in out.strip().split('\n') if l] if out.strip() else []

        steps.append({
            'id': len(steps) + 1,
            'code_line': ev['lineno'],
            'operation': op,
            'description': desc,
            'variables': _clean_vars(lv, exclude_key=arr_name),
            'output_so_far': out_lines,
            'arrays': {arr_name: current_arr},
            'pointers': pointers,
            'highlights': highlights,
            'sorted_indices': sorted_indices,
        })

        prev_arr = current_arr
        prev_pointers = pointers

    # Smart step limiting
    if len(steps) > 80:
        mid = steps[35:-35]
        stride = max(1, len(mid) // 10)
        sampled = mid[::stride][:10]
        steps = steps[:35] + sampled + steps[-35:]
        for idx_s, s in enumerate(steps):
            s['id'] = idx_s + 1

    return {
        'viz_type': 'array',
        'title': title,
        'time_complexity': tc,
        'space_complexity': sc,
        'steps': steps,
        'final_output': [final_out.strip()] if final_out.strip() else [],
        'total_steps': len(steps),
    }


def _build_dp_viz(code, raw, final_out, dp_name, title, tc, sc):
    """Build DP-table visualization."""
    steps = []
    prev_dp = None

    # Try to find auxiliary data (e.g. coins, weights)
    aux_keys = {}
    for ev in raw[:10]:
        for k, v in ev.get('locals', {}).items():
            if k != dp_name and isinstance(v, list) and _is_numeric_list(v) and len(v) <= 20:
                aux_keys[k] = v
            elif k != dp_name and isinstance(v, (int, float)) and k not in POINTER_NAMES:
                aux_keys[k] = v

    for ev in raw:
        if ev['func_name'] == '__init__':
            continue

        lvars = ev.get('list_vars', {})
        dp_arr = lvars.get(dp_name)
        if dp_arr is None:
            # fallback: check all list_vars for DP-named vars
            for k, v in lvars.items():
                if k.lower() in DP_NAMES:
                    dp_arr = v
                    dp_name = k
                    break

        if dp_arr is None:
            continue

        current_dp = list(dp_arr)
        changed = (prev_dp is None) or (current_dp != prev_dp)

        if not changed and ev['event'] == 'line':
            continue

        # Find which cell changed
        current_cell = None
        filled_cells = []
        if prev_dp is not None and len(prev_dp) == len(current_dp):
            for ci in range(len(current_dp)):
                if current_dp[ci] != prev_dp[ci]:
                    current_cell = ci
                if current_dp[ci] != 0 and current_dp[ci] is not None:
                    filled_cells.append(ci)
        else:
            for ci in range(len(current_dp)):
                if current_dp[ci] != 0 and current_dp[ci] is not None:
                    filled_cells.append(ci)

        # Aux data snapshot
        lv = ev.get('locals', {})
        aux_snap = {}
        for ak in aux_keys:
            if ak in lv:
                aux_snap[ak] = _safe_repr(lv[ak])

        op = _classify_op(ev['event'], ev['line_text'])
        if current_cell is not None:
            op = 'FILL'
        desc = ev['line_text'] if len(ev['line_text']) <= 60 else ev['line_text'][:57] + '...'
        if current_cell is not None:
            desc = f"Set {dp_name}[{current_cell}] = {current_dp[current_cell]}"

        out = ev.get('output', '')
        out_lines = [l for l in out.strip().split('\n') if l] if out.strip() else []

        steps.append({
            'id': len(steps) + 1,
            'code_line': ev['lineno'],
            'operation': op,
            'description': desc,
            'variables': _clean_vars(lv, exclude_key=dp_name),
            'output_so_far': out_lines,
            'dp_table': current_dp,
            'dp_name': dp_name,
            'dp_dimensions': '1d',
            'current_cell': current_cell,
            'filled_cells': filled_cells,
            'aux_data': aux_snap,
        })
        prev_dp = current_dp

    if len(steps) > 80:
        steps = steps[:35] + steps[-35:]
        for ix, s in enumerate(steps):
            s['id'] = ix + 1

    return {
        'viz_type': 'dp_table',
        'title': title,
        'time_complexity': tc,
        'space_complexity': sc,
        'steps': steps,
        'final_output': [final_out.strip()] if final_out.strip() else [],
        'total_steps': len(steps),
    }


def _build_graph_viz(code, raw, final_out, graph_adj, graph_var, title, tc, sc):
    """Build graph BFS/DFS visualization."""
    # Extract static structure
    all_nodes = set()
    edges = []
    if isinstance(graph_adj, dict):
        for node, neighbors in graph_adj.items():
            all_nodes.add(node)
            for nb in neighbors:
                all_nodes.add(nb)
                edges.append({'from': str(node), 'to': str(nb)})
    all_nodes_list = sorted(all_nodes, key=lambda x: (isinstance(x, str), x))

    steps = []
    prev_visited = set()
    prev_queue = []

    # Heuristic names for BFS/DFS vars
    visited_keys = {'visited', 'seen', 'explored', 'vis', 'used'}
    queue_keys = {'queue', 'q', 'stack', 's', 'to_visit', 'frontier', 'bfs_queue'}
    current_keys = {'node', 'current', 'curr', 'u', 'vertex', 'v', 'n'}

    for ev in raw:
        if ev['func_name'] == '__init__':
            continue

        lv = ev.get('locals', {})
        sv = ev.get('set_vars', {})

        # Find visited set
        visited = None
        for vk in visited_keys:
            if vk in sv:
                visited = sv[vk]
                break
        if visited is None:
            for vk in visited_keys:
                if vk in lv and isinstance(lv[vk], (list, set)):
                    visited = set(lv[vk]) if isinstance(lv[vk], list) else lv[vk]
                    break

        # Find queue
        queue_val = None
        for qk in queue_keys:
            if qk in lv:
                qv = lv[qk]
                if isinstance(qv, list):
                    queue_val = qv
                    break

        # Find current node
        current_node = None
        for ck in current_keys:
            if ck in lv and not isinstance(lv[ck], (list, dict, set)):
                current_node = lv[ck]
                break

        # Skip if nothing changed
        if visited == prev_visited and queue_val == prev_queue and ev['event'] == 'line':
            continue

        # Build node states
        node_states = {}
        for gn in all_nodes_list:
            if str(gn) == str(current_node):
                node_states[str(gn)] = 'active'
            elif visited and gn in visited:
                node_states[str(gn)] = 'visited'
            elif queue_val and gn in queue_val:
                node_states[str(gn)] = 'queued'
            else:
                node_states[str(gn)] = 'unvisited'

        # Build edge states
        edge_states = {}
        if visited:
            for e in edges:
                fr, to = e['from'], e['to']
                # Try to match original types
                try:
                    fr_orig = int(fr) if fr.isdigit() else fr
                    to_orig = int(to) if to.isdigit() else to
                except (ValueError, AttributeError):
                    fr_orig, to_orig = fr, to
                key = f"{fr}-{to}"
                if fr_orig in visited and to_orig in visited:
                    edge_states[key] = 'visited'
                elif str(current_node) == fr:
                    edge_states[key] = 'active'
                else:
                    edge_states[key] = 'default'

        op = _classify_op(ev['event'], ev['line_text'])
        desc = ev['line_text'] if len(ev['line_text']) <= 60 else ev['line_text'][:57] + '...'
        if current_node is not None and op in ('LINE', 'ASSIGN', 'LOOP'):
            if visited and len(visited) > len(prev_visited):
                new_nodes = visited - prev_visited if prev_visited else set()
                if new_nodes:
                    desc = f"Visit node {current_node}, mark as visited"
                    op = 'VISIT'

        out = ev.get('output', '')
        out_lines = [l for l in out.strip().split('\n') if l] if out.strip() else []

        steps.append({
            'id': len(steps) + 1,
            'code_line': ev['lineno'],
            'operation': op,
            'description': desc,
            'variables': _clean_vars(lv, exclude_key=graph_var),
            'output_so_far': out_lines,
            'node_states': node_states,
            'edge_states': edge_states,
            'queue': [str(x) for x in queue_val] if queue_val else [],
        })

        prev_visited = set(visited) if visited else prev_visited
        prev_queue = list(queue_val) if queue_val else prev_queue

    if len(steps) > 80:
        steps = steps[:35] + steps[-35:]
        for ix, s in enumerate(steps):
            s['id'] = ix + 1

    return {
        'viz_type': 'graph',
        'title': title,
        'time_complexity': tc,
        'space_complexity': sc,
        'graph_nodes': [str(n) for n in all_nodes_list],
        'graph_edges': edges,
        'steps': steps,
        'final_output': [final_out.strip()] if final_out.strip() else [],
        'total_steps': len(steps),
    }


def _build_simple_viz(code, raw, final_out, title, tc, sc, error_msg=None):
    """Build simple variable-tracking visualization."""
    steps = []
    prev_vars = {}

    for ev in raw:
        fn = ev['func_name']
        if fn == '__init__':
            continue

        event = ev['event']
        lv = ev.get('locals', {})

        # Detect changed variables
        changed_vars = []
        for k, v in lv.items():
            old = prev_vars.get(k)
            if old != v:
                changed_vars.append(k)

        # Skip uninteresting events (no variable change, not call/return/print)
        is_print = 'print(' in ev['line_text'].lower()
        if not changed_vars and event == 'line' and not is_print:
            if len(steps) > 2:
                continue

        op = _classify_op(event, ev['line_text'])
        desc = ev['line_text'] if len(ev['line_text']) <= 60 else ev['line_text'][:57] + '...'

        # Enhance descriptions
        if op == 'ASSIGN' and changed_vars:
            parts = []
            for cv in changed_vars[:3]:
                parts.append(f"{cv} = {_safe_repr(lv[cv])}")
            desc = 'Set ' + ', '.join(parts)
        elif op == 'PRINT':
            desc = f'Print: {ev["line_text"].strip()}'
        elif event == 'call' and fn != '<module>':
            args = ', '.join(f'{k}={_safe_repr(v)}'
                             for k, v in lv.items()
                             if k not in ('self',) and not k.startswith('_'))
            desc = f'Call {fn}({args[:40]})'
        elif event == 'return' and fn != '<module>':
            desc = f'Return from {fn}'

        out = ev.get('output', '')
        out_lines = [l for l in out.strip().split('\n') if l] if out.strip() else []

        # Build call stack
        stack = ev.get('call_stack', [])

        steps.append({
            'id': len(steps) + 1,
            'code_line': ev['lineno'],
            'operation': op,
            'description': desc,
            'variables': _clean_vars(lv),
            'output_so_far': out_lines,
            'changed_vars': changed_vars,
            'call_stack': stack,
        })
        prev_vars = dict(lv)

    if len(steps) > 80:
        steps = steps[:35] + steps[-35:]
        for ix, s in enumerate(steps):
            s['id'] = ix + 1

    if error_msg and (not steps or steps[-1]['operation'] != 'ERROR'):
        steps.append({
            'id': len(steps) + 1,
            'code_line': 0,
            'operation': 'ERROR',
            'description': f'Error: {error_msg}',
            'variables': {},
            'output_so_far': [],
            'changed_vars': [],
            'call_stack': [],
        })

    return {
        'viz_type': 'simple',
        'title': title,
        'time_complexity': tc,
        'space_complexity': sc,
        'steps': steps,
        'final_output': [final_out.strip()] if final_out.strip() else [],
        'total_steps': len(steps),
    }


def _fallback_result(code, final_out, error_msg=None):
    """Minimal result when tracing fails entirely."""
    title, tc, sc = _analyze_complexity(code)
    return {
        'viz_type': 'simple',
        'title': title,
        'time_complexity': tc,
        'space_complexity': sc,
        'steps': [{
            'id': 1,
            'code_line': 1,
            'operation': 'ERROR' if error_msg else 'LINE',
            'description': error_msg or code.split('\n')[0][:60],
            'variables': {},
            'output_so_far': [final_out.strip()] if final_out.strip() else [],
            'changed_vars': [],
            'call_stack': [],
        }],
        'final_output': [final_out.strip()] if final_out.strip() else [],
        'total_steps': 1,
    }


# ═══════════════════════════════════════════════════════════════
# SECTION 4 — MAIN ENGINE
# ═══════════════════════════════════════════════════════════════

def build_algo_visualization(code):
    """Execute Python code with sys.settrace and build adaptive visualization.

    Returns a dict ready for JSON serialization with keys:
        viz_type, title, time_complexity, space_complexity,
        steps, final_output, total_steps, and type-specific data.
    """
    raw_events = []
    code_lines = code.split('\n')

    # ── tree-tracking state (updated during tracing) ──
    tree_node_ids_seen = {}   # id(obj) → val
    tree_call_stack = []      # stack of obj-ids for recursive tree calls

    # ── tracer ──
    def tracer(frame, event, arg):
        if frame.f_code.co_filename != '<string>':
            return tracer
        if len(raw_events) > 3000:
            return tracer

        lineno = frame.f_lineno
        func_name = frame.f_code.co_name
        line_text = code_lines[lineno - 1].strip() if lineno <= len(code_lines) else ''

        # ── capture variables ──
        local_vars = {}
        tree_node_param_id = None
        list_vars = {}
        set_vars = {}
        dict_vars = {}

        for k, v in frame.f_locals.items():
            if k.startswith('__'):
                continue
            try:
                if _is_tree_node(v):
                    val = _get_node_val(v)
                    local_vars[k] = f"Node({val})"
                    tree_node_ids_seen[id(v)] = val
                    if k != 'self':
                        tree_node_param_id = id(v)
                elif isinstance(v, bool):
                    local_vars[k] = v
                elif isinstance(v, (int, float)):
                    local_vars[k] = v
                elif isinstance(v, str):
                    local_vars[k] = v[:80]
                elif v is None:
                    local_vars[k] = None
                elif isinstance(v, list):
                    local_vars[k] = _safe_repr(v)
                    if _is_numeric_list(v):
                        list_vars[k] = list(v)
                elif isinstance(v, set):
                    local_vars[k] = _safe_repr(v)
                    set_vars[k] = set(v)
                elif isinstance(v, dict):
                    local_vars[k] = _safe_repr(v)
                    dict_vars[k] = dict(v)
                elif isinstance(v, type):
                    continue
                else:
                    try:
                        if type(v).__name__ == 'deque':
                            local_vars[k] = list(v)
                        else:
                            local_vars[k] = str(v)[:50]
                    except Exception:
                        local_vars[k] = str(v)[:50]
            except Exception:
                continue

        # stdout snapshot
        try:
            output_snapshot = sys.stdout.getvalue()
        except Exception:
            output_snapshot = ''

        # ── tree call-stack tracking ──
        if func_name != '__init__':
            if event == 'call':
                if tree_node_param_id is not None:
                    tree_call_stack.append(tree_node_param_id)
                else:
                    tree_call_stack.append(None)
            elif event == 'return':
                if tree_call_stack:
                    top = tree_call_stack[-1]
                    if top == tree_node_param_id or top is None:
                        tree_call_stack.pop()

        # ── build call stack info ──
        stack_info = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == '<string>':
                stack_info.append({
                    'function': f.f_code.co_name,
                    'line': f.f_lineno,
                })
            f = f.f_back
        stack_info.reverse()

        raw_events.append({
            'event': event,
            'lineno': lineno,
            'func_name': func_name,
            'line_text': line_text,
            'locals': local_vars,
            'output': output_snapshot,
            'tree_node_id': tree_node_param_id,
            'tree_stack': list(tree_call_stack),
            'list_vars': list_vars,
            'set_vars': set_vars,
            'dict_vars': dict_vars,
            'call_stack': stack_info,
        })

        return tracer

    # ── execute ──
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    namespace = {}
    error_msg = None

    try:
        compiled = compile(code, '<string>', 'exec')
        sys.settrace(tracer)
        exec(compiled, namespace)
    except Exception as e:
        error_msg = str(e)
    finally:
        sys.settrace(None)
        final_output = sys.stdout.getvalue()
        sys.stdout = old_stdout

    if not raw_events:
        return _fallback_result(code, final_output, error_msg)

    # ═══════════ detect viz_type ═══════════

    # 1. Tree — check namespace for tree-node objects
    tree_nodes = []
    tree_id_map = {}
    for k, v in namespace.items():
        if k.startswith('__'):
            continue
        if _is_tree_node(v):
            nodes, idmap = _serialize_tree(v)
            if len(nodes) > len(tree_nodes):
                tree_nodes = nodes
                tree_id_map = idmap
    has_tree = len(tree_nodes) >= 2

    # 2. Graph — adjacency dict in namespace
    has_graph = False
    graph_adj = None
    graph_var = None
    for k, v in namespace.items():
        if k.startswith('__'):
            continue
        if isinstance(v, dict) and _is_adjacency_dict(v):
            has_graph = True
            graph_adj = v
            graph_var = k
            break

    # 3. DP — list named dp/memo/table/etc.
    has_dp = False
    dp_var = None
    for ev in raw_events:
        for k in ev.get('list_vars', {}):
            if k.lower() in DP_NAMES:
                has_dp = True
                dp_var = k
                break
        if has_dp:
            break
    if not has_dp:
        for k, v in namespace.items():
            if k.lower() in DP_NAMES and isinstance(v, list):
                has_dp = True
                dp_var = k
                break

    # 4. Array — numeric list (non-DP)
    has_arrays = False
    arr_var = None
    for ev in raw_events:
        for k, v in ev.get('list_vars', {}).items():
            if k.lower() not in DP_NAMES and len(v) >= 2:
                has_arrays = True
                arr_var = k
                break
        if has_arrays:
            break

    # priority: tree > graph > dp > array > simple
    if has_tree:
        viz_type = 'tree'
    elif has_graph:
        viz_type = 'graph'
    elif has_dp:
        viz_type = 'dp_table'
    elif has_arrays:
        viz_type = 'array'
    else:
        viz_type = 'simple'

    title, tc, sc = _analyze_complexity(code)

    # ═══════════ build visualization ═══════════

    if viz_type == 'tree':
        oid_info = {n['_obj_id']: {'sid': n['id'], 'val': n['val']}
                    for n in tree_nodes}
        return _build_tree_viz(
            code, raw_events, final_output,
            tree_nodes, tree_id_map, oid_info,
            title, tc, sc)

    if viz_type == 'graph':
        return _build_graph_viz(
            code, raw_events, final_output,
            graph_adj, graph_var, title, tc, sc)

    if viz_type == 'dp_table':
        return _build_dp_viz(
            code, raw_events, final_output,
            dp_var, title, tc, sc)

    if viz_type == 'array':
        return _build_array_viz(
            code, raw_events, final_output,
            arr_var, title, tc, sc)

    return _build_simple_viz(
        code, raw_events, final_output,
        title, tc, sc, error_msg)