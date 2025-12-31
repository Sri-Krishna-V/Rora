# Design: Agentic Test Generator Architecture

## Overview

This document describes the architectural decisions for the Rora VSCode extension, a LangChain-powered agentic test generator for Python.

## System Components

### 1. Extension Host (TypeScript)

The VSCode extension runs in the extension host process and handles:

- UI rendering (CodeLens, decorations, webview panels)
- User interaction (commands, settings)
- File system operations
- Communication with Python backend

**Key Modules:**

```
src/
├── extension.ts           # Entry point, activation
├── codelens/
│   ├── provider.ts        # CodeLensProvider implementation
│   └── commands.ts        # Command handlers
├── panel/
│   ├── TestPanel.ts       # Webview panel controller
│   └── webview/           # React/Svelte UI for panel
├── decorations/
│   └── resultDecorator.ts # Pass/fail gutter icons
├── services/
│   ├── pythonBridge.ts    # IPC with Python backend
│   ├── testRegistry.ts    # Function-to-test mapping
│   └── configService.ts   # Settings management
└── utils/
    └── fileUtils.ts       # Path helpers, file I/O
```

### 2. Python Backend

A standalone Python process that handles:

- AST parsing of Python source files
- LangGraph agent execution
- Test execution via pytest subprocess

**Key Modules:**

```
rora_agent/
├── __init__.py
├── server.py              # JSON-RPC server (stdio)
├── parser/
│   ├── ast_parser.py      # Function extraction
│   └── context_gatherer.py # Project dependency analysis
├── agent/
│   ├── graph.py           # LangGraph definition
│   ├── tools.py           # Agent tools
│   ├── prompts.py         # System prompts
│   └── state.py           # Agent state schema
├── executor/
│   ├── pytest_runner.py   # Subprocess test execution
│   └── result_parser.py   # JSON result parsing
└── models/
    └── schemas.py         # Pydantic models for IPC
```

## Inter-Process Communication

### Protocol Choice: JSON-RPC over stdio

**Rationale:**

- No port conflicts (vs HTTP)
- Lower latency than HTTP
- Native support in VSCode extension API (`child_process.spawn`)
- Language-agnostic protocol

**Message Flow:**

```
┌──────────────┐         JSON-RPC         ┌──────────────┐
│   VSCode     │ ──────────────────────►  │   Python     │
│  Extension   │  {"method": "parse",     │   Backend    │
│              │   "params": {...}}       │              │
│              │ ◄──────────────────────  │              │
│              │  {"result": {...}}       │              │
└──────────────┘                          └──────────────┘
```

### API Methods

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `parse_file` | `{filePath: string}` | `Function[]` | Extract functions from Python file |
| `generate_tests` | `{function: Function, projectRoot: string, framework: string}` | `GeneratedTest` | Generate tests via agent |
| `run_tests` | `{testPath: string}` | `TestResult[]` | Execute tests and return results |
| `validate_syntax` | `{code: string}` | `{valid: boolean, error?: string}` | Validate Python syntax |

## LangGraph Agent Design

### State Schema

```python
from typing import TypedDict, List, Optional
from langchain_core.messages import BaseMessage

class TestGenerationState(TypedDict):
    messages: List[BaseMessage]
    function_info: dict           # Parsed function details
    project_context: dict         # Dependencies, patterns
    import_analysis: dict         # Required imports for test
    generated_code: Optional[str] # Final test code
    validation_result: Optional[dict]
```

### Graph Structure

```
                    ┌─────────────────┐
                    │     START       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Analyze Function│
                    │  (parse tool)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Gather Context  │
                    │ (context tool)  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Generate Tests  │
                    │  (LLM call)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
              ┌─────│ Validate Syntax │─────┐
              │     └─────────────────┘     │
              │ valid                 invalid│
              ▼                             ▼
     ┌────────────────┐           ┌─────────────────┐
     │     END        │           │ Retry Generation│
     │ (return code)  │           │  (max 2 times)  │
     └────────────────┘           └────────┬────────┘
                                           │
                                           └──► (back to Generate)
```

### Agent Tools

#### 1. `parse_python_function`

```python
@tool
def parse_python_function(file_path: str, function_name: str) -> dict:
    """Extract detailed information about a Python function.
    
    Returns:
        - name: Function name
        - signature: Full signature with type hints
        - docstring: Function docstring if present
        - body: Function body code
        - decorators: List of decorators
        - is_async: Whether function is async
        - is_method: Whether function is a class method
        - class_name: Parent class name if method
        - line_number: Starting line in source file
    """
```

