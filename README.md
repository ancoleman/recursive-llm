# Recursive Language Models (RLM)

**Process extremely long contexts (100k+ tokens) without "context rot"**

Based on [the paper](https://alexzhang13.github.io/blog/2025/rlm/) by Alex Zhang and Omar Khattab (MIT CSAIL, 2025)

---

## Implementations

| Language | Directory | Package | Status |
|----------|-----------|---------|--------|
| **Python** | [`python/`](./python) | `recursive-llm` | Production |
| **TypeScript** | [`typescript/`](./typescript) | `@rlm/core` | Production |

Both implementations follow the same API design and are fully tested.

---

## What is RLM?

RLM enables language models to process extremely long contexts by:

1. **Storing context as a variable** - Not in the prompt, avoiding token limits
2. **Recursive exploration** - LLM generates code to explore/partition context
3. **Safe execution** - Sandboxed REPL environment for code execution
4. **No context rot** - Performance doesn't degrade with context length

### Traditional Approach (Context Rot)
```
prompt = system_message + query + entire_document  # 100k+ tokens
```

### RLM Approach (No Context Rot)
```
prompt = system_message + query  # ~500 tokens
context = stored_as_variable     # LLM explores via code
```

---

## Quick Start

### Python

```bash
cd python
pip install -e .
```

```python
from rlm import RLM

rlm = RLM(model="gpt-4o-mini")
result = rlm.completion(
    query="What are the main themes?",
    context=huge_document  # Stored as variable, not in prompt
)
print(result)
```

### TypeScript

```bash
cd typescript
bun install
```

```typescript
import { RLM, AnthropicProvider } from "@rlm/core";
import Anthropic from "@anthropic-ai/sdk";

const provider = new AnthropicProvider(new Anthropic());
const rlm = new RLM({
  model: "claude-sonnet-4",
  recursiveModel: "claude-haiku",
  provider,
});

const result = await rlm.completion(
  "What are the main themes?",
  hugeDocument
);
console.log(result.answer);
```

---

## Key Features

| Feature | Python | TypeScript |
|---------|--------|------------|
| Recursive Processing | LiteLLM (100+ providers) | Anthropic, OpenAI, Vercel AI |
| Sandboxed Execution | RestrictedPython | QuickJS (optional) |
| Cost Tracking | Budget limits | Budget limits + events |
| Async Support | `acompletion()` | Native async/await |
| Event System | Callbacks | EventEmitter |
| Type Safety | TypedDict | Full TypeScript |

---

## Architecture

```
recursive-llm/
├── python/                 # Python implementation
│   ├── src/rlm/           # Core library
│   ├── tests/             # Test suite
│   └── examples/          # Usage examples
│
├── typescript/            # TypeScript implementation
│   ├── src/               # Core library
│   ├── tests/             # Test suite (unit, integration, e2e)
│   └── examples/          # Usage examples
│
├── shared/                # Shared test fixtures
│   └── fixtures/          # Documents, queries
│
└── docs/                  # Documentation
    ├── research_mit.pdf   # Original paper
    └── architecture.md    # Design decisions
```

---

## How It Works

1. **Query arrives** - User asks a question about a long document
2. **Context stored** - Document stored as `context` variable in REPL
3. **LLM explores** - Model generates Python/JS code to explore context
4. **Recursive calls** - Model can spawn sub-RLMs for sections
5. **Final answer** - Model returns `FINAL(answer)` when done

```python
# LLM-generated exploration code
chunks = [context[i:i+10000] for i in range(0, len(context), 10000)]
summaries = [recursive_llm("summarize", chunk) for chunk in chunks]
FINAL("Combined summary: " + " ".join(summaries))
```

---

## Performance

From the original paper (OOLONG benchmark, 132k tokens):

| Model | Accuracy |
|-------|----------|
| GPT-4 Direct | Baseline |
| RLM(GPT-4o-mini) | **+33%** at similar cost |

Our benchmarks (60k tokens, structured queries):
- **RLM**: 80% accuracy
- **Direct**: 0% accuracy (approximations only)

---

## Development

### Python
```bash
cd python
pip install -e ".[dev]"
pytest tests/ -v
mypy src/rlm
```

### TypeScript
```bash
cd typescript
bun install
bun test
bun run typecheck
```

---

## Documentation

- [Python README](./python/README.md) - Python-specific docs
- [TypeScript README](./typescript/README.md) - TypeScript-specific docs
- [Original Paper](./docs/research_mit.pdf) - MIT CSAIL research
- [Architecture](./docs/architecture.md) - Design decisions

---

## Citation

```bibtex
@misc{zhang2025rlm,
  title = {Recursive Language Models},
  author = {Zhang, Alex and Khattab, Omar},
  year = {2025},
  url = {https://alexzhang13.github.io/blog/2025/rlm/}
}
```

---

## License

MIT License - see [LICENSE](./LICENSE)

## Contributing

Contributions welcome! Please see the implementation-specific README for development setup.
