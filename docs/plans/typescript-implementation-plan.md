# RLM TypeScript/Bun Implementation Plan

## Executive Summary

Redesign the Recursive Language Model (RLM) framework from Python to TypeScript/Bun with significant enhancements for accuracy, scalability, resilience, and features. The core innovation—storing context as a variable instead of in-prompt—remains central, while we add parallel execution, streaming, observability, and modern TypeScript patterns.

---

## Understanding: RLM Core Principles

### Why RLM Works (from MIT Research Paper)

1. **Context as External Environment**: Store context as variable, not in prompt tokens
2. **Programmatic Exploration**: LLM generates code to explore context adaptively
3. **Recursive Decomposition**: Sub-queries with depth tracking enable tree-search
4. **Cost Optimization**: Cheaper models at depth > 0 (50-80% cost reduction)

### Key Metrics (from Paper)

| Benchmark | Base LLM | RLM | Improvement |
|-----------|----------|-----|-------------|
| 60k tokens | 0% accurate | 80% accurate | +80% |
| BrowseComp+ (6-11M tokens) | 0% | 91.33% | +91% |
| Token efficiency | 95k tokens | 2-3k tokens | 40x reduction |

---

## Technology Choices

### Runtime: Bun
- **Why**: Anthropic acquired Bun; powers Claude Code and Claude Agent SDK
- **Benefits**: Fast startup, native TypeScript, built-in test runner, excellent async

### LLM Client: Vercel AI SDK 6
- **Why**: 20M+ monthly downloads, unified provider API, streaming, tool calling
- **Benefits**: TypeScript-first, works with OpenAI/Anthropic/Google/etc., structured outputs via Zod

### Sandbox: QuickJS WebAssembly
- **Why**: vm2 has critical vulnerabilities (CVSS 10), QuickJS is WebAssembly-isolated
- **Benefits**: Secure isolation, async execution, TypeScript support, virtual filesystem

### Schema Validation: Zod
- **Why**: Runtime type validation, works with AI SDK structured outputs
- **Benefits**: TypeScript inference, composable, excellent DX

---

## Enhanced Architecture

```
src/
├── index.ts              # Public API exports
├── rlm.ts                # Main RLM class with completion loops
├── types.ts              # TypeScript interfaces and Zod schemas
├── sandbox/
│   ├── executor.ts       # QuickJS WebAssembly sandbox executor
│   ├── globals.ts        # Whitelisted builtins and modules
│   └── guards.ts         # Security guards and validators
├── prompts/
│   ├── system.ts         # System prompt builders
│   └── templates.ts      # Prompt templates for different strategies
├── parser/
│   ├── final.ts          # FINAL() and FINAL_VAR() extraction
│   └── code.ts           # Code block extraction from markdown
├── providers/
│   ├── unified.ts        # Vercel AI SDK unified provider wrapper
│   └── models.ts         # Model configurations and cost tracking
├── streaming/
│   ├── stream.ts         # Streaming response handling
│   └── events.ts         # Event emitter for progress updates
├── resilience/
│   ├── retry.ts          # Exponential backoff with jitter
│   ├── circuit.ts        # Circuit breaker pattern
│   └── fallback.ts       # Model fallback chains
├── observability/
│   ├── metrics.ts        # Prometheus-style metrics
│   ├── tracing.ts        # OpenTelemetry integration
│   └── logging.ts        # Structured logging
└── utils/
    ├── async.ts          # Async utilities (parallel, race, timeout)
    └── truncate.ts       # Output truncation strategies
```

---

## Core Enhancements Over Python Version

### 1. Parallel Recursive Calls (ACCURACY + SCALABILITY)

**Problem**: Python version executes recursive calls sequentially
**Solution**: Enable parallel execution with `Promise.all`

```typescript
// LLM can generate:
const results = await Promise.all([
  recursiveLlm("extract dates", context.slice(0, 50000)),
  recursiveLlm("extract dates", context.slice(50000, 100000)),
  recursiveLlm("extract dates", context.slice(100000))
]);
```

