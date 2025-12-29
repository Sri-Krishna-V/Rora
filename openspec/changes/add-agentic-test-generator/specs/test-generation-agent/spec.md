# Spec: Test Generation Agent

## Overview

This capability defines the LangChain/LangGraph-based AI agent that generates Python unit tests using Gemini 2.5 Flash Lite.

---

## ADDED Requirements

### Requirement: Agent Initialization

The agent MUST be configurable with user-specified settings.

#### Scenario: Default initialization with Gemini

- **Given** the user has configured `rora.geminiApiKey` in settings
- **When** the agent is initialized
- **Then** it connects to Gemini 2.5 Flash Lite via langchain-google-genai
- **And** the model temperature is set to 0 for consistency

#### Scenario: Test framework selection

- **Given** the user sets `rora.testFramework` to "unittest"
- **When** tests are generated
- **Then** the agent produces unittest-style test classes
- **And** uses `unittest.TestCase` as base class

#### Scenario: Missing API key

- **Given** `rora.geminiApiKey` is not configured
- **When** the user triggers test generation
- **Then** an error notification prompts the user to configure the API key
- **And** no LLM call is made

---

### Requirement: Function Analysis

The agent MUST extract comprehensive function metadata for context.

#### Scenario: Parse function signature

- **Given** function `def calculate_tax(income: float, rate: float = 0.2) -> float`
- **When** the agent analyzes it
- **Then** it extracts: name, parameters with types and defaults, return type

#### Scenario: Parse docstring

- **Given** a function has a Google-style docstring with Args and Returns sections
- **When** the agent analyzes it
- **Then** it extracts the docstring and understands parameter purposes

#### Scenario: Parse decorators

- **Given** a function has `@staticmethod` and `@lru_cache(maxsize=100)` decorators
- **When** the agent analyzes it
- **Then** it notes the decorators and adjusts test strategy accordingly

#### Scenario: Parse function body

- **Given** a function body contains conditional branches and loops
- **When** the agent analyzes it
- **Then** it identifies code paths to generate edge case tests

---

### Requirement: Project Context Gathering

The agent MUST understand project dependencies and patterns.

#### Scenario: Read requirements.txt

- **Given** a project has `requirements.txt` with `requests==2.28.0`
- **When** the agent gathers context
- **Then** it knows `requests` is available for mocking in tests

#### Scenario: Read pyproject.toml

- **Given** a project uses Poetry with dependencies in `pyproject.toml`
- **When** the agent gathers context
- **Then** it extracts dependencies from `[tool.poetry.dependencies]`

#### Scenario: Detect existing test patterns

- **Given** a project has existing tests in `tests/` using fixtures
- **When** the agent gathers context
- **Then** it samples existing test style for consistency
- **And** notes available fixtures from `conftest.py`

#### Scenario: Handle no dependency file

- **Given** a project has no `requirements.txt` or `pyproject.toml`
- **When** the agent gathers context
- **Then** it proceeds with minimal context
- **And** generates self-contained tests

---

### Requirement: Test Code Generation

The agent MUST generate valid, comprehensive test code.

#### Scenario: Generate pytest tests

- **Given** framework is "pytest" and function `add(a, b)` returns `a + b`
- **When** tests are generated
- **Then** output includes:

  ```python
  def test_add_positive_numbers():
      assert add(2, 3) == 5

  def test_add_negative_numbers():
      assert add(-1, -2) == -3

  def test_add_zero():
      assert add(0, 0) == 0
  ```

#### Scenario: Generate unittest tests

- **Given** framework is "unittest" and function `multiply(a, b)`
- **When** tests are generated
- **Then** output includes:

  ```python
  class TestMultiply(unittest.TestCase):
      def test_multiply_positive(self):
          self.assertEqual(multiply(2, 3), 6)
  ```

#### Scenario: Generate tests with mocking

- **Given** function `fetch_user(user_id)` calls `requests.get()`
- **When** tests are generated
- **Then** output includes mocking of `requests.get`
- **And** tests both success and error responses

#### Scenario: Generate async test

- **Given** function `async def fetch_data(url)` is async
- **When** tests are generated
- **Then** output uses `@pytest.mark.asyncio` decorator
- **And** test function is also async

#### Scenario: Handle exception testing

- **Given** function `divide(a, b)` raises `ZeroDivisionError` when `b == 0`
- **When** tests are generated
- **Then** output includes:

  ```python
  def test_divide_by_zero_raises():
      with pytest.raises(ZeroDivisionError):
          divide(10, 0)
  ```

---

### Requirement: Code Validation

Generated code MUST be syntactically valid Python.

#### Scenario: Valid syntax check

- **Given** the agent generates test code
- **When** validation runs
- **Then** code is parsed with Python AST
- **And** validation passes if no `SyntaxError`

#### Scenario: Retry on invalid syntax

