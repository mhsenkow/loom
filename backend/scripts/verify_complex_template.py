#!/usr/bin/env python3
"""Test a complex template with conditionals to verify full execution."""
import asyncio
import sys
sys.path.insert(0, '/Users/powerox/Notebooks/loom/backend')

from tests.test_templates import TemplateExecutor, TEMPLATES

async def test_complex_template():
    """Test a template with conditionals and loop-backs."""
    # Find the five-whys-root-gate template (has conditional with loop-back)
    template = None
    for t in TEMPLATES:
        if t.id == 'five-whys-root-gate':
            template = t
            break
    
    if not template:
        print("Template not found!")
        return
    
    executor = TemplateExecutor()
    
    # Mock the AI to return "NO" first (so it loops), then "YES" (so it passes)
    call_count = [0]
    async def mock_ai_with_loop(prompt, model=None):
        call_count[0] += 1
        # For the conditional check, return NO first (will loop), then YES (passes)
        if 'root cause' in prompt.lower() or 'symptom' in prompt.lower():
            if call_count[0] <= 2:
                return "NO"  # First attempt fails, loops back
            else:
                return "YES"  # Second attempt passes
        return f"Mock AI response {call_count[0]}"
    
    executor.ollama.chat = mock_ai_with_loop
    
    print(f"\n{'='*60}")
    print(f"Testing template: {template.name} ({template.id})")
    print(f"Cells: {len(template.cells)}")
    print(f"{'='*60}\n")
    
    outputs = {}
    loop_counts = {}
    iteration = 0
    max_iterations = 100
    
    i = 0
    while i < len(template.cells) and iteration < max_iterations:
        iteration += 1
        cell = template.cells[i]
        
        # Gather input
        input_value = executor.gather_input(i, template.cells, outputs)
        
        print(f"Cell {i+1}/{len(template.cells)}: {cell.label} ({cell.type})")
        if cell.type == "conditional":
            print(f"  Condition type: {cell.condition_type}")
            print(f"  Loop back to: {cell.loop_back_to}")
        
        # Execute cell
        try:
            result = await executor.execute_cell(cell, input_value)
            outputs[i] = result
            
            # Handle conditional loop-back
            if cell.type == "conditional" and cell.loop_back_to:
                passed = executor.evaluate_conditional(cell, input_value)
                print(f"  Conditional result: {'PASS' if passed else 'FAIL'}")
                if not passed:
                    count = loop_counts.get(i, 0)
                    max_loops = cell.loop_back_max or 3
                    print(f"  Loop count: {count}/{max_loops}")
                    if count >= max_loops:
                        outputs[i] = cell.on_fail or ""
                        print(f"  Max loops reached, using on_fail: {outputs[i]}")
                        i += 1
                        continue
                    loop_counts[i] = count + 1
                    old_i = i
                    i = cell.loop_back_to - 2
                    print(f"  ↻ Looping back from cell {old_i+1} to cell {i+1}")
                    continue
            
            print(f"  ✓ Executed, output length: {len(result)} chars")
            i += 1
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            break
        
        print()
    
    print(f"{'='*60}")
    print(f"Execution complete!")
    print(f"Total iterations: {iteration}")
    print(f"Cells executed: {len(outputs)}/{len(template.cells)}")
    print(f"Loop counts: {loop_counts}")
    print(f"{'='*60}\n")
    
    assert len(outputs) == len(template.cells), f"Expected {len(template.cells)} cells, got {len(outputs)}"

if __name__ == '__main__':
    asyncio.run(test_complex_template())
