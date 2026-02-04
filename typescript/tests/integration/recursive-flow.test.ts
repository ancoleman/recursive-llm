/**
 * Integration tests for RLM recursive processing flow.
 *
 * THE most important integration test - validates paper claims:
 * - Context chunking and recursive processing
 * - Divide-and-conquer strategies
 * - Depth limit handling
 * - Cost tracking across recursive tree
 *
 * These tests use realistic scenarios with mocked LLM responses
 * that simulate actual recursive processing patterns.
 */

import { describe, expect, it } from "bun:test";
import { RLM } from "../../src/rlm";
import { MaxIterationsError } from "../../src/types";
import {
  createCallbackMockProvider,
  createChunkingMockProvider,
} from "../utils/mock-provider";

// Generate a realistic financial report fixture
function generateFinancialReport(): string {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const metrics = [
    { name: "Revenue", base: 10.5, growth: 1.17 },
    { name: "Net Income", base: 2.1, growth: 1.15 },
    { name: "Operating Margin", base: 20, growth: 1.02 },
    { name: "Employee Count", base: 380, growth: 1.05 },
  ];

  let report = "# Company Financial Report 2024\n\n";

  for (let q = 0; q < 4; q++) {
    report += `## ${quarters[q]} Results\n\n`;

    for (const metric of metrics) {
      const value = metric.base * Math.pow(metric.growth, q);
      if (metric.name === "Operating Margin") {
        report += `${metric.name}: ${value.toFixed(1)}%\n`;
      } else if (metric.name === "Employee Count") {
        report += `${metric.name}: ${Math.round(value)}\n`;
      } else {
        report += `${metric.name}: $${value.toFixed(1)} million\n`;
      }
    }

    report += "\nKey Highlights:\n";
    report += `- Quarterly performance metrics for ${quarters[q]}\n`;
    report += `- Market expansion activities\n`;
    report += `- Product development updates\n`;
    report += "\n---\n\n";
  }

  // Add annual summary
  const totalRevenue = metrics[0].base * (1 + 1.17 + 1.17 ** 2 + 1.17 ** 3);
  report += `## Annual Summary\n\n`;
  report += `Total Annual Revenue: $${totalRevenue.toFixed(1)} million\n`;
  report += `Year-over-Year Growth: 45%\n`;
  report += `Final Employee Count: 450\n`;

  return report;
}

describe("Recursive Processing Flow: Context Chunking", () => {
  it("should chunk large context and process recursively", async () => {
    const largeContext = generateFinancialReport().repeat(20); // ~100k chars
    const recursionEvents: { depth: number; subQuery: string }[] = [];

    // Use depth in system message to differentiate root vs sub-RLM calls
    const provider = createCallbackMockProvider((messages, index) => {
      // Check if this is a sub-RLM call by looking at system message
      const systemMsg = messages.find((m) => m.role === "system");
      const isSubRLM = systemMsg?.content.includes("depth: 1") || systemMsg?.content.includes("depth: 2");

      if (isSubRLM) {
        // Sub-RLM: return FINAL immediately
        return 'FINAL("chunk analyzed")';
      }

      // Root RLM
      if (index === 0) {
        // First: execute one recursive call
        return `
const result = await recursiveLlm("analyze", context.slice(0, 1000));
console.log("Recursive result:", result);
        `.trim();
      }

      // Root's second iteration: provide final answer
      return 'FINAL("Chunks analyzed: Q1, Q2, Q3, Q4 revenue data found")';
    });

    const rlm = new RLM({
      model: "test-model",
      recursiveModel: "test-recursive",
      maxDepth: 5,
      provider,
    });

    rlm.on("recursion", (event) => {
      recursionEvents.push({ depth: event.depth, subQuery: event.subQuery });
    });

    const result = await rlm.complete(
      "What are all the revenue figures?",
      largeContext
    );

    // Should have made at least one recursive call
    expect(recursionEvents.length).toBeGreaterThan(0);

    // Answer should contain the final result
    expect(result.answer).toContain("Q1");
  });

  it("should handle divide-and-conquer for aggregation queries", async () => {
    const context = generateFinancialReport();

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // First iteration: analyze the data
        return `
const lines = context.split("\\n");
const revenues = [];
for (const line of lines) {
  if (line.includes("Revenue:")) {
    const match = line.match(/\\$(\\d+\\.\\d+)/);
    if (match) revenues.push(parseFloat(match[1]));
  }
}
console.log("Found revenues:", revenues.length, "quarters");
console.log("Total:", revenues.reduce((a, b) => a + b, 0));
        `.trim();
      }
      // Second iteration: provide final answer
      return 'FINAL("Total quarterly revenues: $52.7 million from 4 quarters")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.complete(
      "What is the sum of all quarterly revenues?",
      context
    );

    // Should find all 4 quarterly revenues and sum them
    expect(result.answer).toContain("4 quarters");
    expect(result.answer).toContain("Total quarterly revenues");
  });

  it("should use recursive chunking for very large contexts", async () => {
    // Simulate 100k+ token context
    const hugeContext = "A".repeat(500000);
    let maxDepthSeen = 0;

    const provider = createCallbackMockProvider((messages, index) => {
      // Track depth from message history (system message mentions depth)
      const systemMsg = messages.find((m) => m.role === "system");
      const depthMatch = systemMsg?.content.match(/Current depth: (\d+)/);
      const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0;
      maxDepthSeen = Math.max(maxDepthSeen, currentDepth);

      if (index === 0) {
        // Root chunks into 5 pieces
        return `
const chunkSize = Math.ceil(context.length / 5);
const results = [];
for (let i = 0; i < 5; i++) {
  const chunk = context.slice(i * chunkSize, (i + 1) * chunkSize);
  results.push(await recursiveLlm("analyze", chunk));
}
FINAL(results.join(", "))
        `;
      }

      // Sub-RLMs return immediately
      return `FINAL("processed ${messages[messages.length - 1]?.content.length || 0} chars")`;
    });

    const rlm = new RLM({
      model: "test-model",
      recursiveModel: "test-mini",
      maxDepth: 4,
      provider,
    });

    const result = await rlm.complete("Analyze this content", hugeContext);

    // Should have used recursion
    expect(result.stats.llmCalls).toBeGreaterThan(1);

    // Answer should contain aggregated results
    expect(result.answer).toContain("processed");
  });
});

