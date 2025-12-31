# Tasks: Agentic Test Generator VSCode Extension

## Phase 1: Project Setup & Infrastructure

- [x] **1.1** Initialize VSCode extension project with TypeScript, esbuild bundler, and standard structure
- [x] **1.2** Set up Python backend project with uv for agent code
- [x] **1.3** Configure development environment with hot-reload for extension and Python
- [x] **1.4** Set up inter-process communication between TypeScript extension and Python backend (stdio JSON-RPC)

## Phase 2: Python Function Detection

- [ ] **2.1** Create Python AST parser module that extracts function metadata (name, line number, signature, docstring, decorators, body)
- [ ] **2.2** Build TypeScript service to invoke Python parser and cache results per file
- [ ] **2.3** Implement file change watcher to invalidate cache on edits
- [ ] **2.4** Handle class methods, async functions, and nested functions

## Phase 3: CodeLens Provider

- [ ] **3.1** Implement `CodeLensProvider` that displays "Generate | Run" above functions without tests
- [ ] **3.2** Track test state per function (no-tests, has-tests, running, passed, failed)
- [ ] **3.3** Update CodeLens to show "Re-Generate | View | Run" when tests exist
- [ ] **3.4** Register CodeLens commands: `rora.generateTest`, `rora.regenerateTest`, `rora.viewTest`, `rora.runTest`

## Phase 4: LangGraph Test Generation Agent

- [ ] **4.1** Set up langchain-google-genai with Gemini 2.5 Flash Lite model
- [ ] **4.2** Create `parse_python_function` tool for extracting function details
- [ ] **4.3** Create `gather_project_context` tool for reading dependencies and test patterns
- [ ] **4.4** Create `analyze_dependencies` tool for import analysis
- [ ] **4.5** Create `generate_test_code` tool with pytest/unittest templates
- [ ] **4.6** Build LangGraph agent that orchestrates tools to generate comprehensive tests
- [ ] **4.7** Add AST validation step before returning generated code

## Phase 5: Test Storage & Management

- [ ] **5.1** Define test file naming convention: `rora_tests/test_<source_filename>.py`
- [ ] **5.2** Implement test file writer that appends/updates tests for specific functions
- [ ] **5.3** Create test registry (JSON) mapping source functions to test locations
- [ ] **5.4** Handle test regeneration by replacing existing test methods

## Phase 6: Test Execution Engine

- [ ] **6.1** Implement pytest subprocess runner with JSON report output
- [ ] **6.2** Parse pytest JSON results into structured test outcomes
- [ ] **6.3** Map test outcomes back to source functions using registry
- [ ] **6.4** Handle execution errors and timeouts gracefully

## Phase 7: Test Results Display

- [ ] **7.1** Create decoration provider for pass/fail indicators (green ✓ / red ✗) in gutter
- [ ] **7.2** Build webview-based Test Panel showing:
  - Test list grouped by source file
  - Pass/fail status with icons
  - Clickable navigation to source/test
  - Run/delete actions
- [ ] **7.3** Implement panel state persistence across sessions
- [ ] **7.4** Add status bar item showing overall test status

## Phase 8: Configuration & Settings

- [ ] **8.1** Add extension settings:
  - `rora.testFramework`: "pytest" | "unittest" (default: pytest)
  - `rora.geminiApiKey`: API key for Gemini
  - `rora.testDirectory`: Custom test directory (default: rora_tests)
  - `rora.pythonPath`: Python interpreter path
- [ ] **8.2** Create first-run configuration wizard for API key setup
- [ ] **8.3** Validate settings on startup and show helpful errors

## Phase 9: Polish & Testing

- [ ] **9.1** Write unit tests for CodeLens provider logic
- [ ] **9.2** Write integration tests for agent-generated code quality
- [ ] **9.3** Add error handling with user-friendly messages
- [ ] **9.4** Implement progress indicators during test generation
- [ ] **9.5** Add telemetry (opt-in) for usage analytics
- [ ] **9.6** Create README with setup instructions and demo GIFs

## Phase 10: Documentation & Release

- [ ] **10.1** Write user documentation with examples
- [ ] **10.2** Create extension marketplace listing
- [ ] **10.3** Package and publish to VSCode Marketplace
- [ ] **10.4** Set up CI/CD for releases

---

## Task Dependencies

```
Phase 1 ──► Phase 2 ──► Phase 3 ──┐
                                  │
Phase 4 (parallel to Phase 2-3) ──┼──► Phase 5 ──► Phase 6 ──► Phase 7
                                  │
                                  └──► Phase 8

Phase 9 depends on all above
Phase 10 depends on Phase 9
```

## Parallelizable Work

- **Phase 4** (Agent) can be developed in parallel with **Phase 2-3** (Extension UI)
- **Phase 7** (Test Panel) can start after **Phase 3** (CodeLens basics)
- **Phase 8** (Settings) can be developed alongside **Phase 5-6**
