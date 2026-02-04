# RLM TypeScript - Recursive Language Model

A TypeScript/Bun implementation of Recursive Language Models (RLM) for processing extremely long contexts (100k+ tokens) without "context rot".

Based on the 2025 paper by Alex Zhang and Omar Khattab (MIT CSAIL).

## Key Innovation

Instead of putting entire context in the prompt (causing degradation), RLM:
1. Stores context as a variable in a sandbox environment
2. Lets the LLM generate code to explore the context programmatically
3. Supports recursive calls for divide-and-conquer strategies

**Results from the paper:**
- 80% accuracy on 60k token contexts (vs 0% for direct LLM)
- 40x token efficiency (2-3k tokens vs 95k+)
- Works with 1M+ token contexts

## Installation

```bash
bun install
```

## Quick Start

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { RLM, AnthropicProvider } from "@rlm/core";

// Initialize provider
const anthropic = new Anthropic();
const provider = new AnthropicProvider(anthropic);

// Create RLM instance
const rlm = new RLM({
  model: "claude-sonnet-4",
  recursiveModel: "claude-haiku",  // Cheaper model for recursive calls
  provider,
});

// Process a long document
const result = await rlm.completion(
  "What are the key findings?",
  veryLongDocument
);

console.log(result.answer);
console.log(`Tokens used: ${result.stats.totalTokens}`);
```

## Configuration

```typescript
interface RLMConfig {
  model: string;              // Primary model (e.g., "claude-sonnet-4")
  recursiveModel?: string;    // Model for recursive calls (default: same as model)
  maxDepth?: number;          // Max recursion depth (default: 5)
  maxIterations?: number;     // Max iterations per call (default: 30)
  maxOutputChars?: number;    // Output truncation limit (default: 2000)
  temperature?: number;       // LLM temperature (default: 0)
  costBudget?: number;        // Optional cost limit in USD
  timeout?: number;           // Per-call timeout in ms (default: 60000)
  fallbackModels?: string[];  // Fallback models on failure
}
```

## Events

Subscribe to execution events for visibility:

```typescript
rlm.on("iteration", ({ iteration, depth }) => {
  console.log(`Iteration ${iteration} at depth ${depth}`);
});

rlm.on("code", ({ iteration, code }) => {
  console.log(`Generated code: ${code}`);
});

rlm.on("output", ({ iteration, output, truncated }) => {
  console.log(`Output: ${output}`);
});

rlm.on("recursion", ({ depth, subQuery, subContextSize }) => {
  console.log(`Recursive call at depth ${depth}`);
});

rlm.on("error", ({ iteration, error, recovered }) => {
  console.log(`Error: ${error}, recovered: ${recovered}`);
});

rlm.on("costWarning", ({ spent, budget, remaining }) => {
  console.warn(`Budget warning: $${spent} of $${budget}`);
});

rlm.on("complete", ({ answer, stats }) => {
  console.log(`Done: ${answer}`);
});
```

## Providers

### Anthropic (Claude)

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "@rlm/core";

const anthropic = new Anthropic();
const provider = new AnthropicProvider(anthropic);
```

### OpenAI

```typescript
import OpenAI from "openai";
import { OpenAIProvider } from "@rlm/core";

const openai = new OpenAI();
const provider = new OpenAIProvider(openai);
```

### Vercel AI SDK

```typescript
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { VercelAIProvider } from "@rlm/core";

const provider = new VercelAIProvider(
  generateText,
  anthropic("claude-sonnet-4-20250514")
);
```

### Custom Fetch Provider

```typescript
import { FetchProvider } from "@rlm/core";

const provider = new FetchProvider({
  baseUrl: "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: "gpt-4o",
});
```

## How It Works

1. **Query received**: User asks a question about a large context
2. **Environment setup**: Context stored as `context` variable (NOT in prompt)
3. **LLM generates code**: Model writes JavaScript to explore the context
4. **Sandbox execution**: Code runs in restricted environment
5. **Iteration**: Process repeats until LLM calls `FINAL("answer")`
6. **Recursion**: LLM can call `recursiveLlm(subQuery, subContext)` for sub-problems

### Available in Sandbox

- `context` - The document to explore
- `query` - The user's question
- `recursiveLlm(subQuery, subContext)` - Make recursive calls
- `console.log()` - Print output
- `JSON`, `Math`, `Date`, `RegExp` - Standard JavaScript

### FINAL Markers

```javascript
// Literal answer
FINAL("The answer is 42")

// Variable reference
const result = calculateSomething();
FINAL_VAR(result)

// With confidence score
FINAL_WITH_CONFIDENCE({
  answer: "The answer",
  confidence: 0.95,
  reasoning: "Based on..."
})
```

## Security

The sandbox restricts:
- File system access
- Network requests (except through `recursiveLlm`)
- Process/OS access
- Dynamic imports
- eval/Function constructor
- Prototype pollution

## Testing

```bash
bun test              # Run all tests
bun run typecheck     # TypeScript type checking
```

## Architecture

```
src/
├── index.ts          # Public API exports
├── rlm.ts            # Main RLM class
├── types.ts          # TypeScript interfaces
├── parser/           # FINAL extraction
├── prompts/          # System prompt builders
├── providers/        # LLM provider adapters
└── sandbox/          # Safe code execution
```

## Enhancements Over Python Version

- **Parallel recursive calls**: Use `Promise.all()` for concurrent sub-queries
- **Event streaming**: Real-time execution visibility
- **Confidence scoring**: `FINAL_WITH_CONFIDENCE` for uncertainty
- **Cost budgeting**: Hard limits with graceful degradation
- **TypeScript types**: Full type safety
- **Provider abstraction**: Easy LLM switching