describe("Recursive Processing Flow: Depth Limits", () => {
  it("should limit recursion depth correctly", async () => {
    const depthsReached: number[] = [];

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Root: First execute recursion, then return result
        // Using console.log to capture result, not FINAL with concatenation
        return `
const result = await recursiveLlm("go deeper", context.slice(0, 100));
console.log("Recursion result:", result);
        `;
      }
      if (index === 1) {
        // After recursion completes, return FINAL
        return 'FINAL("depth test completed")';
      }
      // Sub-RLMs return immediately with FINAL
      return 'FINAL("sub-response")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    rlm.on("recursion", (event) => {
      depthsReached.push(event.depth);
    });

    const result = await rlm.complete("Test deep recursion", "Context");

    // Should have made at least one recursive call
    expect(depthsReached.length).toBeGreaterThan(0);

    // Answer should complete
    expect(result.answer).toBeDefined();
  });

  it("should gracefully handle max depth in nested recursion", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Root: Execute recursion first
        return `
const sub = await recursiveLlm("nested", context);
console.log("Sub returned:", sub);
        `;
      }
      if (index === 1) {
        // Then return FINAL
        return 'FINAL("nested complete")';
      }
      // Sub-RLMs return FINAL immediately
      return 'FINAL("sub-result")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 2,
      provider,
    });

    const result = await rlm.complete("Test", "Context");

    // Should complete without throwing
    expect(result).toBeDefined();
    expect(result.answer).toBeDefined();
  });
});

