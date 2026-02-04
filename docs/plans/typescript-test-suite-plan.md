# RLM TypeScript - Comprehensive Test Plan

## Executive Summary

Build a comprehensive test suite for the TypeScript RLM implementation that:
1. Validates all implemented features work correctly
2. Provides real-world examples demonstrating positive impact
3. Proves the enhancements over Python deliver measurable improvements
4. Establishes confidence for production readiness

---

## Current Test Coverage Analysis

### What's Well Tested (Keep)
| Module | Coverage | Tests |
|--------|----------|-------|
| Parser | 100% | 35 tests - FINAL extraction, code blocks |
| Sandbox Security | 100% | 10 tests - forbidden patterns, whitelisting |
| Sandbox Execution | 90% | 13 tests - basic code execution |
| Basic RLM Flow | 70% | 20 tests - completion loop, events |

### Critical Gaps (Must Fix)
| Feature | Current Coverage | Impact |
|---------|-----------------|--------|
| **Recursive RLM Calls** | 0% | Core innovation untested |
| **Cost Budget** | 0% | Production safety feature |
| **ContextProvider** | 0% | Large file handling |
| **Real Provider Integration** | Mocks only | No real LLM validation |
| **Stress Testing** | 0% | 100k+ context claims |

---

## Test Suite Architecture

```
ts/tests/
├── unit/                          # Fast, isolated tests
│   ├── parser.test.ts            # ✓ EXISTS - well covered
│   ├── sandbox.test.ts           # ✓ EXISTS - well covered
│   ├── rlm.test.ts               # ✓ EXISTS - needs expansion
│   ├── cost.test.ts              # NEW - cost tracking/budgeting
│   ├── recursion.test.ts         # NEW - recursive RLM logic
│   └── providers.test.ts         # NEW - provider adapters
│
├── integration/                   # Full flow tests with mocks
│   ├── completion-flow.test.ts   # NEW - end-to-end completion
│   ├── recursive-flow.test.ts    # NEW - recursive processing
│   ├── error-recovery.test.ts    # NEW - failure scenarios
│   └── event-streaming.test.ts   # NEW - event emission
│
├── e2e/                          # Real-world with real APIs
│   ├── anthropic.test.ts         # NEW - real Claude API
│   ├── openai.test.ts            # NEW - real OpenAI API
│   └── long-context.test.ts      # NEW - 100k+ token tests
│
├── benchmarks/                   # Performance validation
│   ├── token-efficiency.bench.ts # NEW - vs direct approach
│   ├── accuracy.bench.ts         # NEW - correctness rates
│   └── cost-comparison.bench.ts  # NEW - cost savings
│
├── fixtures/                     # Test data
│   ├── documents/                # Real-world document samples
│   │   ├── financial-report.txt  # ~60k tokens
│   │   ├── legal-contract.txt    # ~40k tokens
│   │   ├── codebase-dump.txt     # ~100k tokens
│   │   └── research-paper.txt    # ~30k tokens
│   └── queries/                  # Test query sets
│       ├── extraction.json       # Data extraction queries
│       ├── aggregation.json      # Counting/summarization
│       └── search.json           # Needle-in-haystack
│
└── utils/                        # Test helpers
    ├── mock-provider.ts          # Enhanced mock LLM
    ├── fixtures.ts               # Fixture loading
    ├── assertions.ts             # Custom matchers
    └── metrics.ts                # Benchmark utilities
```

---

## Phase 1: Unit Test Expansion

### 1.1 Recursive RLM Tests (`recursion.test.ts`)

**Why Critical**: Recursive processing is THE core innovation of RLM. Currently 0% tested.

```typescript
describe("RLM Recursion", () => {
  // Sub-RLM Creation
  it("should create sub-RLM with incremented depth")
  it("should use recursiveModel for depth > 0")
  it("should pass remaining cost budget to sub-RLM")
  it("should accumulate stats from sub-RLM to parent")

  // Depth Management
  it("should stop recursion at maxDepth")
  it("should return graceful message when depth exceeded")
  it("should track maxDepthReached in stats")

  // Parallel Recursion
  it("should support Promise.all for parallel sub-calls")
  it("should accumulate stats from parallel sub-calls")
  it("should not exceed cost budget across parallel calls")

  // Error Handling
  it("should handle sub-RLM failures gracefully")
  it("should propagate meaningful error messages up")
  it("should continue if one parallel call fails")
});
```

### 1.2 Cost Budget Tests (`cost.test.ts`)

**Why Critical**: Production safety - prevents runaway costs.

