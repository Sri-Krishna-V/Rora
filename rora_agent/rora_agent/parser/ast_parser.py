"""Python AST parser for extracting function metadata."""

import ast
from pathlib import Path
from typing import Any


def parse_python_file(file_path: str, include_nested: bool = False) -> dict[str, Any]:
    """
    Parse a Python file and extract all function definitions.

    Args:
        file_path: Path to the Python file to parse
        include_nested: If True, include nested functions (functions defined inside other functions)

    Returns:
        Dictionary with 'functions' list and optional 'error' field
    """
    try:
        path = Path(file_path)
        if not path.exists():
            return {"functions": [], "error": f"File not found: {file_path}"}

        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=file_path)

        functions: list[dict[str, Any]] = []
        _extract_functions_recursive(
            tree.body, source, functions, include_nested=include_nested)

        return {"functions": functions}

    except SyntaxError as e:
        return {"functions": [], "error": f"Syntax error: {e.msg} at line {e.lineno}"}
    except Exception as e:
        return {"functions": [], "error": str(e)}


def _extract_functions_recursive(
    nodes: list[ast.stmt],
    source: str,
    functions: list[dict[str, Any]],
    class_name: str | None = None,
    parent_function: str | None = None,
    include_nested: bool = False,
) -> None:
    """
    Recursively extract function definitions from AST nodes.

    Args:
        nodes: List of AST statement nodes to process
        source: The full source code of the file
        functions: List to append extracted function info to
        class_name: Name of the containing class, if any
        parent_function: Name of the containing function, if any (for nested functions)
        include_nested: If True, include nested functions
    """
    for node in nodes:
        if isinstance(node, ast.ClassDef):
            # Process methods inside the class
            _extract_functions_recursive(
                node.body,
                source,
                functions,
                class_name=node.name,
                parent_function=parent_function,
                include_nested=include_nested,
            )
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Extract function info
            func_info = extract_function_info(
                node, source, class_name=class_name, parent_function=parent_function
            )
            functions.append(func_info)

            # Optionally process nested functions
            if include_nested:
                _extract_functions_recursive(
                    node.body,
                    source,
                    functions,
                    class_name=class_name,
                    parent_function=node.name,
                    include_nested=include_nested,
                )


def extract_function_info(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    source: str,
    class_name: str | None = None,
    parent_function: str | None = None,
) -> dict[str, Any]:
    """
    Extract detailed information about a function from its AST node.

    Args:
        node: The AST node representing the function
        source: The full source code of the file
        class_name: Name of the containing class, if any
        parent_function: Name of the containing function, if this is a nested function

    Returns:
        Dictionary containing function metadata
    """
    # Get function signature
    signature = get_function_signature(node)

    # Get docstring
    docstring = ast.get_docstring(node)

    # Get decorators
    decorators = []
    for decorator in node.decorator_list:
        if isinstance(decorator, ast.Name):
            decorators.append(decorator.id)
        elif isinstance(decorator, ast.Attribute):
            decorators.append(ast.unparse(decorator))
        elif isinstance(decorator, ast.Call):
            if isinstance(decorator.func, ast.Name):
                decorators.append(decorator.func.id)
            elif isinstance(decorator.func, ast.Attribute):
                decorators.append(ast.unparse(decorator.func))

    # Get function body as source
    source_lines = source.splitlines()
    start_line = node.lineno - 1
    end_line = node.end_lineno if node.end_lineno else start_line + 1
    body_lines = source_lines[start_line:end_line]
    body = "\n".join(body_lines)

    # Determine if this is a nested function
    is_nested = parent_function is not None

    return {
        "name": node.name,
        "lineno": node.lineno,
        "end_lineno": node.end_lineno or node.lineno,
        "signature": signature,
        "docstring": docstring,
        "decorators": decorators,
        "is_async": isinstance(node, ast.AsyncFunctionDef),
        "is_method": class_name is not None,
        "is_nested": is_nested,
        "class_name": class_name,
        "parent_function": parent_function,
        "body": body,
    }


def get_function_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """
    Generate a function signature string from AST node.

    Args:
        node: The AST node representing the function

    Returns:
        String representation of the function signature
    """
    args = node.args
    params = []

    # Regular positional arguments
    defaults_offset = len(args.args) - len(args.defaults)

    for i, arg in enumerate(args.args):
        param = arg.arg
        if arg.annotation:
            param += f": {ast.unparse(arg.annotation)}"

        # Add default value if present
        default_idx = i - defaults_offset
        if default_idx >= 0 and default_idx < len(args.defaults):
            default = args.defaults[default_idx]
            param += f" = {ast.unparse(default)}"

        params.append(param)

    # *args
    if args.vararg:
        vararg = f"*{args.vararg.arg}"
        if args.vararg.annotation:
            vararg += f": {ast.unparse(args.vararg.annotation)}"
        params.append(vararg)

    # Keyword-only arguments
    kw_defaults_map = {
        i: d for i, d in enumerate(args.kw_defaults) if d is not None
    }
    for i, arg in enumerate(args.kwonlyargs):
        param = arg.arg
        if arg.annotation:
            param += f": {ast.unparse(arg.annotation)}"
        if i in kw_defaults_map:
            param += f" = {ast.unparse(kw_defaults_map[i])}"
        params.append(param)

    # **kwargs
    if args.kwarg:
        kwarg = f"**{args.kwarg.arg}"
        if args.kwarg.annotation:
            kwarg += f": {ast.unparse(args.kwarg.annotation)}"
        params.append(kwarg)

    # Return annotation
    returns = ""
    if node.returns:
        returns = f" -> {ast.unparse(node.returns)}"

    async_prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
    return f"{async_prefix}def {node.name}({', '.join(params)}){returns}"