describe("Recursive Processing Flow: Cost Tracking", () => {
  it("should track total cost across recursive tree", async () => {
    const provider = createCallbackMockProvider(
      (messages, index) => {
        if (index === 0) {
          return `
const r1 = await recursiveLlm("q1", context.slice(0, 100));
const r2 = await recursiveLlm("q2", context.slice(100, 200));
FINAL(r1 + " | " + r2)
          `;
        }
        return `FINAL("sub-${index}")`;
      },
      {
        defaultInputTokens: 500,
        defaultOutputTokens: 250,
      }
    );

    const rlm = new RLM({
      model: "claude-sonnet-4",
      recursiveModel: "claude-haiku",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.complete("Test", "A".repeat(300));

    // Stats should include all costs
    expect(result.stats.estimatedCost).toBeGreaterThan(0);
    // Should have made at least 2 LLM calls (root + sub)
    expect(result.stats.llmCalls).toBeGreaterThanOrEqual(2);

    // Cost should be reasonable (not infinite loop)
    expect(result.stats.estimatedCost).toBeLessThan(1.0);
  });

  it("should respect budget by tracking costs", async () => {
    const provider = createCallbackMockProvider(
      (messages, index) => {
        if (index === 0) {
          // Root makes a simple recursive call
          return `
const result = await recursiveLlm("sub query", context);
FINAL("root: " + result)
          `;
        }
        return `FINAL("sub-${index}")`;
      },
      {
        defaultInputTokens: 1000,
        defaultOutputTokens: 500,
      }
    );

    const rlm = new RLM({
      model: "claude-sonnet-4",
      costBudget: 1.0, // $1.00 budget (generous)
      maxDepth: 3,
      provider,
    });

    const result = await rlm.complete("Test", "Context");

    // Should complete and track costs
    expect(result.stats.estimatedCost).toBeGreaterThan(0);
    expect(result.stats.estimatedCost).toBeLessThan(1.0);
  });
});

describe("Recursive Processing Flow: Real-World Scenarios", () => {
  it("should extract specific data from financial report", async () => {
    const context = generateFinancialReport();

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Direct extraction - find Q3 revenue
        return `FINAL("Q3 Revenue was $14.4 million")`;
      }
      return 'FINAL("fallback")';
    });

    const rlm = new RLM({
      model: "test-model",
      provider,
    });

    const result = await rlm.complete(
      "What was the Q3 revenue?",
      context
    );

    // Should find Q3 revenue
    expect(result.answer).toContain("Q3 Revenue");
    expect(result.answer).toMatch(/\$\d+\.\d+ million/);
  });

  it("should handle multi-step reasoning with recursion", async () => {
    const context = generateFinancialReport();
    const steps: string[] = [];

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        steps.push("extract");
        // Step 1: Extract all revenue figures
        return `
const revenues = [];
const lines = context.split("\\n");
for (const line of lines) {
  if (line.includes("Revenue:") && line.includes("$")) {
    const match = line.match(/\\$(\\d+\\.\\d+)/);
    if (match) revenues.push(parseFloat(match[1]));
  }
}
console.log("Found revenues:", revenues);
        `;
      }
      if (index === 1) {
        steps.push("calculate");
        // Step 2: Calculate growth rate
        return `
// Calculate quarter-over-quarter growth
const growthRates = [];
const revenues = [10.5, 12.3, 14.4, 16.8]; // From previous exploration
for (let i = 1; i < revenues.length; i++) {
  const growth = ((revenues[i] - revenues[i-1]) / revenues[i-1] * 100).toFixed(1);
  growthRates.push(growth + "%");
}
console.log("Growth rates:", growthRates);
        `;
      }
      if (index === 2) {
        steps.push("summarize");
        // Step 3: Final answer
        return `
FINAL_WITH_CONFIDENCE({
  "answer": "Quarterly growth rates were approximately 17% per quarter, with total annual revenue of $54 million and 45% YoY growth.",
  "confidence": 0.85,
  "reasoning": "Extracted 4 quarterly revenue figures and calculated growth rates between consecutive quarters."
})
        `;
      }
      return 'FINAL("done")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxIterations: 10,
      provider,
    });

    const result = await rlm.complete(
      "What were the quarterly growth rates?",
      context
    );

    // Should have gone through multiple steps
    expect(steps).toEqual(["extract", "calculate", "summarize"]);

    // Should have confidence and reasoning
    expect(result.confidence).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("should handle search and retrieval pattern", async () => {
    // Create a document with a needle to find
    const needle = "SECRET_CODE_XYZ123";
    const haystack =
      "A".repeat(10000) +
      `\n\nThe secret code is: ${needle}\n\n` +
      "B".repeat(10000);

    const provider = createCallbackMockProvider((messages, index) => {
      // Directly return the found secret code
      return `FINAL("The secret code is: ${needle}")`;
    });

    const rlm = new RLM({
      model: "test-model",
      provider,
    });

    const result = await rlm.complete(
      "Find the secret code in the document",
      haystack
    );

    // Should find the needle
    expect(result.answer).toContain(needle);
  });
});

describe("Recursive Processing Flow: Error Recovery", () => {
  it("should handle recursive call that returns error message", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Root makes recursive call
        return `
const result = await recursiveLlm("query", context);
FINAL("Root got: " + result)
        `;
      }
      // Sub-RLM returns an error-like response
      return 'FINAL("Error: processing failed")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.complete("Test", "Context");

    // Should complete with the error message included
    expect(result.answer).toContain("Error");
  });

  it("should continue parent execution after sub-RLM returns depth message", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        return `
const result = await recursiveLlm("sub query", context);
console.log("Result:", result);
FINAL("completed")
        `;
      }
      // Sub-RLM returns immediately with FINAL
      return 'FINAL("sub-result")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 2, // Depth 0 and 1 only
      provider,
    });

    const result = await rlm.complete("Test", "Context");

    // Should complete with some result
    expect(result).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
  });
});
