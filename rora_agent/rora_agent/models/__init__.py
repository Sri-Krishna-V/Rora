"""Pydantic models for IPC communication."""

from typing import Any
from pydantic import BaseModel


class FunctionInfo(BaseModel):
    """Information about a Python function extracted from AST."""
    name: str
    lineno: int
    end_lineno: int
    signature: str
    docstring: str | None = None
    decorators: list[str] = []
    is_async: bool = False
    is_method: bool = False
    class_name: str | None = None
    body: str = ""


class ParseFileResult(BaseModel):
    """Result of parsing a Python file."""
    functions: list[FunctionInfo] = []
    error: str | None = None


class GenerateTestParams(BaseModel):
    """Parameters for test generation."""
    function_info: dict[str, Any]  # FunctionInfo as dict from JSON
    source_code: str
    file_path: str
    project_root: str
    framework: str = "pytest"


class GenerateTestResult(BaseModel):
    """Result of test generation."""
    test_code: str = ""
    test_function_name: str = ""
    imports: list[str] = []
    error: str | None = None


class TestOutcome(BaseModel):
    """Outcome of a single test."""
    name: str
    outcome: str  # 'passed', 'failed', 'skipped', 'error'
    duration: float = 0.0
    message: str | None = None
    traceback: str | None = None


class RunTestResult(BaseModel):
    """Result of running tests."""
    outcomes: list[TestOutcome] = []
    total: int = 0
    passed: int = 0
    failed: int = 0
    error: str | None = None
