
import logging
import asyncio
from typing import Dict, Any, List, Set
from collections import deque, defaultdict

from app.services import storage
from app.services.module_executor import run_module
from app.services.ollama_client import ollama_client
from app.services.provider_manager import provider_manager
from app.services.vector_store import vector_store

logger = logging.getLogger("loom.circuit_runner")

class CircuitRunner:
    def __init__(self):
        pass

    async def run_circuit(self, circuit_name: str, initial_inputs: Dict[str, Any] = None):
        """
        Execute a defined circuit by name.
        """
        logger.info(f"Starting execution of circuit: {circuit_name}")
        
        # 1. Load circuit definition
        circuit = storage.get_circuit(circuit_name)
        if not circuit:
            raise ValueError(f"Circuit not found: {circuit_name}")
            
        cells = circuit.get("cells", [])
        if not cells:
            logger.warning(f"Circuit {circuit_name} has no cells.")
            return

        # 2. Build Dependency Graph
        # Map: cell_id -> Cell Data
        cell_map = {c["id"]: c for c in cells}
        
        # Adjacency list: parent_id -> list of child_ids (who depends on parent)
        # We need this to propagate updates, but for execution order we need the reverse (dependencies)
        
        # Dependency map: cell_id -> set of parent_ids (upstream dependencies)
        dependencies: Dict[str, Set[str]] = defaultdict(set)
        
        for cell in cells:
            c_id = cell["id"]
            # inputs is a list of objects like { moduleId: "source_id", portId: "..." }
            # In types/module.ts `inputs` is `Connection[]`.
            # We treat any connection in `inputs` as a dependency.
            inputs = cell.get("inputs", [])
            for conn in inputs:
                source_id = conn.get("moduleId")
                if source_id and source_id in cell_map:
                    dependencies[c_id].add(source_id)

        # 3. Topological Sort (Kahn's Algorithm)
        # Calculate in-degree (number of unsatisfied dependencies)
        in_degree = {c["id"]: 0 for c in cells}
        for c_id, parents in dependencies.items():
            in_degree[c_id] = len(parents)

        # Queue for cells with currently 0 dependencies (ready to run)
        queue = deque([c["id"] for c in cells if in_degree[c["id"]] == 0])
        
        execution_order = []
        
        while queue:
            node_id = queue.popleft()
            execution_order.append(node_id)
            
            # Find all children (nodes that depend on this node)
            # This is inefficient without a reverse graph, building reverse graph now
            children = []
            for other_id, parents in dependencies.items():
                if node_id in parents:
                    children.append(other_id)
            
            for child_id in children:
                in_degree[child_id] -= 1
                if in_degree[child_id] == 0:
                    queue.append(child_id)

        if len(execution_order) != len(cells):
            logger.error("Cycle detected in circuit, cannot execute.")
            raise ValueError("Circuit contains a cycle.")

        # 4. Execute in Order
        # Store outputs: cell_id -> output string (or dict)
        # Note: Frontend uses `outputs` field on module.
        execution_state: Dict[str, Any] = {}
        
        # Pre-populate state with initial inputs if provided (optional, for parameterized circuits)
        if initial_inputs:
            execution_state.update(initial_inputs)

        logger.info(f"Execution order: {execution_order}")

        for cell_id in execution_order:
            cell = cell_map[cell_id]
            cell_type = cell["type"]
            content = cell.get("content", "")
            
            # Resolve Inputs
            # Get data from upstream cells
            # In frontend, `inputs` array maps to specific upstream connections.
            # module_executor.run_module expects `inputs` dict.
            # We need to consolidate upstream outputs into a single input string or dict.
            
            # Currently module_executor generally takes `inputs` dict and looks for "input" key.
            # If multiple inputs, how are they combined?
            # Frontend logic usually takes the first valid input or joins them.
            
            cell_inputs = {}
            input_values = []
            
            for conn in cell.get("inputs", []):
                source_id = conn.get("moduleId")
                if source_id in execution_state:
                    val = execution_state[source_id]
                    input_values.append(str(val))
            
            # Simple consolidation: Join with newlines if multiple, else single
            combined_input = "\n".join(input_values)
            cell_inputs["input"] = combined_input
            
            # Special handling based on type if needed
            # e.g. for vector search, might want specific args
            
            try:
                logger.info(f"Executing cell {cell_id} ({cell_type})...")
                result = await run_module(
                    module_type=cell_type,
                    content=content,
                    inputs=cell_inputs,
                    ollama=ollama_client,
                    # model=... (fetch from slots or metadata?)
                    vector_store=vector_store,
                    provider_manager=provider_manager
                )
                
                execution_state[cell_id] = result
                logger.info(f"Cell {cell_id} complete.")
                
            except Exception as e:
                logger.error(f"Error executing cell {cell_id}: {e}")
                # Stop execution on error? Or continue independent branches?
                # For now, stop.
                raise e

        # 5. Done
        logger.info(f"Circuit {circuit_name} execution completed.")
        return execution_state

# Singleton
circuit_runner = CircuitRunner()
