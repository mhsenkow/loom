#!/usr/bin/env python3
"""
Extract all templates from TypeScript file and add to Python test file.
This script reads the TS file and generates Python Template definitions.
"""
import re
import sys

def extract_templates_from_ts(ts_content):
    """Extract template definitions from TypeScript content."""
    templates = []
    
    # Find all template objects
    # Pattern: { id: '...', name: '...', ... cells: [...] }
    template_pattern = r"\{\s*id:\s*['\"]([^'\"]+)['\"].*?name:\s*['\"]([^'\"]+)['\"].*?cells:\s*\[(.*?)\]\s*\}"
    
    matches = re.finditer(template_pattern, ts_content, re.DOTALL)
    
    for match in matches:
        template_id = match.group(1)
        template_name = match.group(2)
        cells_str = match.group(3)
        
        cells = parse_cells_simple(cells_str)
        templates.append({
            'id': template_id,
            'name': template_name,
            'cells': cells
        })
    
    return templates

def parse_cells_simple(cells_str):
    """Parse cells - simplified version that handles common patterns."""
    cells = []
    
    # Split by function calls
    # Look for: input(...), ai(...), output(...), etc.
    
    # Remove comments
    cells_str = re.sub(r'//.*', '', cells_str)
    
    # Find all function calls
    patterns = [
        (r"input\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]\)", 'data_input', {}),
        (r"output\(['\"]([^'\"]*)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?\)", 'log_entry', {}),
        (r"ai\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"](?:,\s*['\"]([AB])['\"](?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)", 'ai_processor', {}),
        (r"script\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]", 'script_execution', {}),
        (r"data\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]+)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)", 'data_loader', {}),
        (r"webFetch\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]+)['\"]?)?\)", 'web_fetch', {}),
        (r"imageGen\(['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]*)['\"]?)?\)", 'image_gen', {}),
        (r"vectorIndex\(['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]*)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)", 'vector_index', {}),
        (r"vectorSearch\(['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]*)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)", 'vector_search', {}),
    ]
    
    # Find conditional separately as it's more complex
    cond_pattern = r"conditional\(\s*['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"](?:,\s*([^,)]+))?(?:,\s*['\"]([^'\"]*)['\"])?(?:,\s*['\"]?([^'\"]+)['\"]?)?(?:,\s*(\d+))?(?:,\s*(\d+))?\)"
    
    # Simple approach: just extract what we can
    for pattern, cell_type, defaults in patterns:
        for match in re.finditer(pattern, cells_str):
            groups = match.groups()
            if cell_type == 'data_input':
                cells.append({
                    'type': cell_type,
                    'label': groups[0],
                    'content': groups[1] if len(groups) > 1 else '',
                    'input_mode': 'none'
                })
            elif cell_type == 'log_entry':
                cells.append({
                    'type': cell_type,
                    'label': groups[0] if groups[0] else 'OUTPUT',
                    'content': '',
                    'input_mode': groups[1] if len(groups) > 1 and groups[1] else 'previous'
                })
            elif cell_type == 'ai_processor':
                cells.append({
                    'type': cell_type,
                    'label': groups[0],
                    'content': groups[1] if len(groups) > 1 else '',
                    'model_slot': groups[2] if len(groups) > 2 and groups[2] else 'A',
                    'input_mode': groups[3] if len(groups) > 3 and groups[3] else 'previous'
                })
            # Add other types similarly...
    
    return cells

if __name__ == '__main__':
    ts_file = '/Users/powerox/Notebooks/loom/frontend/src/components/circuit/TemplatesSidebar.tsx'
    with open(ts_file, 'r') as f:
        content = f.read()
    
    templates = extract_templates_from_ts(content)
    print(f"Found {len(templates)} templates")
    for t in templates[:10]:
        print(f"  - {t['id']}: {t['name']} ({len(t['cells'])} cells)")
