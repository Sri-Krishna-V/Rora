# Spec: Test Panel

## Overview

This capability provides a dedicated webview panel for viewing test results, managing tests, and navigating between source and test code.

---

## ADDED Requirements

### Requirement: Panel Display

The Test Panel MUST display all generated tests with status.

#### Scenario: Panel activation

- **Given** user has generated tests for at least one function
- **When** user runs command `rora.openTestPanel` or clicks status bar
- **Then** Test Panel opens in the sidebar or bottom panel
- **And** displays list of tests grouped by source file

#### Scenario: Empty state

- **Given** no tests have been generated yet
- **When** Test Panel is opened
- **Then** it shows "No tests generated yet"
- **And** provides a call-to-action: "Open a Python file and click 'Generate' above a function"

#### Scenario: Group by source file

- **Given** tests exist for functions in `math.py` and `utils.py`
- **When** Test Panel displays
- **Then** tests are grouped under collapsible sections:
  - `math.py` (3 functions, 2 passed, 1 failed)
  - `utils.py` (2 functions, 2 passed)

---

### Requirement: Test Status Display

Each test item MUST show clear pass/fail status.

#### Scenario: Passed test display

- **Given** function `add` has all tests passing
- **When** displayed in Test Panel
- **Then** it shows green checkmark icon ✓
- **And** label: "add (3/3 passed)"

#### Scenario: Failed test display

- **Given** function `divide` has 1 failed test out of 4
- **When** displayed in Test Panel
- **Then** it shows red X icon ✗
- **And** label: "divide (3/4 passed)"
- **And** expandable to show which specific tests failed

#### Scenario: Not run display

- **Given** function `new_function` has generated tests but never run
- **When** displayed in Test Panel
- **Then** it shows gray circle icon ○
- **And** label: "new_function (not run)"

#### Scenario: Running state display

- **Given** tests for `process_data` are currently executing
- **When** displayed in Test Panel
- **Then** it shows spinner icon
- **And** label: "process_data (running...)"

---

### Requirement: Navigation

Users MUST be able to navigate to source and test code.

#### Scenario: Navigate to source function

- **Given** Test Panel shows entry for `calculate_tax` from `finance.py`
- **When** user clicks the source icon or double-clicks the entry
- **Then** `finance.py` opens in editor
- **And** cursor moves to line where `calculate_tax` is defined

#### Scenario: Navigate to test file

- **Given** Test Panel shows entry for `calculate_tax`
- **When** user clicks "View Tests" button
- **Then** `rora_tests/test_finance.py` opens
- **And** cursor moves to `TestCalculateTax` class or first test

#### Scenario: Navigate to failed test

- **Given** `test_calculate_tax_negative_income` failed
- **When** user clicks on the failed test name in expanded view
- **Then** test file opens at the exact line of that test
- **And** failure message is shown in hover or inline

---

### Requirement: Test Actions

Users MUST be able to perform actions on tests from the panel.

#### Scenario: Run single test

- **Given** Test Panel shows `validate_email` entry
- **When** user clicks the play button on that entry
- **Then** only tests for `validate_email` execute
- **And** results update in real-time

#### Scenario: Run all tests

- **Given** Test Panel has multiple test entries
- **When** user clicks "Run All Tests" button in panel header
- **Then** all tests in `rora_tests/` execute
- **And** progress bar shows overall completion

#### Scenario: Regenerate test

- **Given** Test Panel shows `parse_json` with failed tests
- **When** user clicks "Regenerate" button on that entry
- **Then** agent generates new tests for `parse_json`
- **And** old tests are replaced
- **And** new tests run automatically

#### Scenario: Delete test

- **Given** Test Panel shows `deprecated_function` entry
- **When** user clicks delete icon and confirms
- **Then** tests for that function are removed from `rora_tests/`
- **And** registry mapping is deleted
- **And** CodeLens reverts to "Generate | Run"

---

### Requirement: Result Details

Failed tests MUST show detailed failure information.

#### Scenario: Expand failure details

- **Given** `test_divide_by_zero` failed with AssertionError
- **When** user expands the failed test entry
- **Then** it shows:
  - Expected vs actual values
  - Line number where assertion failed
  - Truncated traceback (expandable)

#### Scenario: Copy failure message

- **Given** user is viewing failure details
- **When** user clicks "Copy" button
- **Then** full traceback is copied to clipboard

#### Scenario: Long traceback handling

- **Given** a test failure has 50+ line traceback
- **When** displayed in panel
- **Then** only first 5 lines show by default
- **And** "Show more" link reveals full traceback

---

### Requirement: Panel State Persistence

Panel state MUST persist across sessions.

#### Scenario: Remember collapsed state

- **Given** user collapsed `utils.py` section in Test Panel
- **When** VSCode is restarted
- **Then** `utils.py` section remains collapsed

#### Scenario: Remember last results

- **Given** user ran tests and closed VSCode
- **When** VSCode reopens
- **Then** Test Panel shows last known results
- **And** status bar shows last run summary

#### Scenario: Refresh on file change

- **Given** Test Panel shows results
- **When** user modifies source file `math.py`
- **Then** Test Panel marks `math.py` tests as "stale"
- **And** indicator suggests re-running tests

---

### Requirement: Status Bar Integration

Extension MUST show summary in status bar.

#### Scenario: All tests passing

- **Given** last run had 15/15 tests pass
- **When** status bar renders
- **Then** it shows: "✓ Rora: 15/15 passed"
- **And** color is green

#### Scenario: Some tests failing

- **Given** last run had 12/15 tests pass
- **When** status bar renders
- **Then** it shows: "✗ Rora: 12/15 passed"
- **And** color is red

#### Scenario: Click status bar

- **Given** user clicks status bar item
- **When** clicked
- **Then** Test Panel opens/focuses
