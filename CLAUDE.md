# CLAUDE.md

This file provides guidance to Claude Code when working with this monorepo.

## Project Overview

**recursive-llm** implements Recursive Language Models (RLM) - a technique for processing extremely long contexts (100k+ tokens) without "context rot". Based on the 2025 paper by Alex Zhang and Omar Khattab (MIT CSAIL).

## Repository Structure

```
recursive-llm/
├── python/              # Python implementation
│   ├── src/rlm/        # Core library
│   ├── tests/          # Test suite
│   ├── examples/       # Usage examples
│   └── pyproject.toml  # Python package config
│
├── typescript/          # TypeScript implementation
│   ├── src/            # Core library
│   ├── tests/          # Test suite (unit, integration, e2e)
│   ├── examples/       # Usage examples
│   └── package.json    # NPM package config (@rlm/core)
│
├── shared/              # Shared test fixtures
│   └── fixtures/       # Documents, queries for testing
│
└── docs/                # Documentation
    └── research_mit.pdf # Original paper
```

## Commands

### Python

```bash
cd python

# Install
pip install -e .              # Basic
pip install -e ".[dev]"       # With dev dependencies

# Test
pytest tests/ -v
pytest tests/ -v --cov=src/rlm --cov-report=term-missing

# Type check
mypy src/rlm

# Lint & Format
ruff check src/rlm
black src/rlm tests examples
```

### TypeScript

```bash
cd typescript

# Install
bun install

# Build
bun run build

# Test
bun test                      # All tests
bun test tests/unit/          # Unit tests only
bun test tests/integration/   # Integration tests
bun test tests/e2e/           # E2E tests (requires API keys)

# Type check
bun run typecheck

# Lint & Format
bun run lint
bun run format
```

## Architecture

### Core Concept

Both implementations follow the same pattern:

1. `RLM` class - Main completion loop, recursion handling
2. `Parser` - Extract `FINAL()` statements from LLM output
3. `Sandbox/REPL` - Safe code execution environment
4. `Prompts` - System prompt builders with context info
5. `Types` - Configuration and result types

### Key Design Decisions

- **Context as variable** - Not in prompt, avoiding token limits
- **Recursive model** - Cheaper model (`recursiveModel`) for depth > 0
- **REPL truncation** - Outputs >2000 chars truncated to prevent explosion
- **Safe execution** - RestrictedPython (Python), QuickJS (TypeScript)

### Data Flow

```
1. rlm.completion(query, context)
2. Context stored as variable (not in prompt)
3. LLM generates code to explore context
4. REPL executes code safely
5. LLM iterates until FINAL(answer)
6. Recursive calls create sub-RLM instances
```

## API Consistency

Both implementations support:

```python
# Python
result = rlm.completion(query, context)
result = await rlm.acompletion(query, context)
```

```typescript
// TypeScript
const result = await rlm.completion(query, context);
```

### Configuration

| Option | Python | TypeScript |
|--------|--------|------------|
| Primary model | `model` | `model` |
| Recursive model | `recursive_model` | `recursiveModel` |
| Max depth | `max_depth` | `maxDepth` |
| Max iterations | `max_iterations` | `maxIterations` |
| Cost budget | `cost_budget` | `costBudget` |

### Result Types

| Field | Python | TypeScript |
|-------|--------|------------|
| Answer | `result` (str) | `result.answer` |
| Stats | `stats` (dict) | `result.stats` |
| Confidence | N/A | `result.confidence` |

## Testing

### Shared Fixtures

Test data in `shared/fixtures/` is used by both implementations:
- `financial-report.txt` - ~8500 char financial document
- `queries/extraction.json` - Known-answer extraction queries

### Test Categories

| Category | Python | TypeScript |
|----------|--------|------------|
| Unit | `tests/test_*.py` | `tests/unit/*.test.ts` |
| Integration | `tests/test_integration.py` | `tests/integration/*.test.ts` |
| E2E | N/A | `tests/e2e/*.test.ts` |

## Custom Exceptions

| Python | TypeScript |
|--------|------------|
| `MaxIterationsError` | `MaxIterationsError` |
| `MaxDepthError` | `MaxDepthError` |
| `REPLError` | `REPLError` |
| N/A | `CostBudgetExceededError` |

## Dependencies

### Python
- `litellm` - Universal LLM API
- `RestrictedPython` - Safe execution

### TypeScript
- `@anthropic-ai/sdk` - Anthropic API
- `openai` - OpenAI API
- `ai` - Vercel AI SDK
- `@sebastianwessel/quickjs` - Optional sandbox