**Impact**: 3-5x faster for chunked operations, better scalability

### 2. Streaming Progress (RESILIENCE + DX)

**Problem**: Long operations give no feedback
**Solution**: Event-based streaming for real-time progress

```typescript
const rlm = new RLM({ model: "claude-sonnet-4" });

rlm.on("iteration", ({ iteration, code, output }) => {
  console.log(`Iteration ${iteration}: ${code.slice(0, 100)}...`);
});

rlm.on("recursion", ({ depth, subQuery }) => {
  console.log(`Recursing at depth ${depth}: ${subQuery}`);
});

const result = await rlm.completion(query, context);
```

### 3. Confidence Scoring (ACCURACY)

**Problem**: No indication of answer certainty
**Solution**: LLM can express confidence with structured output

```typescript
// New FINAL format:
FINAL_WITH_CONFIDENCE({ answer: "result", confidence: 0.95, reasoning: "..." })

// Result type:
interface CompletionResult {
  answer: string;
  confidence?: number;
  reasoning?: string;
  stats: ExecutionStats;
}
```

### 4. Multi-Strategy Execution (ACCURACY)

**Problem**: Single exploration strategy may miss information
**Solution**: Multiple strategies with consensus

```typescript
const strategies = [
  "chunk-parallel",    // Divide and conquer
  "keyword-search",    // Regex-based search
  "hierarchical",      // Nested structure exploration
];

const results = await rlm.completionWithConsensus(query, context, {
  strategies,
  consensusThreshold: 0.7  // 70% agreement required
});
```

### 5. Circuit Breaker + Fallback (RESILIENCE)

**Problem**: API failures cause complete failure
**Solution**: Circuit breaker with model fallback chains

```typescript
const rlm = new RLM({
  model: "claude-sonnet-4",
  fallbackModels: ["gpt-4o", "claude-haiku"],
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 30000
  }
});
```

### 6. Message History Pruning (SCALABILITY)

**Problem**: Growing message history causes token explosion (O(n²))
**Solution**: Intelligent summarization after N iterations

```typescript
// After 10 iterations, summarize older messages
if (messages.length > pruneThreshold) {
  const summary = await summarize(messages.slice(0, -5));
  messages = [systemPrompt, summary, ...messages.slice(-5)];
}
```

### 7. Observability (FEATURE-RICH)

**Problem**: No visibility into execution
**Solution**: Comprehensive metrics and tracing

```typescript
// Metrics
rlm.metrics.totalCalls        // Total LLM API calls
rlm.metrics.totalTokens       // Token usage
rlm.metrics.avgIterations     // Average iterations per completion
rlm.metrics.errorRate         // Error rate percentage

// OpenTelemetry tracing
rlm.enableTracing({
  serviceName: "rlm-service",
  exporter: "otlp"
});
```

### 8. Cost Budget Enforcement (FEATURE-RICH)

**Problem**: Unbounded costs on complex queries
**Solution**: Hard cost limits with graceful degradation

```typescript
const result = await rlm.completion(query, context, {
  costBudget: 0.50,  // $0.50 max
  onBudgetWarning: (spent, remaining) => {
    console.warn(`Budget warning: $${spent} spent, $${remaining} remaining`);
  }
});
```

### 9. Context Streaming for Large Files (SCALABILITY)

**Problem**: Loading 1M+ tokens in memory is expensive
**Solution**: Lazy-load context chunks on demand

```typescript
const rlm = new RLM({ model: "claude-sonnet-4" });

// Context provider instead of string
const contextProvider = {
  size: 10_000_000,  // 10M chars
  slice: async (start: number, end: number) => {
    return await readFileChunk(filePath, start, end);
  },
  search: async (pattern: RegExp) => {
    return await searchFile(filePath, pattern);
  }
};

const result = await rlm.completion(query, contextProvider);
```

### 10. TypeScript Code Generation (ACCURACY)

**Problem**: Python-only limits LLM's capabilities
**Solution**: Support TypeScript in sandbox with type hints

