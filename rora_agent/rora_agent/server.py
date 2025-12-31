"""JSON-RPC server for communication with VSCode extension."""

import json
import sys
from typing import Any

from rora_agent.parser.ast_parser import parse_python_file
from rora_agent.agent.graph import generate_tests_for_function
from rora_agent.executor.pytest_runner import run_pytest
from rora_agent.models.schemas import FunctionInfo, GenerateTestParams


def send_response(id: int | str | None, result: Any = None, error: Any = None) -> None:
    """Send a JSON-RPC response to stdout."""
    response: dict[str, Any] = {"jsonrpc": "2.0", "id": id}
    if error is not None:
        response["error"] = error
    else:
        response["result"] = result

    message = json.dumps(response)
    # JSON-RPC over stdio uses Content-Length header
    sys.stdout.write(f"Content-Length: {len(message)}\r\n\r\n{message}")
    sys.stdout.flush()


def handle_request(method: str, params: dict[str, Any], id: int | str | None) -> None:
    """Handle incoming JSON-RPC requests."""
    try:
        if method == "parse_file":
            file_path = params.get("file_path", "")
            result = parse_python_file(file_path)
            send_response(id, result)

        elif method == "generate_tests":
            gen_params = GenerateTestParams(**params)
            result = generate_tests_for_function(gen_params)
            send_response(id, result)

        elif method == "run_tests":
            test_path = params.get("test_path", "")
            test_function = params.get("test_function")
            result = run_pytest(test_path, test_function)
            send_response(id, result)

        elif method == "validate_syntax":
            code = params.get("code", "")
            result = validate_python_syntax(code)
            send_response(id, result)

        else:
            send_response(id, error={"code": -32601,
                          "message": f"Method not found: {method}"})

    except Exception as e:
        send_response(id, error={"code": -32603, "message": str(e)})


def validate_python_syntax(code: str) -> dict[str, Any]:
    """Validate Python code syntax using AST."""
    import ast
    try:
        ast.parse(code)
        return {"valid": True}
    except SyntaxError as e:
        return {
            "valid": False,
            "error": str(e.msg),
            "line": e.lineno
        }


def read_message() -> dict[str, Any] | None:
    """Read a JSON-RPC message from stdin."""
    # Read headers
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.readline()
        if not line:
            return None  # EOF
        line = line.strip()
        if not line:
            break  # End of headers
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip()] = value.strip()

    # Get content length
    content_length = int(headers.get("Content-Length", 0))
    if content_length == 0:
        return None

    # Read content
    content = sys.stdin.read(content_length)
    return json.loads(content)


def main() -> None:
    """Main entry point for the JSON-RPC server."""
    sys.stderr.write("Rora Agent server starting...\n")
    sys.stderr.flush()

    while True:
        try:
            message = read_message()
            if message is None:
                break

            method = message.get("method", "")
            params = message.get("params", {})
            msg_id = message.get("id")

            handle_request(method, params, msg_id)

        except json.JSONDecodeError as e:
            sys.stderr.write(f"JSON decode error: {e}\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"Server error: {e}\n")
            sys.stderr.flush()


if __name__ == "__main__":
    main()
