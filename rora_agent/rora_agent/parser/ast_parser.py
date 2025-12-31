"""Python AST parser for extracting function metadata."""

import ast
from pathlib import Path
from typing import Any


def parse_python_file(file_path: str) -> dict[str, Any]:
    """
    Parse a Python file and extract all function definitions.

    Args:
        file_path: Path to the Python file to parse

    Returns:
        Dictionary with 'functions' list and optional 'error' field
    """
    try:
        path = Path(file_path)
        if not path.exists():
            return {"functions": [], "error": f"File not found: {file_path}"}

        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=file_path)

        functions = []

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Extract methods from classes
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        func_info = extract_function_info(
                            item, source, class_name=node.name)
                        functions.append(func_info)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Check if this is a top-level function (not inside a class)
                # We need to check parent context
                pass

        # Do a proper traversal for top-level functions
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_info = extract_function_info(node, source)
                functions.append(func_info)
            elif isinstance(node, ast.ClassDef):
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        func_info = extract_function_info(
                            item, source, class_name=node.name)
                        functions.append(func_info)

        return {"functions": functions}

    except SyntaxError as e:
        return {"functions": [], "error": f"Syntax error: {e.msg} at line {e.lineno}"}
    except Exception as e:
        return {"functions": [], "error": str(e)}


def extract_function_info(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    source: str,
    class_name: str | None = None
) -> dict[str, Any]:
    """
    Extract detailed information about a function from its AST node.

    Args:
        node: The AST node representing the function
        source: The full source code of the file
        class_name: Name of the containing class, if any

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

    return {
        "name": node.name,
        "lineno": node.lineno,
        "end_lineno": node.end_lineno or node.lineno,
        "signature": signature,
        "docstring": docstring,
        "decorators": decorators,
        "is_async": isinstance(node, ast.AsyncFunctionDef),
        "is_method": class_name is not None,
        "class_name": class_name,
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
