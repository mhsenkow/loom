#!/usr/bin/env python3
"""
Extract templates from TypeScript file and convert to Python test format.
"""
import re
import json

def parse_template_file(ts_file_path):
    """Parse the TypeScript templates file and extract template definitions."""
    with open(ts_file_path, 'r') as f:
        content = f.read()
    
    # Find the NOTEBOOK_TEMPLATES array
    templates = []
    
    # Pattern to match template objects
    # We'll look for template definitions between { and }
    # This is a simplified parser - for production, use a proper TS parser
    
    # Extract template IDs and names first
    template_pattern = r"id:\s*['\"]([^'\"]+)['\"].*?name:\s*['\"]([^'\"]+)['\"]"
    
    matches = re.finditer(template_pattern, content, re.DOTALL)
    
    for match in matches:
        template_id = match.group(1)
        template_name = match.group(2)
        
        # Find the cells array for this template
        # Look for the cells: [ pattern after this template
        start_pos = match.end()
        # Find the next template or end of array
        next_template = content.find("id:", start_pos)
        if next_template == -1:
            template_section = content[start_pos:]
        else:
            template_section = content[start_pos:next_template]
        
        # Extract cells
        cells_match = re.search(r"cells:\s*\[(.*?)\]", template_section, re.DOTALL)
        if cells_match:
            cells_str = cells_match.group(1)
            # Parse cells - this is simplified
            cells = parse_cells(cells_str)
            templates.append({
                'id': template_id,
                'name': template_name,
                'cells': cells
            })
    
    return templates

def parse_cells(cells_str):
    """Parse cell definitions from the cells string."""
    cells = []
    
    # Pattern for different cell types
    patterns = {
        'input': r"input\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]\)",
        'ai': r"ai\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"](?:,\s*['\"]([^'\"]+)['\"](?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)",
        'output': r"output\(['\"]([^'\"]*)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?\)",
        'script': r"script\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]",
        'data': r"data\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]+)['\"](?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)",
        'conditional': r"conditional\(",
        'webFetch': r"webFetch\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]+)['\"]?)?\)",
        'imageGen': r"imageGen\(['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]*)['\"]?)?\)",
        'vectorIndex': r"vectorIndex\(['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]*)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)",
        'vectorSearch': r"vectorSearch\(['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]*)['\"]?(?:,\s*['\"]?([^'\"]+)['\"]?)?)?\)",
    }
    
    # This is a simplified parser - in reality, we'd need a proper AST parser
    # For now, let's just return empty cells and we'll manually add them
    return []

if __name__ == '__main__':
    ts_file = '/Users/powerox/Notebooks/loom/frontend/src/components/circuit/TemplatesSidebar.tsx'
    templates = parse_template_file(ts_file)
    print(f"Found {len(templates)} templates")
    for t in templates[:5]:
        print(f"  - {t['id']}: {t['name']}")