```typescript
// LLM can generate typed code:
const dates: string[] = context
  .match(/\d{4}-\d{2}-\d{2}/g)
  ?.filter((d): d is string => d !== null) ?? [];

FINAL_VAR(dates);
```

---

## Implementation Phases

### Phase 1: Core Foundation (Week 1)
- [ ] Project setup with Bun, TypeScript, Zod
- [ ] Basic RLM class with completion loop
- [ ] QuickJS sandbox integration
- [ ] FINAL/FINAL_VAR parser
- [ ] Basic system prompt

### Phase 2: Provider Integration (Week 2)
- [ ] Vercel AI SDK integration
- [ ] Model configuration (root vs recursive)
- [ ] Cost tracking per call
- [ ] Streaming response support

### Phase 3: Resilience (Week 3)
- [ ] Retry with exponential backoff
- [ ] Circuit breaker implementation
- [ ] Model fallback chains
- [ ] Timeout enforcement

### Phase 4: Enhanced Features (Week 4)
- [ ] Parallel recursive calls
- [ ] Confidence scoring
- [ ] Message history pruning
- [ ] Cost budget enforcement

### Phase 5: Observability (Week 5)
- [ ] Structured logging
- [ ] Metrics collection
- [ ] OpenTelemetry tracing
- [ ] Event emitter for progress

### Phase 6: Advanced Features (Week 6)
- [ ] Multi-strategy execution
- [ ] Context streaming for large files
- [ ] TypeScript code generation support
- [ ] Comprehensive test suite

---

## Type Definitions

```typescript
// Core types
interface RLMConfig {
  model: string;
  recursiveModel?: string;
  maxDepth?: number;           // Default: 5
  maxIterations?: number;      // Default: 30
  maxOutputChars?: number;     // Default: 2000
  temperature?: number;        // Default: 0
  costBudget?: number;         // Optional cost limit
  timeout?: number;            // Per-call timeout
  fallbackModels?: string[];   // Fallback chain
}

interface CompletionResult {
  answer: string;
  confidence?: number;
  reasoning?: string;
  stats: ExecutionStats;
}

interface ExecutionStats {
  llmCalls: number;
  iterations: number;
  maxDepthReached: number;
  totalTokens: number;
  estimatedCost: number;
  executionTimeMs: number;
}

interface SandboxEnvironment {
  context: string | ContextProvider;
  query: string;
  recursiveLlm: (subQuery: string, subContext: string) => Promise<string>;
  // Whitelisted globals
  JSON: typeof JSON;
  Math: typeof Math;
  Date: typeof Date;
  RegExp: typeof RegExp;
  Array: typeof Array;
  Object: typeof Object;
  String: typeof String;
  Number: typeof Number;
  Boolean: typeof Boolean;
  Promise: typeof Promise;
  console: { log: (...args: any[]) => void };
}

// For large context streaming
interface ContextProvider {
  size: number;
  slice: (start: number, end: number) => Promise<string>;
  search?: (pattern: RegExp) => Promise<string[]>;
}
```

---

## Sandbox Security Model

### Whitelisted Globals (QuickJS)
```typescript
const SAFE_GLOBALS = {
  // Primitives
  String, Number, Boolean, BigInt, Symbol,

  // Collections
  Array, Object, Map, Set, WeakMap, WeakSet,

  // JSON
  JSON: { parse: JSON.parse, stringify: JSON.stringify },

  // Math (read-only)
  Math,

  // Date (read-only creation)
  Date,

  // Regex
  RegExp,

  // Promises (for parallel execution)
  Promise,

  // Console (captured)
  console: { log: capturedLog },

  // Utilities
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent,
};
```

### Forbidden Operations
- File system access
- Network requests (except through recursiveLlm)
- Process/OS access
- Dynamic imports
- eval/Function constructor
- Prototype pollution

---

## Verification Plan

1. **Unit Tests**: Each module with >80% coverage
2. **Integration Tests**: Full completion flows
3. **Benchmark Tests**: Compare against Python implementation
4. **Security Tests**: Sandbox escape attempts
5. **Load Tests**: 1M+ token contexts

