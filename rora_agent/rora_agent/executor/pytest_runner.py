"""Pytest subprocess runner for test execution."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def run_pytest(test_path: str, test_function: str | None = None) -> dict[str, Any]:
    """
    Run pytest on the specified test file and return results.

    Args:
        test_path: Path to the test file or directory
        test_function: Optional specific test function to run

    Returns:
        Dictionary with test outcomes and statistics
    """
    path = Path(test_path)
    if not path.exists():
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": f"Test path not found: {test_path}"
        }

    # Build pytest command
    cmd = [
        sys.executable, "-m", "pytest",
        str(path),
        "--json-report",
        "--json-report-file=-",  # Output to stdout
        "-v",
        "--tb=short",
    ]

    # Add specific test function if provided
    if test_function:
        cmd.append(f"-k={test_function}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,  # 60 second timeout
            cwd=path.parent if path.is_file() else path
        )

        # Try to parse JSON report from stdout
        # pytest-json-report outputs JSON to file, we need different approach
        return parse_pytest_output(result.stdout, result.stderr, result.returncode)

    except subprocess.TimeoutExpired:
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": "Test execution timed out after 60 seconds"
        }
    except Exception as e:
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": str(e)
        }


def run_pytest_with_json_report(test_path: str, test_function: str | None = None) -> dict[str, Any]:
    """
    Run pytest with JSON report output.

    This version uses a temp file for the JSON report.
    """
    path = Path(test_path)
    if not path.exists():
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": f"Test path not found: {test_path}"
        }

    # Create temp file for JSON report
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json_report_path = f.name

    try:
        # Build pytest command
        cmd = [
            sys.executable, "-m", "pytest",
            str(path),
            f"--json-report-file={json_report_path}",
            "-v",
            "--tb=short",
        ]

        if test_function:
            cmd.append(f"-k={test_function}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=path.parent if path.is_file() else path
        )

        # Read JSON report
        report_path = Path(json_report_path)
        if report_path.exists():
            report = json.loads(report_path.read_text())
            return parse_json_report(report)
        else:
            # Fallback to parsing stdout
            return parse_pytest_output(result.stdout, result.stderr, result.returncode)

    except subprocess.TimeoutExpired:
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": "Test execution timed out after 60 seconds"
        }
    except Exception as e:
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": str(e)
        }
    finally:
        # Clean up temp file
        try:
            Path(json_report_path).unlink(missing_ok=True)
        except Exception:
            pass


def parse_json_report(report: dict[str, Any]) -> dict[str, Any]:
    """Parse pytest-json-report output."""
    outcomes = []

    tests = report.get("tests", [])
    for test in tests:
        outcome = {
            "name": test.get("nodeid", "unknown"),
            "outcome": test.get("outcome", "error"),
            "duration": test.get("duration", 0),
        }

        # Add failure info if present
        call = test.get("call", {})
        if call.get("longrepr"):
            outcome["traceback"] = call["longrepr"]
        if call.get("crash", {}).get("message"):
            outcome["message"] = call["crash"]["message"]

        outcomes.append(outcome)

    summary = report.get("summary", {})

    return {
        "outcomes": outcomes,
        "total": summary.get("total", len(tests)),
        "passed": summary.get("passed", 0),
        "failed": summary.get("failed", 0) + summary.get("error", 0),
    }


def parse_pytest_output(stdout: str, stderr: str, returncode: int) -> dict[str, Any]:
    """
    Parse pytest verbose output to extract test results.

    This is a fallback when JSON report is not available.
    """
    outcomes = []
    passed = 0
    failed = 0

    # Parse lines looking for test results
    # Format: test_file.py::test_name PASSED/FAILED/ERROR
    for line in stdout.splitlines():
        line = line.strip()

        if " PASSED" in line:
            name = line.split(" PASSED")[0].strip()
            outcomes.append({
                "name": name,
                "outcome": "passed",
                "duration": 0,
            })
            passed += 1
        elif " FAILED" in line:
            name = line.split(" FAILED")[0].strip()
            outcomes.append({
                "name": name,
                "outcome": "failed",
                "duration": 0,
                "message": extract_failure_message(stdout, name),
            })
            failed += 1
        elif " ERROR" in line:
            name = line.split(" ERROR")[0].strip()
            outcomes.append({
                "name": name,
                "outcome": "error",
                "duration": 0,
                "message": extract_failure_message(stdout, name),
            })
            failed += 1
        elif " SKIPPED" in line:
            name = line.split(" SKIPPED")[0].strip()
            outcomes.append({
                "name": name,
                "outcome": "skipped",
                "duration": 0,
            })

    # If no tests found but there was an error, report it
    if not outcomes and returncode != 0:
        error_msg = stderr if stderr else stdout
        return {
            "outcomes": [],
            "total": 0,
            "passed": 0,
            "failed": 0,
            "error": error_msg[:500] if error_msg else "Unknown error"
        }

    return {
        "outcomes": outcomes,
        "total": len(outcomes),
        "passed": passed,
        "failed": failed,
    }


def extract_failure_message(output: str, test_name: str) -> str:
    """Extract failure message for a specific test from pytest output."""
    # Look for the failure section
    lines = output.splitlines()
    in_failure = False
    failure_lines = []

    for line in lines:
        if test_name in line and ("FAILED" in line or "ERROR" in line):
            in_failure = True
            continue

        if in_failure:
            if line.startswith("_") and line.endswith("_"):
                # Start of another section
                break
            if line.startswith("=") and line.endswith("="):
                break
            failure_lines.append(line)

    return "\n".join(failure_lines[:10])  # Limit to first 10 lines