```typescript
describe("Cost Management", () => {
  // Tracking
  it("should track input/output tokens per call")
  it("should calculate cost using MODEL_PRICING")
  it("should estimate cost for unknown models")

  // Budget Enforcement
  it("should throw CostBudgetExceededError when budget exceeded")
  it("should emit costWarning event at 80% budget")
  it("should stop execution before exceeding budget")

  // Recursive Budget
  it("should deduct cost from budget before recursive call")
  it("should pass remaining budget to sub-RLM")
  it("should accumulate total cost from recursive tree")

  // Accuracy
  it("should match expected cost for known Claude models")
  it("should match expected cost for known OpenAI models")
});
```

### 1.3 Provider Tests (`providers.test.ts`)

**Why Critical**: Ensure all provider adapters work correctly.

```typescript
describe("Providers", () => {
  describe("OpenAIProvider", () => {
    it("should format messages correctly")
    it("should extract tokens from response")
    it("should handle API errors")
  });

  describe("AnthropicProvider", () => {
    it("should separate system message")
    it("should extract tokens from usage object")
    it("should handle API errors")
  });

  describe("VercelAIProvider", () => {
    it("should adapt generateText interface")
    it("should extract usage metrics")
  });

  describe("FetchProvider", () => {
    it("should make correct HTTP request")
    it("should handle timeout")
    it("should parse response correctly")
  });
});
```

---

## Phase 2: Integration Tests

### 2.1 Complete Flow Tests (`completion-flow.test.ts`)

```typescript
describe("Completion Flow", () => {
  // Multi-Iteration
  it("should complete in multiple iterations")
  it("should maintain message history across iterations")
  it("should handle REPL errors and recover")

  // Code Execution
  it("should execute LLM-generated code in sandbox")
  it("should capture console.log output")
  it("should pass output back to LLM")

  // Final Extraction
  it("should extract FINAL from any iteration")
  it("should extract FINAL_VAR with sandbox variables")
  it("should extract FINAL_WITH_CONFIDENCE")
});
```

### 2.2 Recursive Flow Tests (`recursive-flow.test.ts`)

**The most important integration test - validates paper claims.**

```typescript
describe("Recursive Processing Flow", () => {
  it("should chunk large context and process recursively", async () => {
    // Simulate LLM chunking a 100k context into 10 chunks
    const mockProvider = createChunkingMockProvider([
      // Iteration 1: LLM decides to chunk
      `const chunkSize = 10000;
       const results = [];
       for (let i = 0; i < context.length; i += chunkSize) {
         results.push(await recursiveLlm(query, context.slice(i, i + chunkSize)));
       }
       console.log(results);`,
      // Sub-calls respond with partial answers
      'FINAL("chunk 0: revenue mentioned")',
      'FINAL("chunk 1: Q1 data found")',
      // ... more chunks
      // Final iteration: aggregate
      `const answer = results.join(". ");
       FINAL(answer)`
    ]);

    const rlm = new RLM({ model: "test", recursiveModel: "test-mini", provider: mockProvider });
    const result = await rlm.completion("Find all revenue mentions", largeContext);

    expect(result.stats.maxDepthReached).toBeGreaterThan(0);
    expect(result.stats.llmCalls).toBeGreaterThan(2);
  });

  it("should handle divide-and-conquer for aggregation queries")
  it("should limit recursion depth correctly")
  it("should track total cost across recursive tree")
});
```

### 2.3 Error Recovery Tests (`error-recovery.test.ts`)

```typescript
describe("Error Recovery", () => {
  it("should recover from REPL syntax errors")
  it("should recover from REPL runtime errors")
  it("should recover from forbidden code attempts")
  it("should handle partial LLM responses")
  it("should handle LLM API failures with retry")
  it("should handle timeout gracefully")
});
```

---

## Phase 3: End-to-End Tests with Real APIs

### 3.1 Anthropic Integration (`anthropic.test.ts`)

**Requires**: `ANTHROPIC_API_KEY` environment variable

```typescript
describe("Anthropic E2E", () => {
  it("should complete simple query with Claude", async () => {
    const provider = new AnthropicProvider(new Anthropic());
    const rlm = new RLM({ model: "claude-haiku", provider });

    const result = await rlm.completion(
      "What is 2+2?",
      "Math context: arithmetic operations"
    );

    expect(result.answer).toContain("4");
    expect(result.stats.estimatedCost).toBeGreaterThan(0);
  });

  it("should handle medium context (10k chars)")
  it("should use recursiveModel for depth > 0")
  it("should track real token usage accurately")
});
```

### 3.2 Long Context Tests (`long-context.test.ts`)

**The Paper's Main Claim**: RLM handles 100k+ tokens without degradation.

