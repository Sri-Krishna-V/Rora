# test-execution Specification

## Purpose
TBD - created by archiving change add-agentic-test-generator. Update Purpose after archive.
## Requirements
### Requirement: Test Execution via pytest

The extension MUST execute tests using pytest subprocess.

#### Scenario: Run single function tests

- **Given** function `calculate_sum` has tests in `rora_tests/test_math.py::TestCalculateSum`
- **When** user clicks "Run" on the function
- **Then** pytest runs only that test class/functions
- **And** command is: `python -m pytest rora_tests/test_math.py::TestCalculateSum -v --json-report`

#### Scenario: Run all tests in file

- **Given** user opens Test Panel and clicks "Run All" for `test_math.py`
- **When** execution starts
- **Then** pytest runs all tests in that file
- **And** results are collected for each test

#### Scenario: Handle test with fixtures

- **Given** a test uses fixtures from `conftest.py`
- **When** the test is executed
- **Then** pytest correctly loads fixtures
- **And** test runs successfully

#### Scenario: Respect Python environment

- **Given** user has `rora.pythonPath` set to a virtual environment
- **When** tests are executed
- **Then** pytest runs using that Python interpreter
- **And** dependencies from that environment are available

---

### Requirement: Result Parsing

Test results MUST be parsed into structured format.

#### Scenario: Parse passed test

- **Given** pytest JSON report contains `{"outcome": "passed", "duration": 0.001}`
- **When** results are parsed
- **Then** test status is `passed`
- **And** duration is recorded

#### Scenario: Parse failed test with assertion

- **Given** pytest JSON report contains:

  ```json
  {
    "outcome": "failed",
    "call": {
      "longrepr": "AssertionError: assert 5 == 6"
    }
  }
  ```

- **When** results are parsed
- **Then** test status is `failed`
- **And** failure message "AssertionError: assert 5 == 6" is extracted

#### Scenario: Parse skipped test

- **Given** a test has `@pytest.mark.skip` decorator
- **When** pytest runs and reports `{"outcome": "skipped"}`
- **Then** test status is `skipped`
- **And** it appears distinct from pass/fail in UI

#### Scenario: Parse error (not failure)

- **Given** a test raises an unexpected exception during setup
- **When** pytest reports `{"outcome": "error"}`
- **Then** test status is `error`
- **And** error traceback is available

---

### Requirement: Result Mapping

Results MUST be mapped back to source functions.

#### Scenario: Map test to source function

- **Given** test `test_calculate_sum_positive` passed
- **And** registry maps `test_calculate_sum_*` to `src/math.py::calculate_sum`
- **When** results are processed
- **Then** the source function `calculate_sum` is marked as having passed tests

#### Scenario: Aggregate multiple tests

- **Given** function `validate_input` has 5 tests: 4 passed, 1 failed
- **When** results are aggregated
- **Then** function status is `failed` (any failure = failed)
- **And** summary shows "4/5 passed"

#### Scenario: Handle missing mapping

- **Given** a test exists that isn't in the registry
- **When** results are processed
- **Then** the test result is shown in Test Panel under "Unmapped Tests"
- **And** no source function decoration is affected

---

### Requirement: Execution Environment

Tests MUST run in isolated, reproducible environment.

#### Scenario: Working directory

- **Given** tests import from source via relative paths
- **When** pytest executes
- **Then** working directory is set to project root
- **And** imports resolve correctly

#### Scenario: Environment variables

- **Given** tests require `DATABASE_URL` environment variable
- **When** pytest executes
- **Then** existing environment variables are passed through
- **And** user can configure additional variables in settings

#### Scenario: Subprocess isolation

- **Given** a test has an infinite loop bug
- **When** pytest runs with timeout
- **Then** after 60 seconds (configurable), the subprocess is killed
- **And** user sees "Test execution timed out"

---

### Requirement: Execution State Management

Extension MUST track and display execution state.

#### Scenario: Execution in progress

- **Given** user clicks "Run" on a function
- **When** pytest is executing
- **Then** CodeLens shows spinning indicator
- **And** Test Panel shows "Running..." status

#### Scenario: Concurrent execution prevention

- **Given** tests for `functionA` are running
- **When** user clicks "Run" on `functionA` again
- **Then** the action is ignored
- **And** tooltip says "Tests already running"

#### Scenario: Queue multiple runs

- **Given** user clicks "Run" on `functionA`, then `functionB` quickly
- **When** both are requested
- **Then** `functionA` tests run first
- **And** `functionB` tests run after `functionA` completes

