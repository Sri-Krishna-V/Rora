"""Prompts for the test generation agent."""

from typing import Any


def get_test_generation_prompt(
    function_info: dict[str, Any],
    source_code: str,
    project_context: dict[str, Any],
    import_analysis: dict[str, Any],
    framework: str,
    retry_count: int = 0,
    previous_error: str | None = None,
) -> str:
    """
    Build the prompt for test generation.

    Args:
        function_info: Information about the target function
        source_code: Full source code of the file
        project_context: Project dependencies and patterns
        import_analysis: Required imports analysis
        framework: Test framework to use ('pytest' or 'unittest')
        retry_count: Number of retry attempts
        previous_error: Error from previous attempt, if any

    Returns:
        Formatted prompt string
    """
    func_name = function_info.get("name", "unknown")
    signature = function_info.get("signature", "")
    docstring = function_info.get("docstring", "")
    body = function_info.get("body", "")
    is_async = function_info.get("is_async", False)
    is_method = function_info.get("is_method", False)
    class_name = function_info.get("class_name")

    # Build framework-specific instructions
    if framework == "pytest":
        framework_instructions = """
Use pytest style tests with the following conventions:
- Test function names start with 'test_'
- Use plain assert statements
- Use pytest.raises() for exception testing
- Use @pytest.mark.parametrize for multiple test cases if appropriate
- Use @pytest.mark.asyncio for async functions
"""
    else:
        framework_instructions = """
Use unittest style tests with the following conventions:
- Create a test class inheriting from unittest.TestCase
- Test method names start with 'test_'
- Use self.assertEqual(), self.assertTrue(), self.assertRaises() etc.
- Use unittest.IsolatedAsyncioTestCase for async functions
"""

    # Build context about project patterns
    patterns_info = ""
    if project_context:
        patterns = project_context.get("test_patterns", [])
        if patterns:
            patterns_info = f"\nExisting test patterns in project: {', '.join(patterns)}"

    # Build retry context
    retry_context = ""
    if retry_count > 0 and previous_error:
        retry_context = f"""

IMPORTANT: Previous attempt failed with error:
{previous_error}

Please fix this issue in your response. Ensure the code has valid Python syntax.
"""

    # Build async context
    async_context = ""
    if is_async:
        async_context = "\nNote: This is an async function. Generate async tests appropriately."

    # Build class context
    class_context = ""
    if is_method and class_name:
        class_context = f"\nNote: This is a method of class '{class_name}'. You may need to instantiate the class or mock it."

    prompt = f"""You are an expert Python test writer. Generate comprehensive unit tests for the following function.

## Target Function

```python
{body}
```

Function signature: `{signature}`
{f"Docstring: {docstring}" if docstring else "No docstring provided."}
{async_context}
{class_context}

## Full Source File Context

```python
{source_code[:3000]}  # Truncated for context
```

## Test Requirements

{framework_instructions}
{patterns_info}

## Instructions

1. Generate tests that cover:
   - Normal/happy path cases
   - Edge cases (empty inputs, None values, boundary conditions)
   - Error cases (invalid inputs that should raise exceptions)

2. Use descriptive test names that explain what is being tested

3. Include necessary imports at the top of the code

4. Mock external dependencies (file I/O, network calls, databases) appropriately

5. Return ONLY the Python code, no explanations
{retry_context}

Generate the complete test code now:
"""

    return prompt


def get_mock_generation_prompt(
    function_info: dict[str, Any],
    dependencies: list[str],
) -> str:
    """
    Build prompt for generating mock setup code.

    Args:
        function_info: Information about the target function
        dependencies: List of external dependencies to mock

    Returns:
        Formatted prompt string
    """
    func_name = function_info.get("name", "unknown")

    prompt = f"""Generate mock setup code for testing the function '{func_name}'.

The function uses these external dependencies that need mocking:
{chr(10).join(f"- {dep}" for dep in dependencies)}

Generate pytest fixtures or unittest.mock setup code to mock these dependencies.
Return only the Python code.
"""

    return prompt