- **Given** the agent generates code with syntax error
- **When** AST parsing fails
- **Then** the agent retries generation with error feedback
- **And** retries up to 2 times before failing

#### Scenario: Import completeness check

- **Given** generated tests use `pytest.raises`
- **When** validation runs
- **Then** it verifies `import pytest` is present
- **And** adds missing imports if needed

---

### Requirement: Agent Orchestration

The LangGraph agent MUST coordinate tools in correct sequence.

#### Scenario: Standard generation flow

- **Given** user requests test generation for function `validate_email`
- **When** the agent executes
- **Then** it:
  1. Parses function details
  2. Gathers project context
  3. Analyzes imports
  4. Generates test code
  5. Validates syntax
  6. Returns result

#### Scenario: Streaming progress

- **Given** test generation is in progress
- **When** each agent step completes
- **Then** progress updates are streamed to the extension
- **And** user sees "Analyzing function...", "Generating tests...", etc.

#### Scenario: Timeout handling

- **Given** Gemini API is slow or unresponsive
- **When** 30 seconds elapse without response
- **Then** the agent times out
- **And** user sees "Generation timed out. Please retry."

---

### Requirement: Automatic Mocking

The agent MUST automatically mock common external dependencies.

#### Scenario: Mock HTTP requests library

- **Given** function `fetch_data(url)` imports and uses `requests.get()`
- **When** tests are generated
- **Then** output includes `@patch('module.requests.get')` or `mocker.patch()`
- **And** mock returns configurable response data

#### Scenario: Mock httpx async client

- **Given** function uses `httpx.AsyncClient().get()`
- **When** tests are generated
- **Then** output includes async-compatible mock
- **And** uses `pytest-asyncio` fixtures

#### Scenario: Mock file I/O operations

- **Given** function `read_config(path)` uses `open()` or `pathlib.Path.read_text()`
- **When** tests are generated
- **Then** output includes `@patch('builtins.open')` or path mock
- **And** mock provides test file content

#### Scenario: Mock database calls

- **Given** function `get_user(id)` uses SQLAlchemy `session.query()`
- **When** tests are generated
- **Then** output mocks the session object
- **And** returns mock model instances

---

### Requirement: Complex Type Handling

The agent MUST handle complex type hints gracefully.

#### Scenario: Generic type with TypeVar

- **Given** function `def first(items: List[T]) -> T` uses TypeVar
- **When** tests are generated
- **Then** agent uses concrete types like `List[int]`, `List[str]` in tests
- **And** adds comment: `# Note: Using concrete types for generic TypeVar`

#### Scenario: Protocol type hint

- **Given** function accepts `def process(handler: SupportsRead)` Protocol
- **When** tests are generated
- **Then** agent creates a simple mock object implementing required methods
- **And** test verifies function works with protocol-compatible object

#### Scenario: Union types

- **Given** function `def parse(value: str | int | None) -> Result`
- **When** tests are generated
- **Then** agent generates separate test cases for each union member

#### Scenario: Deeply nested generics

- **Given** function has `Dict[str, List[Tuple[int, Optional[str]]]]` parameter
- **When** tests are generated
- **Then** agent simplifies to representative test values
- **And** does not fail on complex type inference

---

### Requirement: API Key Resolution

The agent MUST resolve API keys from multiple sources.

#### Scenario: Environment variable takes priority

- **Given** `GOOGLE_API_KEY` env var is set
- **And** `rora.geminiApiKey` setting is also configured
- **When** agent initializes
- **Then** it uses the environment variable value

#### Scenario: Fall back to VSCode setting

- **Given** no `GOOGLE_API_KEY` or `GEMINI_API_KEY` env var exists
- **And** `rora.geminiApiKey` is configured in settings
- **When** agent initializes
- **Then** it uses the VSCode setting value

#### Scenario: First-run wizard

- **Given** no API key is found in env or settings
- **When** user first triggers test generation
- **Then** a wizard dialog prompts for API key entry
- **And** offers to save to workspace or user settings

---

### Requirement: Sequential Generation Queue

Test generation MUST process one function at a time.

#### Scenario: Single generation request

- **Given** user clicks "Generate" on function `calculate_sum`
- **When** no other generation is in progress
- **Then** generation starts immediately
- **And** CodeLens shows "Generating..."

#### Scenario: Queue additional requests

- **Given** generation for `calculate_sum` is in progress
- **When** user clicks "Generate" on `validate_input`
- **Then** request is queued
- **And** status bar shows "Generating tests for calculate_sum... (1 queued)"

#### Scenario: Process queue in order

- **Given** queue contains `[validate_input, parse_json]`
- **When** current generation completes
- **Then** `validate_input` generation starts next
- **And** queue count decrements to "(0 queued)"

#### Scenario: Cancel queued request

- **Given** `parse_json` is queued for generation
- **When** user clicks "Cancel" on the queued CodeLens
- **Then** request is removed from queue
- **And** CodeLens reverts to "Generate"
