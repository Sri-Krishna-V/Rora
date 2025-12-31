"""Context gatherer for project analysis."""

import os
from pathlib import Path
from typing import Any


def gather_project_context(project_root: str) -> dict[str, Any]:
    """
    Gather project context including dependencies and test patterns.

    Args:
        project_root: Root directory of the project

    Returns:
        Dictionary containing project context information
    """
    root = Path(project_root)
    context: dict[str, Any] = {
        "dependencies": [],
        "dev_dependencies": [],
        "test_patterns": [],
        "existing_test_files": [],
        "has_pytest": False,
        "has_unittest": False,
    }

    # Check for requirements.txt
    requirements_file = root / "requirements.txt"
    if requirements_file.exists():
        deps = parse_requirements(requirements_file)
        context["dependencies"].extend(deps)

    # Check for pyproject.toml
    pyproject_file = root / "pyproject.toml"
    if pyproject_file.exists():
        deps, dev_deps = parse_pyproject(pyproject_file)
        context["dependencies"].extend(deps)
        context["dev_dependencies"].extend(dev_deps)

    # Check for pytest/unittest
    all_deps = context["dependencies"] + context["dev_dependencies"]
    context["has_pytest"] = any("pytest" in d.lower() for d in all_deps)
    context["has_unittest"] = True  # Always available in stdlib

    # Find existing test files
    test_patterns = ["test_*.py", "*_test.py"]
    for pattern in test_patterns:
        for test_file in root.rglob(pattern):
            if "__pycache__" not in str(test_file):
                context["existing_test_files"].append(
                    str(test_file.relative_to(root)))

    # Analyze existing test patterns
    if context["existing_test_files"]:
        context["test_patterns"] = analyze_test_patterns(
            root, context["existing_test_files"])

    return context


def parse_requirements(path: Path) -> list[str]:
    """Parse requirements.txt file."""
    deps = []
    try:
        content = path.read_text(encoding="utf-8")
        for line in content.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("-"):
                # Extract package name without version specifier
                pkg_name = line.split("==")[0].split(">=")[
                    0].split("<=")[0].split("[")[0]
                deps.append(pkg_name.strip())
    except Exception:
        pass
    return deps


def parse_pyproject(path: Path) -> tuple[list[str], list[str]]:
    """Parse pyproject.toml file for dependencies."""
    deps: list[str] = []
    dev_deps: list[str] = []

    try:
        content = path.read_text(encoding="utf-8")

        # Simple TOML parsing for dependencies
        # In production, use tomllib (Python 3.11+) or tomli
        in_deps = False
        in_dev_deps = False

        for line in content.splitlines():
            line = line.strip()

            if line == "dependencies = [" or line.startswith("dependencies"):
                in_deps = True
                in_dev_deps = False
                continue
            elif "dev" in line.lower() and "dependencies" in line.lower():
                in_dev_deps = True
                in_deps = False
                continue
            elif line.startswith("["):
                in_deps = False
                in_dev_deps = False
                continue

            if (in_deps or in_dev_deps) and line.startswith('"'):
                # Extract package name
                pkg = line.strip('",[] ')
                if pkg:
                    pkg_name = pkg.split(">=")[0].split("<=")[
                        0].split("==")[0].split("[")[0]
                    if in_deps:
                        deps.append(pkg_name.strip())
                    else:
                        dev_deps.append(pkg_name.strip())
    except Exception:
        pass

    return deps, dev_deps


def analyze_test_patterns(root: Path, test_files: list[str]) -> list[str]:
    """Analyze existing test files to extract patterns."""
    patterns = set()

    for test_file in test_files[:5]:  # Sample first 5 files
        try:
            path = root / test_file
            content = path.read_text(encoding="utf-8")

            # Check for fixtures
            if "@pytest.fixture" in content:
                patterns.add("uses_pytest_fixtures")

            # Check for parametrize
            if "@pytest.mark.parametrize" in content:
                patterns.add("uses_parametrize")

            # Check for mock
            if "unittest.mock" in content or "from mock import" in content:
                patterns.add("uses_mocking")

            # Check for class-based tests
            if "class Test" in content:
                patterns.add("class_based_tests")

            # Check for async tests
            if "async def test_" in content or "@pytest.mark.asyncio" in content:
                patterns.add("async_tests")

        except Exception:
            continue

    return list(patterns)


def analyze_function_imports(source_code: str, function_name: str) -> list[str]:
    """
    Analyze imports needed for testing a specific function.

    Args:
        source_code: Full source code of the file
        function_name: Name of the function to analyze

    Returns:
        List of import statements needed for testing
    """
    import ast

    imports = []
    try:
        tree = ast.parse(source_code)

        # Collect all imports from the source file
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(f"import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    names = ", ".join(alias.name for alias in node.names)
                    imports.append(f"from {node.module} import {names}")
    except Exception:
        pass

    return imports
