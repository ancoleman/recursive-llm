# RLM Python Implementation

Python implementation of Recursive Language Models for processing unbounded context lengths.

## Installation

```bash
# From this directory
pip install -e .

# With dev dependencies
pip install -e ".[dev]"
```

## Quick Start

```python
from rlm import RLM

# Initialize with any LiteLLM-supported model
rlm = RLM(model="gpt-4o-mini")

# Process long context
result = rlm.completion(
    query="What are the main themes?",
    context=huge_document  # Stored as variable, not in prompt
)
print(result)
```

## API Keys

```bash
export OPENAI_API_KEY="sk-..."      # OpenAI
export ANTHROPIC_API_KEY="sk-..."   # Anthropic
```

Or pass directly:
```python
rlm = RLM(model="gpt-4o-mini", api_key="sk-...")
```

## Supported Models

Works with 100+ providers via LiteLLM:

```python
# OpenAI
rlm = RLM(model="gpt-4o")
rlm = RLM(model="gpt-4o-mini")

# Anthropic
rlm = RLM(model="claude-sonnet-4")

# Ollama (local)
rlm = RLM(model="ollama/llama3.2")

# Azure, Google, and many more...
```

## Advanced Usage

### Two Models (Cost Optimization)

```python
rlm = RLM(
    model="gpt-4o",              # Root LM
    recursive_model="gpt-4o-mini"  # Recursive calls (cheaper)
)
```

### Async API

```python
import asyncio

async def main():
    rlm = RLM(model="gpt-4o-mini")
    result = await rlm.acompletion(query, context)
    print(result)

asyncio.run(main())
```

### Configuration

```python
rlm = RLM(
    model="gpt-4o-mini",
    max_depth=5,         # Maximum recursion depth
    max_iterations=20,   # Maximum REPL iterations
    temperature=0.7,
    timeout=60
)
```

## Examples

See the `examples/` directory:

- `basic_usage.py` - Simple completion
- `ollama_local.py` - Local models
- `two_models.py` - Cost optimization
- `long_document.py` - 50k+ tokens
- `data_extraction.py` - Structured extraction
- `multi_file.py` - Multiple documents

```bash
python examples/basic_usage.py
```

## Development

```bash
# Test
pytest tests/ -v

# Coverage
pytest tests/ -v --cov=src/rlm --cov-report=term-missing

# Type check
mypy src/rlm

# Lint
ruff check src/rlm

# Format
black src/rlm tests examples
```

## Architecture

```
src/rlm/
├── core.py      # RLM class - completion loop, recursion
├── types.py     # TypedDict definitions
├── repl.py      # REPLExecutor - RestrictedPython sandbox
├── prompts.py   # System prompt builders
└── parser.py    # FINAL() extraction
```

## Dependencies

- `litellm` - Universal LLM API
- `RestrictedPython` - Safe code execution
- Python 3.9+

## License

MIT - see root LICENSE file