```typescript
describe("Long Context Processing", () => {
  it("should process 60k token document accurately", async () => {
    const document = loadFixture("financial-report.txt"); // ~60k tokens
    const provider = new AnthropicProvider(new Anthropic());
    const rlm = new RLM({
      model: "claude-sonnet-4",
      recursiveModel: "claude-haiku",
      provider
    });

    const result = await rlm.completion(
      "What was the Q3 revenue?",
      document
    );

    // Verify correctness (known answer in fixture)
    expect(result.answer).toContain("14.1 million");

    // Verify efficiency (should NOT use 60k tokens in prompt)
    expect(result.stats.totalTokens).toBeLessThan(10000);
  });

  it("should maintain accuracy with 100k+ context")
  it("should use recursive chunking for very large contexts")
});
```

---

## Phase 4: Benchmark Tests

### 4.1 Token Efficiency (`token-efficiency.bench.ts`)

**Proves Enhancement**: RLM uses 40x fewer tokens than direct approach.

```typescript
describe("Token Efficiency Benchmark", () => {
  it("should use <5k tokens for 60k context query", async () => {
    const document = loadFixture("financial-report.txt");
    const result = await rlm.completion("What was Q3 revenue?", document);

    // Direct approach would use ~15k tokens (60k/4)
    // RLM should use <5k tokens
    expect(result.stats.totalTokens).toBeLessThan(5000);

    console.log(`Token efficiency: ${document.length / 4} direct vs ${result.stats.totalTokens} RLM`);
  });
});
```

### 4.2 Accuracy Comparison (`accuracy.bench.ts`)

**Proves Enhancement**: RLM achieves 80%+ accuracy where direct LLM fails.

```typescript
describe("Accuracy Benchmark", () => {
  const testCases = loadFixture("queries/extraction.json");

  it("should achieve >80% accuracy on extraction tasks", async () => {
    let correct = 0;
    for (const tc of testCases) {
      const result = await rlm.completion(tc.query, tc.context);
      if (result.answer.includes(tc.expectedAnswer)) correct++;
    }

    const accuracy = correct / testCases.length;
    expect(accuracy).toBeGreaterThan(0.8);
    console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}%`);
  });
});
```

### 4.3 Cost Comparison (`cost-comparison.bench.ts`)

**Proves Enhancement**: RLM costs comparable or less than direct approach.

```typescript
describe("Cost Comparison Benchmark", () => {
  it("should cost less than direct approach for large contexts", async () => {
    const document = loadFixture("financial-report.txt");

    // RLM approach
    const rlmResult = await rlm.completion("Summarize Q3", document);
    const rlmCost = rlmResult.stats.estimatedCost;

    // Direct approach would cost ~$0.045 for 60k context (Claude Sonnet)
    // (15k input tokens * $3/M = $0.045)
    const directCost = (document.length / 4) * 0.000003;

    console.log(`Cost: $${rlmCost.toFixed(4)} RLM vs $${directCost.toFixed(4)} direct`);

    // RLM should be comparable or cheaper
    expect(rlmCost).toBeLessThan(directCost * 2);
  });
});
```

---

## Phase 5: Real-World Example Scenarios

### 5.1 Financial Document Analysis

```typescript
// examples/financial-analysis.ts
/**
 * Demonstrates RLM analyzing a large financial report.
 * Shows: recursive chunking, accurate extraction, cost efficiency
 */
const document = loadFixture("financial-report.txt"); // 60k tokens

const queries = [
  "What was the total annual revenue?",
  "What were the quarterly growth rates?",
  "What were the key highlights for Q3?",
  "How many employees at year end?",
];

for (const query of queries) {
  const result = await rlm.completion(query, document);
  console.log(`Q: ${query}`);
  console.log(`A: ${result.answer}`);
  console.log(`Tokens: ${result.stats.totalTokens}, Cost: $${result.stats.estimatedCost.toFixed(4)}`);
}
```

### 5.2 Codebase Search

```typescript
// examples/codebase-search.ts
/**
 * Demonstrates RLM searching through a large codebase dump.
 * Shows: keyword search, recursive exploration, accurate location
 */
const codebase = loadFixture("codebase-dump.txt"); // 100k+ tokens

const result = await rlm.completion(
  "Find all functions that handle authentication",
  codebase
);

// Should find specific functions with file paths
expect(result.answer).toContain("authenticate");
```

### 5.3 Legal Contract Review

```typescript
// examples/legal-review.ts
/**
 * Demonstrates RLM extracting clauses from legal documents.
 * Shows: precise extraction, multi-step reasoning, confidence scoring
 */
