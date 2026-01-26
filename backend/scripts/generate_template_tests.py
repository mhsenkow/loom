#!/usr/bin/env python3
"""
Script to extract all templates from TypeScript and generate Python test code.
This reads the TS file and outputs Python Template() definitions.
"""
import re
import json

def extract_template_id_name(line):
    """Extract template ID and name from a line."""
    id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", line)
    name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", line)
    if id_match and name_match:
        return id_match.group(1), name_match.group(1)
    return None, None

def parse_cell_call(call_str):
    """Parse a cell function call like input('LABEL', 'content') or ai('LABEL', 'prompt', 'A', 'previous')."""
    call_str = call_str.strip()
    
    # Remove comments
    call_str = re.sub(r'//.*', '', call_str)
    
    # Match function name
    func_match = re.match(r'(\w+)\(', call_str)
    if not func_match:
        return None
    
    func_name = func_match.group(1)
    
    # Extract arguments - handle nested quotes and commas
    args_str = call_str[len(func_name)+1:].rstrip(')').strip()
    
    # Simple parsing - split by comma but respect strings
    args = []
    current = ''
    in_string = False
    quote_char = None
    paren_depth = 0
    
    for char in args_str:
        if char in ("'", '"') and (not current or current[-1] != '\\'):
            if not in_string:
                in_string = True
                quote_char = char
            elif char == quote_char:
                in_string = False
                quote_char = None
        elif char == '(':
            paren_depth += 1
        elif char == ')':
            paren_depth -= 1
        elif char == ',' and not in_string and paren_depth == 0:
            args.append(current.strip())
            current = ''
            continue
        current += char
    
    if current.strip():
        args.append(current.strip())
    
    # Clean up args - remove quotes
    cleaned_args = []
    for arg in args:
        arg = arg.strip()
        if arg.startswith("'") and arg.endswith("'"):
            cleaned_args.append(arg[1:-1])
        elif arg.startswith('"') and arg.endswith('"'):
            cleaned_args.append(arg[1:-1])
        else:
            cleaned_args.append(arg)
    
    return func_name, cleaned_args

def convert_cell_to_python(func_name, args):
    """Convert a cell function call to Python TemplateCell."""
    if func_name == 'input':
        label = args[0] if len(args) > 0 else 'INPUT'
        content = args[1] if len(args) > 1 else ''
        return f'TemplateCell("data_input", "{label}", "{content}", input_mode="none")'
    
    elif func_name == 'output':
        label = args[0] if len(args) > 0 else 'OUTPUT'
        input_mode = args[1] if len(args) > 1 else 'previous'
        return f'TemplateCell("log_entry", "{label}", input_mode="{input_mode}")'
    
    elif func_name == 'ai':
        label = args[0] if len(args) > 0 else 'AI'
        content = args[1] if len(args) > 1 else ''
        model_slot = args[2] if len(args) > 2 else 'A'
        input_mode = args[3] if len(args) > 3 else 'previous'
        # Escape quotes in content
        content = content.replace('"', '\\"').replace("'", "\\'")
        return f'TemplateCell("ai_processor", "{label}", "{content}", "{model_slot}", "{input_mode}")'
    
    elif func_name == 'script':
        label = args[0] if len(args) > 0 else 'SCRIPT'
        content = args[1] if len(args) > 1 else ''
        input_mode = args[2] if len(args) > 2 else 'previous'
        content = content.replace('"', '\\"').replace("'", "\\'")
        return f'TemplateCell("script_execution", "{label}", "{content}", input_mode="{input_mode}")'
    
    elif func_name == 'data':
        label = args[0] if len(args) > 0 else 'DATA'
        file_path = args[1] if len(args) > 1 else ''
        read_mode = args[2] if len(args) > 2 else 'raw'
        input_mode = args[3] if len(args) > 3 else 'none'
        return f'TemplateCell("data_loader", "{label}", "{file_path}", read_mode="{read_mode}", input_mode="{input_mode}")'
    
    elif func_name == 'webFetch':
        label = args[0] if len(args) > 0 else 'FETCH'
        url = args[1] if len(args) > 1 else ''
        method = args[2] if len(args) > 2 else 'GET'
        input_mode = 'previous'  # webFetch typically uses previous
        url = url.replace('"', '\\"').replace("'", "\\'")
        return f'TemplateCell("web_fetch", "{label}", "{url}", fetch_method="{method}", input_mode="{input_mode}")'
    
    elif func_name == 'imageGen':
        label = args[0] if len(args) > 0 else 'IMAGE'
        negative_prompt = args[1] if len(args) > 1 else ''
        input_mode = 'previous'
        negative_prompt = negative_prompt.replace('"', '\\"').replace("'", "\\'")
        return f'TemplateCell("image_gen", "{label}", "{negative_prompt}", input_mode="{input_mode}")'
    
    elif func_name == 'vectorIndex':
        label = args[0] if len(args) > 0 else 'INDEX'
        file_path = args[1] if len(args) > 1 else ''
        input_mode = args[2] if len(args) > 2 else 'none'
        file_path = file_path.replace('"', '\\"').replace("'", "\\'")
        return f'TemplateCell("vector_index", "{label}", "{file_path}", input_mode="{input_mode}")'
    
    elif func_name == 'vectorSearch':
        label = args[0] if len(args) > 0 else 'SEARCH'
        query = args[1] if len(args) > 1 else ''
        input_mode = args[2] if len(args) > 2 else 'none'
        query = query.replace('"', '\\"').replace("'", "\\'")
        return f'TemplateCell("vector_search", "{label}", "{query}", input_mode="{input_mode}")'
    
    elif func_name == 'conditional':
        # conditional(label, type, value, onPass, onFail, inputMode, loopBackTo, loopBackMax)
        label = args[0] if len(args) > 0 else 'CONDITIONAL'
        cond_type = args[1] if len(args) > 1 else 'contains'
        cond_value = args[2] if len(args) > 2 else ''
        on_pass = args[3] if len(args) > 3 else None
        on_fail = args[4] if len(args) > 4 else None
        input_mode = args[5] if len(args) > 5 else 'previous'
        loop_back_to = args[6] if len(args) > 6 else None
        loop_back_max = args[7] if len(args) > 7 else None
        
        cond_value = cond_value.replace('"', '\\"').replace("'", "\\'")
        parts = [f'"conditional"', f'"{label}"']
        if cond_value:
            parts.append(f'condition_type="{cond_type}"')
            parts.append(f'condition_value="{cond_value}"')
        if on_pass:
            parts.append(f'on_pass="{on_pass}"')
        if on_fail:
            parts.append(f'on_fail="{on_fail}"')
        parts.append(f'input_mode="{input_mode}"')
        if loop_back_to:
            parts.append(f'loop_back_to={loop_back_to}')
        if loop_back_max:
            parts.append(f'loop_back_max={loop_back_max}')
        
        return f'TemplateCell({", ".join(parts)})'
    
    return None

