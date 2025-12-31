"""State schema for the test generation agent."""

from typing import TypedDict, Any


class TestGenerationState(TypedDict):
    """State for the test generation LangGraph agent."""

    # Input parameters
    function_info: dict[str, Any]
    source_code: str
    file_path: str
    project_root: str
    framework: str  # 'pytest' or 'unittest'

    # Gathered context
    project_context: dict[str, Any]
    import_analysis: dict[str, Any]

    # Generated output
    generated_code: str | None
    validation_result: dict[str, Any] | None
    validation_error: str | None
    retry_count: int