const contract = loadFixture("legal-contract.txt");

const result = await rlm.completion(
  "What are the termination conditions?",
  contract
);

// With confidence scoring
if (result.confidence && result.confidence < 0.8) {
  console.warn("Low confidence - manual review recommended");
}
```

---

## Test Fixtures

### Documents to Create

| File | Size | Content | Use Case |
|------|------|---------|----------|
| `financial-report.txt` | ~60k tokens | Q1-Q4 financial data | Extraction, aggregation |
| `legal-contract.txt` | ~40k tokens | Multi-section contract | Clause extraction |
| `codebase-dump.txt` | ~100k tokens | TypeScript code | Search, navigation |
| `research-paper.txt` | ~30k tokens | Academic paper | Summarization |

### Query Sets to Create

| File | Queries | Type | Expected |
|------|---------|------|----------|
| `extraction.json` | 20 | Find specific facts | Known answers |
| `aggregation.json` | 15 | Count/sum operations | Numeric answers |
| `search.json` | 15 | Needle-in-haystack | Boolean + location |

---

## Test Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test tests/unit/",
    "test:integration": "bun test tests/integration/",
    "test:e2e": "bun test tests/e2e/",
    "test:benchmark": "bun test tests/benchmarks/",
    "test:all": "bun test tests/",
    "test:ci": "bun test tests/unit/ tests/integration/",
    "test:coverage": "bun test --coverage"
  }
}
```

---

## Success Criteria

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Unit Test Coverage | >90% | `bun test --coverage` |
| Integration Tests | All pass | CI pipeline |
| E2E Tests | >80% pass | Real API tests |
| Token Efficiency | <10% of context | Benchmark |
| Accuracy | >80% on test set | Benchmark |
| Cost Efficiency | <2x direct | Benchmark |

### Qualitative Validation

- [ ] Recursive processing demonstrated working
- [ ] Cost budgeting prevents runaway costs
- [ ] Real provider integration functional
- [ ] 100k+ context handling validated
- [ ] Error recovery robust
- [ ] Events streaming correctly

---

## Implementation Priority

### P0 - Critical (Before Release)
1. `recursion.test.ts` - Core innovation validation
2. `cost.test.ts` - Production safety
3. `recursive-flow.test.ts` - Integration validation
4. Financial report fixture + tests

### P1 - Important (First Week)
5. `providers.test.ts` - Provider correctness
6. `completion-flow.test.ts` - Full flow validation
7. `error-recovery.test.ts` - Resilience
8. E2E tests with real APIs

### P2 - Nice to Have (Later)
9. Benchmark tests
10. Additional fixtures
11. Stress tests
12. Performance regression tests

---

## Files to Create

| File | Priority | Tests | LOC Est |
|------|----------|-------|---------|
| `tests/unit/recursion.test.ts` | P0 | 15 | 200 |
| `tests/unit/cost.test.ts` | P0 | 12 | 150 |
| `tests/unit/providers.test.ts` | P1 | 15 | 180 |
| `tests/integration/completion-flow.test.ts` | P1 | 10 | 150 |
| `tests/integration/recursive-flow.test.ts` | P0 | 8 | 200 |
| `tests/integration/error-recovery.test.ts` | P1 | 10 | 120 |
| `tests/e2e/anthropic.test.ts` | P1 | 5 | 100 |
| `tests/e2e/long-context.test.ts` | P1 | 5 | 120 |
| `tests/benchmarks/token-efficiency.bench.ts` | P2 | 3 | 80 |
| `tests/benchmarks/accuracy.bench.ts` | P2 | 3 | 100 |
| `tests/utils/mock-provider.ts` | P0 | N/A | 100 |
| `tests/fixtures/documents/*` | P0 | N/A | 4 files |
| `examples/financial-analysis.ts` | P1 | N/A | 80 |
| `examples/codebase-search.ts` | P2 | N/A | 60 |

---

## Verification Steps

After implementation:

1. **Run Unit Tests**: `bun test tests/unit/`
2. **Run Integration Tests**: `bun test tests/integration/`
3. **Run E2E Tests** (with API keys): `ANTHROPIC_API_KEY=xxx bun test tests/e2e/`
4. **Run Benchmarks**: `bun test tests/benchmarks/`
5. **Check Coverage**: `bun test --coverage`
6. **Run Examples**: `bun examples/financial-analysis.ts`

Expected Output:
```
✓ 74 existing tests pass
✓ 68 new tests pass (142 total)
✓ Coverage: 92%
✓ Benchmarks show 40x token efficiency
✓ E2E validates real API integration
✓ Examples demonstrate real-world value
```
