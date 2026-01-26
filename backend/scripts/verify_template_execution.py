#!/usr/bin/env python3
"""Quick test to verify templates actually execute all cells."""
import asyncio
import sys
sys.path.insert(0, '/Users/powerox/Notebooks/loom/backend')

from tests.test_templates import TemplateExecutor, TEMPLATES

async def test_one_template():
    """Test one template and show detailed execution."""
    template = TEMPLATES[0]  # Steel Man template
    executor = TemplateExecutor()
    
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
        print(f"  Input mode: {cell.input_mode}")
        print(f"  Input length: {len(input_value)} chars")
        
        # Execute cell
        try:
            result = await executor.execute_cell(cell, input_value)
            outputs[i] = result
            print(f"  ✓ Executed successfully")
            print(f"  Output length: {len(result)} chars")
            print(f"  Output preview: {result[:100]}...")
            
            # Handle conditional loop-back
            if cell.type == "conditional" and cell.loop_back_to:
                passed = executor.evaluate_conditional(cell, input_value)
                if not passed:
                    count = loop_counts.get(i, 0)
                    max_loops = cell.loop_back_max or 3
                    print(f"  Conditional failed, loop count: {count}/{max_loops}")
                    if count >= max_loops:
                        outputs[i] = cell.on_fail or ""
                        i += 1
                        continue
                    loop_counts[i] = count + 1
                    i = cell.loop_back_to - 2
                    print(f"  ↻ Looping back to cell {i+1}")
                    continue
            
            i += 1
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            break
        
        print()
    
    print(f"{'='*60}")
    print(f"Execution complete!")
    print(f"Total iterations: {iteration}")
    print(f"Cells executed: {len(outputs)}/{len(template.cells)}")
    print(f"Final output: {outputs.get(len(template.cells) - 1, 'N/A')[:200]}...")
    print(f"{'='*60}\n")
    
    assert len(outputs) == len(template.cells), f"Expected {len(template.cells)} cells, got {len(outputs)}"
    assert outputs.get(len(template.cells) - 1), "No final output"

if __name__ == '__main__':
    asyncio.run(test_one_template())