def extract_templates(ts_file_path):
    """Extract all templates from TypeScript file."""
    with open(ts_file_path, 'r') as f:
        lines = f.readlines()
    
    templates = []
    current_template = None
    in_cells = False
    cells = []
    current_cell_call = ''
    paren_depth = 0
    
    for i, line in enumerate(lines):
        # Check for template start
        if 'id:' in line and 'name:' in line:
            template_id, template_name = extract_template_id_name(line)
            if template_id and template_name:
                if current_template:
                    templates.append({
                        'id': current_template['id'],
                        'name': current_template['name'],
                        'cells': cells
                    })
                current_template = {'id': template_id, 'name': template_name}
                cells = []
                in_cells = False
        
        # Check for cells array start
        if 'cells:' in line and '[' in line:
            in_cells = True
            continue
        
        # Parse cells
        if in_cells:
            # Check for end of cells array
            if ']' in line and not current_cell_call:
                in_cells = False
                continue
            
            # Accumulate cell function calls
            current_cell_call += line.strip()
            
            # Count parentheses to know when we have a complete call
            paren_depth += line.count('(') - line.count(')')
            
            if paren_depth == 0 and current_cell_call.strip():
                # Complete cell call found
                parsed = parse_cell_call(current_cell_call)
                if parsed:
                    func_name, args = parsed
                    python_cell = convert_cell_to_python(func_name, args)
                    if python_cell:
                        cells.append(python_cell)
                current_cell_call = ''
    
    # Add last template
    if current_template:
        templates.append({
            'id': current_template['id'],
            'name': current_template['name'],
            'cells': cells
        })
    
    return templates

if __name__ == '__main__':
    ts_file = '/Users/powerox/Notebooks/loom/frontend/src/components/circuit/TemplatesSidebar.tsx'
    templates = extract_templates(ts_file)
    
    print(f"# Found {len(templates)} templates\n")
    print("# Add these to TEMPLATES list in test_templates.py:\n")
    
    for t in templates:
        print(f"    # {t['name']}")
        print(f"    Template(\"{t['id']}\", \"{t['name']}\", [")
        for cell in t['cells']:
            print(f"        {cell},")
        print("    ]),")
        print()
