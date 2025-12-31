"""Tools for the LangGraph agent."""

import ast
from pathlib import Path
from typing import Any

from langchain_core.tools import tool


@tool
def parse_python_function(file_path: str, function_name: str) -> dict[str, Any]:
    """
    Parse a Python file and extract detailed information about a specific function.

    Args:
        file_path: Path to the Python file
        function_name: Name of the function to analyze

    Returns:
        Dictionary containing function details including signature, body, docstring
    """
    from rora_agent.parser.ast_parser import parse_python_file, extract_function_info

    result = parse_python_file(file_path)
    if result.get("error"):
        return {"error": result["error"]}

    for func in result.get("functions", []):
        if func.get("name") == function_name:
            return func

    return {"error": f"Function '{function_name}' not found in {file_path}"}


@tool
def gather_project_context(project_root: str) -> dict[str, Any]:
    """
    Gather project context including dependencies, test patterns, and configuration.

    Args:
        project_root: Root directory of the project

    Returns:
        Dictionary containing project context information
    """
    from rora_agent.parser.context_gatherer import gather_project_context as gather
    return gather(project_root)


@tool
def analyze_dependencies(source_code: str, function_name: str) -> dict[str, Any]:
    """
    Analyze the dependencies and imports used by a specific function.

    Args:
        source_code: Full source code of the file
        function_name: Name of the function to analyze

    Returns:
        Dictionary containing import analysis and dependencies
    """
    try:
        tree = ast.parse(source_code)

        # Collect all imports
        imports: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)

        # Find the function and analyze its body
        used_names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == function_name:
                    for child in ast.walk(node):
                        if isinstance(child, ast.Name):
                            used_names.add(child.id)
                        elif isinstance(child, ast.Attribute):
                            if isinstance(child.value, ast.Name):
                                used_names.add(child.value.id)

        # Identify external dependencies (things that might need mocking)
        external_deps = []
        mock_candidates = ["open", "requests", "urllib", "os", "sys", "subprocess",
                           "socket", "http", "json", "yaml", "sqlite3", "datetime"]

        for name in used_names:
            if any(mock in name.lower() for mock in mock_candidates):
                external_deps.append(name)

        return {
            "imports": imports,
            "used_names": list(used_names),
            "external_dependencies": external_deps,
            "needs_mocking": len(external_deps) > 0
        }

    except Exception as e:
        return {"error": str(e)}


@tool
def validate_python_syntax(code: str) -> dict[str, Any]:
    """
    Validate that Python code has correct syntax.

    Args:
        code: Python code to validate

    Returns:
        Dictionary with 'valid' boolean and optional 'error' message
    """
    try:
        ast.parse(code)
        return {"valid": True}
    except SyntaxError as e:
        return {
            "valid": False,
            "error": f"Line {e.lineno}: {e.msg}",
            "line": e.lineno
        }
