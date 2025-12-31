"""LangGraph agent for test generation."""

import os
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.state import CompiledStateGraph

from rora_agent.agent.state import TestGenerationState
from rora_agent.agent.prompts import get_test_generation_prompt
from rora_agent.parser.context_gatherer import gather_project_context, analyze_function_imports
from rora_agent.models.schemas import GenerateTestParams, FunctionInfo


def create_test_generation_graph() -> CompiledStateGraph:
    """Create the LangGraph for test generation."""

    # Define the graph
    builder = StateGraph(TestGenerationState)

    # Add nodes
    builder.add_node("analyze_function", analyze_function_node)
    builder.add_node("gather_context", gather_context_node)
    builder.add_node("generate_tests", generate_tests_node)
    builder.add_node("validate_code", validate_code_node)

    # Define edges
    builder.add_edge(START, "analyze_function")
    builder.add_edge("analyze_function", "gather_context")
    builder.add_edge("gather_context", "generate_tests")
    builder.add_edge("generate_tests", "validate_code")
    builder.add_conditional_edges(
        "validate_code",
        should_retry,
        {
            "retry": "generate_tests",
            "done": END
        }
    )

    return builder.compile()


def analyze_function_node(state: TestGenerationState) -> dict[str, Any]:
    """Analyze the target function and extract relevant information."""
    func_info = state["function_info"]
    source_code = state["source_code"]

    # Analyze imports needed for the function
    imports = analyze_function_imports(source_code, func_info.get("name", ""))

    return {
        "import_analysis": {
            "required_imports": imports,
            "function_signature": func_info.get("signature", ""),
            "has_docstring": bool(func_info.get("docstring")),
            "is_async": func_info.get("is_async", False),
            "is_method": func_info.get("is_method", False),
            "class_name": func_info.get("class_name"),
        }
    }


def gather_context_node(state: TestGenerationState) -> dict[str, Any]:
    """Gather project context for test generation."""
    project_root = state["project_root"]
    context = gather_project_context(project_root)

    return {"project_context": context}


def generate_tests_node(state: TestGenerationState) -> dict[str, Any]:
    """Generate test code using LLM."""
    # Get API key from environment
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return {
            "generated_code": "",
            "error": "GEMINI_API_KEY environment variable not set"
        }

    # Initialize LLM
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash-lite",
        google_api_key=api_key,
        temperature=0,  # Deterministic output
    )

    # Build prompt
    prompt = get_test_generation_prompt(
        function_info=state["function_info"],
        source_code=state["source_code"],
        project_context=state.get("project_context", {}),
        import_analysis=state.get("import_analysis", {}),
        framework=state["framework"],
        retry_count=state.get("retry_count", 0),
        previous_error=state.get("validation_error"),
    )

    # Generate tests
    response = llm.invoke(prompt)
    generated_code = extract_code_from_response(response.content)

    return {"generated_code": generated_code}


def validate_code_node(state: TestGenerationState) -> dict[str, Any]:
    """Validate generated test code syntax."""
    import ast

    code = state.get("generated_code", "")
    if not code:
        return {
            "validation_result": {"valid": False, "error": "No code generated"},
            "validation_error": "No code generated"
        }

    try:
        ast.parse(code)
        return {
            "validation_result": {"valid": True},
            "validation_error": None
        }
    except SyntaxError as e:
        return {
            "validation_result": {"valid": False, "error": str(e)},
            "validation_error": f"Syntax error at line {e.lineno}: {e.msg}",
            "retry_count": state.get("retry_count", 0) + 1
        }


def should_retry(state: TestGenerationState) -> str:
    """Determine if we should retry test generation."""
    validation = state.get("validation_result", {})
    retry_count = state.get("retry_count", 0)

    if validation.get("valid", False):
        return "done"

    if retry_count < 2:  # Max 2 retries
        return "retry"

    return "done"


def extract_code_from_response(content: str | Any) -> str:
    """Extract Python code from LLM response."""
    if not isinstance(content, str):
        content = str(content)

    # Look for code blocks
    if "```python" in content:
        start = content.find("```python") + 9
        end = content.find("```", start)
        if end > start:
            return content[start:end].strip()

    if "```" in content:
        start = content.find("```") + 3
        end = content.find("```", start)
        if end > start:
            return content[start:end].strip()

    # Return as-is if no code blocks found
    return content.strip()


def generate_tests_for_function(params: GenerateTestParams) -> dict[str, Any]:
    """
    Generate tests for a function using the LangGraph agent.

    Args:
        params: Parameters for test generation

    Returns:
        Dictionary with test_code, test_function_name, imports, and optional error
    """
    # Set API key from params if provided via environment
    # In production, this would be passed securely

    # Create and run the graph
    graph = create_test_generation_graph()

    initial_state: TestGenerationState = {
        "function_info": params.function_info,
        "source_code": params.source_code,
        "file_path": params.file_path,
        "project_root": params.project_root,
        "framework": params.framework,
        "project_context": {},
        "import_analysis": {},
        "generated_code": None,
        "validation_result": None,
        "validation_error": None,
        "retry_count": 0,
    }

    try:
        result = graph.invoke(initial_state)

        generated_code = result.get("generated_code", "")
        validation = result.get("validation_result", {})

        if not validation.get("valid", False) and not generated_code:
            return {
                "test_code": "",
                "test_function_name": "",
                "imports": [],
                "error": result.get("validation_error", "Failed to generate valid test code")
            }

        # Extract test function name from generated code
        func_name = params.function_info.get("name", "unknown")
        test_func_name = f"test_{func_name}"

        # Extract imports from generated code
        imports = extract_imports_from_code(generated_code)

        return {
            "test_code": generated_code,
            "test_function_name": test_func_name,
            "imports": imports,
        }

    except Exception as e:
        return {
            "test_code": "",
            "test_function_name": "",
            "imports": [],
            "error": str(e)
        }


def extract_imports_from_code(code: str) -> list[str]:
    """Extract import statements from generated code."""
    import ast

    imports = []
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(f"import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    names = ", ".join(alias.name for alias in node.names)
                    imports.append(f"from {node.module} import {names}")
    except Exception:
        pass

    return imports