#### 2. `gather_project_context`

```python
@tool
def gather_project_context(project_root: str) -> dict:
    """Gather project dependencies and testing patterns.
    
    Returns:
        - dependencies: List of installed packages
        - test_framework: Detected framework (pytest/unittest)
        - existing_patterns: Sample test patterns from codebase
        - conftest: Fixtures from conftest.py if present
    """
```

#### 3. `analyze_imports`

```python
@tool
def analyze_imports(file_path: str, function_name: str) -> dict:
    """Analyze imports needed to test the function.
    
    Returns:
        - direct_imports: Modules imported by the file
        - used_by_function: Subset actually used in function
        - mock_candidates: External calls that may need mocking
    """
```

### Prompt Engineering

**System Prompt:**

```
You are a senior Python test architect. Generate comprehensive unit tests 
following these principles:

1. Use {framework} style (pytest or unittest)
2. Test happy path, edge cases, and error conditions
3. Use descriptive test names: test_<function>_<scenario>_<expected>
4. Include docstrings explaining what each test verifies
5. Use appropriate assertions (assertEqual, assertTrue, assertRaises)
6. Mock external dependencies (I/O, network, databases)
7. Keep tests independent and idempotent
8. Follow AAA pattern: Arrange, Act, Assert

Given the function details and project context, generate complete test code.
```

## Test Execution Strategy

### pytest Integration

**Command:**

```bash
python -m pytest {test_file} \
    --json-report \
    --json-report-file={tmp_file} \
    -v \
    --tb=short \
    -x  # Stop on first failure (optional)
```

**JSON Report Structure:**

```json
{
  "summary": {
    "passed": 5,
    "failed": 1,
    "total": 6
  },
  "tests": [
    {
      "nodeid": "rora_tests/test_utils.py::test_calculate_sum_positive_numbers",
      "outcome": "passed",
      "duration": 0.001
    },
    {
      "nodeid": "rora_tests/test_utils.py::test_calculate_sum_empty_list",
      "outcome": "failed",
      "call": {
        "longrepr": "AssertionError: Expected 0, got None"
      }
    }
  ]
}
```

## File Structure Convention

### Test Directory Layout

```
project_root/
├── src/
│   └── utils/
│       ├── math_helpers.py
│       └── string_utils.py
├── rora_tests/
│   ├── __init__.py
│   ├── conftest.py          # Shared fixtures
│   ├── test_math_helpers.py
│   └── test_string_utils.py
└── .rora/
    └── registry.json        # Function-to-test mapping
```

### Registry Schema

```json
{
  "version": 1,
  "mappings": {
    "src/utils/math_helpers.py::calculate_sum": {
      "testFile": "rora_tests/test_math_helpers.py",
      "testNames": ["test_calculate_sum_positive", "test_calculate_sum_negative"],
      "generatedAt": "2025-12-29T10:00:00Z",
      "lastRun": {
        "status": "passed",
        "runAt": "2025-12-29T10:05:00Z"
      }
    }
  }
}
```

## Trade-offs & Decisions

### Decision 1: Subprocess vs In-Process Python

**Chosen: Subprocess**

Pros:

- Isolation: Test failures don't crash extension
- Flexibility: Can use any Python environment
- Security: User code runs in separate process

Cons:

- Startup latency (~100ms per call)
- IPC overhead

**Mitigation:** Keep Python backend running as long-lived server process

### Decision 2: Test Storage Location

**Chosen: Dedicated `rora_tests/` directory**

Alternatives considered:

- Inline in source file (rejected: pollutes source)
- `tests/` alongside existing tests (rejected: may conflict)
- `.rora/tests/` hidden (rejected: hard to discover)

Rationale: Clear separation, easy to gitignore if desired, follows pytest discovery

### Decision 3: LLM Provider

**Chosen: Gemini 2.5 Flash Lite**

Rationale:

- Fast inference (optimized for speed)
- Cost-effective for high-volume usage
- Good Python code generation quality
- Google AI Studio free tier for development

Future: Add support for OpenAI, Anthropic, local models via configuration

## Performance Considerations

1. **Caching**: Cache AST parse results per file, invalidate on edit
2. **Debouncing**: Debounce CodeLens refresh on rapid typing (300ms)
3. **Background Processing**: Run test generation in background, show progress
4. **Lazy Loading**: Don't parse unopened files
5. **Connection Pooling**: Reuse Python backend connection
