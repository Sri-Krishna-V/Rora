# Rora Agent

AI-powered test generation backend for the Rora VSCode extension.

## Setup

Using uv (recommended):

```bash
cd rora_agent
uv sync
```

Or using pip:

```bash
cd rora_agent
pip install -e .
```

## Development

```bash
# Install dev dependencies
uv sync --all-extras

# Run linter
uv run ruff check .

# Run type checker
uv run mypy rora_agent
```

## Environment Variables

- `GEMINI_API_KEY`: Google Gemini API key for test generation

## Usage

The agent runs as a JSON-RPC server over stdio, communicating with the VSCode extension:

```bash
python -m rora_agent.server
```