### Test Commands
```bash
bun test                        # Run all tests
bun test:unit                   # Unit tests only
bun test:integration            # Integration tests
bun test:benchmark              # Performance benchmarks
bun test:security               # Sandbox security tests
```

---

## Dependencies

```json
{
  "dependencies": {
    "ai": "^6.0.0",                    // Vercel AI SDK
    "@anthropic-ai/sdk": "^0.40.0",    // Anthropic SDK
    "openai": "^4.80.0",               // OpenAI SDK
    "@aspect-sh/quickjs": "^2.0.0",    // QuickJS WebAssembly sandbox
    "zod": "^3.24.0",                  // Schema validation
    "eventemitter3": "^5.0.0",         // Event emitter
    "pino": "^9.0.0"                   // Structured logging
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

---

## Critical Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `src/rlm.ts` | Main RLM class | P0 |
| `src/types.ts` | Type definitions | P0 |
| `src/sandbox/executor.ts` | QuickJS sandbox | P0 |
| `src/parser/final.ts` | FINAL extraction | P0 |
| `src/prompts/system.ts` | System prompts | P0 |
| `src/providers/unified.ts` | AI SDK wrapper | P1 |
| `src/resilience/retry.ts` | Retry logic | P1 |
| `src/streaming/events.ts` | Event emitter | P2 |
| `src/observability/metrics.ts` | Metrics | P2 |

---

---

## Design Validation Against Research Paper

### Core Principles Preserved

| Paper Principle | TypeScript Implementation | Status |
|-----------------|---------------------------|--------|
| Context as variable (not in prompt) | `SandboxEnvironment.context` stored externally | PRESERVED |
| Programmatic exploration via REPL | QuickJS sandbox executes LLM-generated code | PRESERVED |
| Recursive decomposition | `recursiveLlm()` function with depth tracking | PRESERVED |
| Cheaper models at depth > 0 | `recursiveModel` config option | PRESERVED |
| FINAL() termination marker | `parser/final.ts` regex extraction | PRESERVED |
| Output truncation (2000 chars) | `maxOutputChars` config, truncation logic | PRESERVED |
| Depth limiting | `maxDepth` with graceful degradation | PRESERVED |

### Enhancements Aligned with Paper's Future Work

The paper explicitly suggested these future directions, which our design implements:

1. **"Asynchronous Sub-calls"** (Paper Section 6.2)
   → Our `Promise.all` parallel recursive calls

2. **"Deeper Recursion Exploration"** (Paper Section 6.3)
   → Configurable `maxDepth`, sub-RLM tracking

3. **"Smarter Chunking Strategies"** (Paper Section 6.1)
   → Multi-strategy execution with consensus

4. **"Output Token Management"** (Paper Section 5.4)
   → Intelligent message history pruning

5. **"Verification Strategies"** (Paper Section 5.5)
   → Confidence scoring in FINAL_WITH_CONFIDENCE

---

## Key Learnings & Decisions

### 1. Why QuickJS over vm2
vm2 has critical security vulnerabilities (CVSS 10 sandbox escapes). QuickJS runs in WebAssembly isolation, providing true security boundary.

### 2. Why Vercel AI SDK over direct SDKs
Unified provider API means we can switch between Claude/GPT/Gemini without code changes. 20M+ downloads validates production readiness.

### 3. Why Event Emitter Pattern
RLM operations can take minutes. Streaming progress via events provides real-time feedback without blocking.

### 4. Why Bun over Node.js
Anthropic acquired Bun specifically for AI tooling. Native TypeScript, faster startup, better async handling.

### 5. Message History Pruning Strategy
The paper noted "redundant verification attempts" as a limitation. Summarizing older messages reduces token waste while preserving context.

### 6. Cost Budget as Safety Net
Paper showed 95th percentile costs can be 10x median. Hard budget limits prevent runaway costs on edge cases.

---

## Sources

- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [QuickJS WebAssembly Sandbox](https://sebastianwessel.github.io/quickjs/)
- [Bun joins Anthropic](https://bun.com/blog/bun-joins-anthropic)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
