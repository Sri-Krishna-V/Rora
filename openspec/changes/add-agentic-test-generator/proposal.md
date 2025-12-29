# Proposal: Add Agentic Test Generator VSCode Extension

## Summary

Build a VSCode extension called **Rora** that uses LangChain/LangGraph-powered AI agents to generate, display, and execute Python unit tests on-demand. The extension provides CodeLens-style inline buttons above each Python function, allowing developers to generate, view, and run tests without leaving the editor.

## Motivation

Writing comprehensive unit tests is time-consuming and often neglected during rapid development cycles. Developers need:

1. **Instant test generation** - Generate tests for any function with a single click
2. **In-context visibility** - See test availability status directly in the code editor
3. **Integrated execution** - Run tests and view results without context switching
4. **AI-powered intelligence** - Leverage LLMs to understand function semantics, edge cases, and generate meaningful test scenarios

## Goals

- **G1**: Provide CodeLens-style inline buttons ("Generate", "Re-Generate", "View", "Run") above Python functions
- **G2**: Generate comprehensive unit tests using a LangChain agent with Gemini 2.5 Flash Lite
- **G3**: Store generated tests in a dedicated `rora_tests/` directory mirroring source structure
- **G4**: Display test results (pass/fail) as decorations in the editor and in a dedicated test panel
- **G5**: Support pytest and unittest frameworks (user-configurable)
- **G6**: Understand project context from `requirements.txt`, `pyproject.toml`, and existing test patterns

## Non-Goals

- Multi-language support (Python only in this phase)
- Coverage metrics and detailed analytics
- Real-time continuous test generation (watch mode)
- Test generation for entire files/projects in one action

## User Experience

### Workflow

1. User opens a Python file in VSCode
2. Extension parses the file and identifies all functions/methods
3. CodeLens appears above each function:
   - **No tests exist**: `Generate | Run`
   - **Tests exist**: `Re-Generate | View | Run`
4. User clicks "Generate" → Agent generates tests → Saved to `rora_tests/`
5. User clicks "View" → Opens the test file in a split editor
6. User clicks "Run" → Executes tests via pytest → Results shown in panel + decorations

### Test Panel

A dedicated webview panel displaying:

- List of all generated tests grouped by source file
- Pass/fail status with green/red indicators
- Clickable items to navigate to test or source
- Re-run and delete options per test

## Technical Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     VSCode Extension (TypeScript)               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ CodeLens     │  │ Test Panel   │  │ Test Results Decorator │ │
│  │ Provider     │  │ (Webview)    │  │                        │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         │                 │                      │              │
│  ┌──────▼─────────────────▼──────────────────────▼────────────┐ │
│  │                    Extension Core                          │ │
│  │  - Function Detection (AST via Python subprocess)          │ │
│  │  - Test State Management                                   │ │
│  │  - File System Operations                                  │ │
│  └──────────────────────────┬─────────────────────────────────┘ │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Python Agent Backend                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LangGraph Test Generation Agent             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ Code Parser │  │ Context     │  │ Test Generator  │   │   │
│  │  │ Tool        │  │ Gatherer    │  │ Tool            │   │   │
│  │  │             │  │ Tool        │  │                 │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Test Execution Engine                   │   │
│  │  - pytest subprocess runner                              │   │
│  │  - Result parser (JSON output)                           │   │
│  │  - Coverage collector (future)                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  LLM: Gemini 2.5 Flash Lite (via langchain-google-genai)        │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Design

The test generation agent uses LangGraph with the following tools:

1. **`parse_python_function`**: Extracts function signature, docstring, body, decorators, and type hints
2. **`gather_project_context`**: Reads `requirements.txt`/`pyproject.toml`, identifies dependencies and existing test patterns
3. **`analyze_dependencies`**: Finds imported modules, classes, and functions used by the target function
4. **`generate_test_code`**: Produces pytest/unittest code based on analysis

### Test Execution

**Recommendation**: Use **pytest subprocess** integration:

- Industry standard, most Python projects use pytest
- JSON output format (`--json-report`) for easy parsing
- Supports both pytest and unittest test formats
- Subprocess isolation prevents extension crashes from test failures
- Simple integration: `python -m pytest rora_tests/ --json-report`

## Success Criteria

1. CodeLens buttons appear above all Python functions within 500ms of file open
2. Test generation completes within 10 seconds for typical functions
3. Generated tests have >70% pass rate on first run (valid syntax, correct assertions)
4. Test results display correctly with pass/fail decorations
5. Extension works with virtual environments and conda

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM generates invalid Python syntax | Validate generated code with AST parse before saving |
| Slow response from Gemini API | Show progress indicator, implement timeout with retry |
| Large functions exceed token limits | Chunk large functions, summarize context |
| Test flakiness due to LLM non-determinism | Allow regeneration, use temperature=0 for consistency |

## Dependencies

- VSCode Extension API (TypeScript)
- Python 3.9+
- langchain-google-genai (for Gemini integration)
- langgraph (for agent orchestration)
- pytest + pytest-json-report (for test execution)
- ast module (for Python parsing)

## MVP Design Decisions

### 1. Mocking Strategy: Auto-mock common externals

The agent will automatically generate mocks for common external dependencies:

- **HTTP clients**: `requests`, `httpx`, `aiohttp`
- **File I/O**: `open()`, `pathlib.Path` operations
- **Database**: Common ORM calls (SQLAlchemy, Django ORM patterns)

Tests will use `unittest.mock.patch` or `pytest-mock` fixtures. The agent identifies external calls by analyzing imports and function calls that match known patterns.

### 2. Test Editing: Direct in-place editing

Users can edit generated test files like any other Python file. When "Re-Generate" is clicked:

- If file has been modified since generation, show warning: "This will overwrite manual changes. Continue?"
- Track modification via file hash stored in registry

### 3. Complex Types: Best-effort with Any fallback

For complex type hints (generics, TypeVar, Protocol):

- Attempt to infer concrete types from usage in function body
- Fall back to `Any` or simple types when inference fails
- Generate tests with representative values rather than failing
- Add comment: `# Note: Using simplified types for complex generic`

### 4. Concurrent Generation: Sequential (one at a time)

MVP supports one test generation at a time:

- Simpler state management and progress reporting
- Avoids API rate limiting issues
- Queue additional requests if user clicks multiple "Generate" buttons
- Status bar shows: "Generating tests for function_name... (2 queued)"

### 5. API Key Storage: VSCode settings with env var fallback

Priority order for API key:

1. Environment variable: `GOOGLE_API_KEY` or `GEMINI_API_KEY`
2. VSCode setting: `rora.geminiApiKey` (workspace or user settings)

Setting is marked as secret (not synced, not shown in settings UI export). First-run wizard prompts for key if not found.
