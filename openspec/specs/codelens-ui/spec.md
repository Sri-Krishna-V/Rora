# codelens-ui Specification

## Purpose
TBD - created by archiving change add-agentic-test-generator. Update Purpose after archive.
## Requirements
### Requirement: Function Detection

The extension MUST detect all testable Python functions and methods in open files.

#### Scenario: Standalone function detection

- **Given** a Python file is open containing `def calculate_sum(a, b): return a + b`
- **When** the file is parsed
- **Then** the function `calculate_sum` is detected at its line number
- **And** it is marked as a standalone function

#### Scenario: Class method detection

- **Given** a Python file contains a class `Calculator` with method `def add(self, a, b)`
- **When** the file is parsed
- **Then** the method `add` is detected and associated with class `Calculator`

#### Scenario: Async function detection

- **Given** a Python file contains `async def fetch_data(url): ...`
- **When** the file is parsed
- **Then** the function is detected with `is_async: true`

#### Scenario: Private function handling

- **Given** a Python file contains `def _internal_helper(): ...`
- **When** the file is parsed
- **Then** the function is detected and eligible for test generation
- **And** CodeLens is displayed above it

#### Scenario: Nested function exclusion

- **Given** a Python file contains a function with a nested function inside
- **When** the file is parsed
- **Then** only the outer function receives CodeLens
- **And** nested functions are excluded from top-level detection

---

### Requirement: CodeLens Display States

The CodeLens MUST display context-appropriate actions based on test existence.

#### Scenario: No tests exist for function

- **Given** a function `process_data` has no associated tests in `rora_tests/`
- **When** the user views the file
- **Then** CodeLens shows "Generate | Run" above the function
- **And** "Generate" is clickable

#### Scenario: Tests exist for function

- **Given** a function `process_data` has tests in `rora_tests/test_module.py`
- **When** the user views the file
- **Then** CodeLens shows "Re-Generate | View | Run" above the function

#### Scenario: Test generation in progress

- **Given** the user clicked "Generate" for function `validate_input`
- **When** the agent is generating tests
- **Then** CodeLens shows "Generating..." with a spinner indicator
- **And** the action is not clickable until complete

#### Scenario: Generation queued

- **Given** another function's test generation is in progress
- **When** user clicks "Generate" on function `parse_config`
- **Then** CodeLens shows "Queued..." for `parse_config`
- **And** user can click to cancel the queued request

#### Scenario: Test failed indicator

- **Given** function `compute_hash` has tests that failed on last run
- **When** the user views the file
- **Then** CodeLens shows a red indicator next to "Run"
- **And** hovering shows "Last run: 2 failed, 1 passed"

---

### Requirement: CodeLens Commands

The extension MUST register and handle CodeLens commands.

#### Scenario: Generate command

- **Given** the user clicks "Generate" on function `parse_json`
- **When** the command `rora.generateTest` is invoked
- **Then** the extension calls the Python backend to generate tests
- **And** progress notification is shown
- **And** on success, tests are saved to `rora_tests/`

#### Scenario: Regenerate command with unmodified tests

- **Given** the user clicks "Re-Generate" on function `parse_json`
- **And** test file has not been manually modified
- **When** the command `rora.regenerateTest` is invoked
- **Then** existing tests for this function are replaced
- **And** new tests are generated and saved

#### Scenario: Regenerate command with modified tests

- **Given** the user clicks "Re-Generate" on function `parse_json`
- **And** test file has been manually modified since generation
- **When** the command `rora.regenerateTest` is invoked
- **Then** a warning dialog appears: "Test file has been modified. Regenerating will overwrite your changes."
- **And** user can choose "Continue" or "Cancel"

#### Scenario: View command

- **Given** the user clicks "View" on function `parse_json`
- **When** the command `rora.viewTest` is invoked
- **Then** the test file opens in a split editor
- **And** the cursor jumps to the test method for this function

#### Scenario: Run command

- **Given** the user clicks "Run" on function `parse_json`
- **When** the command `rora.runTest` is invoked
- **Then** pytest executes only tests for this function
- **And** results are displayed in the Test Panel
- **And** pass/fail decorations update in the editor

---

### Requirement: CodeLens Performance

CodeLens MUST appear promptly and not block the editor.

#### Scenario: Fast initial display

- **Given** a user opens a Python file with 50 functions
- **When** the file finishes loading
- **Then** CodeLens items appear within 500ms

#### Scenario: Incremental update on edit

- **Given** a user adds a new function to an open file
- **When** the file is saved or after 1 second of no typing
- **Then** CodeLens refreshes to include the new function
- **And** existing CodeLens items remain stable

#### Scenario: Large file handling

- **Given** a Python file has 200+ functions
- **When** the file is opened
- **Then** CodeLens displays for visible functions first
- **And** remaining functions are processed in background

