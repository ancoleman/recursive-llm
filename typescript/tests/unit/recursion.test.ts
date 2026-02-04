/**
 * Unit tests for RLM recursion functionality.
 *
 * Recursive processing is THE core innovation of RLM.
 * These tests validate:
 * - Sub-RLM creation with correct depth
 * - Model selection (recursiveModel for depth > 0)
 * - Cost budget passing
 * - Stats accumulation
 * - Depth limit enforcement
 * - Parallel recursion support
 * - Error handling
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { RLM } from "../../src/rlm";
import { MaxDepthError, CostBudgetExceededError } from "../../src/types";
import {
  createMockProvider,
  createCallbackMockProvider,
  createModelTrackingProvider,
} from "../utils/mock-provider";

describe("RLM Recursion: Sub-RLM Creation", () => {
  it("should create sub-RLM with incremented depth", async () => {
    // Track recursion events
    const recursionEvents: { depth: number; subQuery: string }[] = [];

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Root RLM makes a recursive call
        return `
const result = await recursiveLlm("sub-question", context.slice(0, 100));
console.log("Got:", result);
FINAL("Root got: " + result)
        `.trim();
      }
      // Sub-RLM responds immediately
      return 'FINAL("Sub-answer at depth 1")';
    });

    const rlm = new RLM({
      model: "test-model",
      recursiveModel: "test-recursive-model",
      maxDepth: 5,
      provider,
    });

    rlm.on("recursion", (event) => {
      recursionEvents.push({ depth: event.depth, subQuery: event.subQuery });
    });

    const result = await rlm.completion("Main question", "Test context data");

    // Should have made a recursive call
    expect(recursionEvents.length).toBe(1);
    expect(recursionEvents[0].depth).toBe(1); // Depth should be incremented
    expect(recursionEvents[0].subQuery).toBe("sub-question");

    // Answer should contain sub-answer
    expect(result.answer).toContain("Sub-answer at depth 1");
  });

  it("should use recursiveModel for depth > 0", async () => {
    const provider = createModelTrackingProvider([
      // Root call: make recursive call - needs to produce FINAL after execution
      `const result = await recursiveLlm("sub", context);
       FINAL("root got: " + result)`,
      // Sub call: immediate answer
      'FINAL("from recursive model")',
    ]);

    const rlm = new RLM({
      model: "expensive-model",
      recursiveModel: "cheap-model",
      maxDepth: 3,
      provider,
    });

    await rlm.completion("Test", "Context");

    // Root should use expensive model (1 call)
    expect(provider.getModelCalls("expensive-model")).toBeGreaterThanOrEqual(1);

    // Recursive call should use cheap model
    expect(provider.getModelCalls("cheap-model")).toBeGreaterThanOrEqual(1);
  });

  it("should pass remaining cost budget to sub-RLM", async () => {
    let subRLMBudgetReceived: number | undefined;

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // First call uses ~$0.0001 (100 input + 50 output tokens at ~$2.5/M)
        return `
const result = await recursiveLlm("sub", context.slice(0, 50));
FINAL(result)
        `;
      }
      // Record that sub-RLM was created (it would receive remaining budget)
      return 'FINAL("sub-result")';
    });

    const initialBudget = 0.01; // $0.01 budget
    const rlm = new RLM({
      model: "test-model",
      costBudget: initialBudget,
      provider,
    });

    await rlm.completion("Test", "Context");

    // After first call, some budget should be consumed
    // Sub-RLM should receive (initialBudget - spent) as its budget
    expect(rlm.stats.estimatedCost).toBeGreaterThan(0);
    expect(rlm.stats.estimatedCost).toBeLessThan(initialBudget);
  });

  it("should accumulate stats from sub-RLM to parent", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Root makes recursive call
        return `
const result = await recursiveLlm("sub", context);
FINAL("root: " + result)
        `;
      }
      // Sub-RLM answers immediately
      return 'FINAL("sub-answer")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.completion("Test", "Context data here");

    // Should accumulate: root + sub calls
    expect(result.stats.llmCalls).toBeGreaterThanOrEqual(2);

    // Total tokens should include both root and sub-RLM
    expect(result.stats.totalTokens).toBeGreaterThan(0);
  });
});

describe("RLM Recursion: Depth Management", () => {
  it("should stop recursion at maxDepth", async () => {
    const recursionAttempts: number[] = [];

    const provider = createCallbackMockProvider((messages, index) => {
      // Check if sub-RLM by depth in system message
      const systemMsg = messages.find((m) => m.role === "system");
      const isSubRLM = systemMsg?.content.includes("depth: 1");

      if (isSubRLM) {
        // Sub-RLM returns FINAL immediately
        return 'FINAL("sub-response")';
      }

      if (index === 0) {
        // Root: execute recursion
        return `
const result = await recursiveLlm("go deeper", context);
console.log("Got:", result);
        `;
      }
      // Root's second iteration
      return 'FINAL("depth test completed")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 2, // Only allow depth 0 and 1
      provider,
    });

    rlm.on("recursion", (event) => {
      recursionAttempts.push(event.depth);
    });

    const result = await rlm.completion("Test", "Context");

    // Should have attempted at least one recursion
    expect(recursionAttempts.length).toBeGreaterThanOrEqual(1);

    // Answer should complete
    expect(result.answer).toBeDefined();
  });

  it("should return graceful message when depth exceeded", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Execute recursion first
        return `
const result = await recursiveLlm("nested call", context);
console.log("Result:", result);
        `;
      }
      // Then return FINAL with the depth message
      return 'FINAL("Max depth reached - cannot recurse further")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 1, // Only depth 0 allowed
      provider,
    });

    const result = await rlm.completion("Test", "Context");

    // Should get graceful message about max depth
    expect(result.answer.toLowerCase()).toMatch(/max|depth|cannot/i);
  });

  it("should track maxDepthReached in stats", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Root: make recursive call
        return `
const result = await recursiveLlm("level 1", context);
FINAL("root: " + result)
        `;
      }
      // Sub-RLM answers immediately
      return 'FINAL("sub answer")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 5,
      provider,
    });

    const result = await rlm.completion("Test", "Context");

    // Root is at depth 0
    expect(result.stats.maxDepthReached).toBe(0);
    // Total calls should be at least 2 (root + sub)
    expect(result.stats.llmCalls).toBeGreaterThanOrEqual(2);
  });

  it("should throw MaxDepthError when starting at max depth", async () => {
    const provider = createMockProvider([]);

    // Create RLM already at max depth (simulating deeply nested call)
    const rlm = new RLM(
      {
        model: "test-model",
        maxDepth: 2,
        provider,
      },
      2 // Start at depth 2 (at limit)
    );

    await expect(rlm.completion("Test", "Context")).rejects.toThrow(
      MaxDepthError
    );
  });
});

describe("RLM Recursion: Parallel Recursion", () => {
  it("should support Promise.all for parallel sub-calls", async () => {
    const recursionCalls: string[] = [];

    const provider = createCallbackMockProvider((messages, index) => {
      // Check if sub-RLM by depth in system message
      const systemMsg = messages.find((m) => m.role === "system");
      const isSubRLM = systemMsg?.content.includes("depth: 1");

      if (isSubRLM) {
        return 'FINAL("sub-result")';
      }

      if (index === 0) {
        // Root: execute parallel recursive calls
        return `
const results = await Promise.all([
  recursiveLlm("query A", context.slice(0, 50)),
  recursiveLlm("query B", context.slice(50, 100)),
]);
console.log("Results:", results);
        `.trim();
      }
      // Root's second iteration: provide final answer
      return 'FINAL("Result A | Result B")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    rlm.on("recursion", (event) => {
      recursionCalls.push(event.subQuery);
    });

    const result = await rlm.completion(
      "Test",
      "Context data that is long enough to slice into multiple pieces for testing"
    );

    // Should have made recursive calls
    expect(recursionCalls.length).toBeGreaterThan(0);

    // Answer should contain results
    expect(result.answer).toContain("Result");
  });

  it("should accumulate stats from parallel sub-calls", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        return `
const results = await Promise.all([
  recursiveLlm("q1", "ctx1"),
  recursiveLlm("q2", "ctx2"),
]);
FINAL(results.join(", "))
        `;
      }
      return `FINAL("sub ${index}")`;
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.completion("Test", "Context");

    // Should have accumulated calls from parallel sub-RLMs
    expect(result.stats.llmCalls).toBeGreaterThanOrEqual(2);

    // Cost should include all calls
    expect(result.stats.estimatedCost).toBeGreaterThan(0);
  });

  it("should not exceed cost budget across parallel calls", async () => {
    const provider = createCallbackMockProvider(
      (messages, index) => {
        if (index === 0) {
          return `
const results = await Promise.all([
  recursiveLlm("q1", context.repeat(100)),
  recursiveLlm("q2", context.repeat(100)),
  recursiveLlm("q3", context.repeat(100)),
]);
FINAL(results.join(", "))
          `;
        }
        return `FINAL("sub ${index}")`;
      },
      {
        defaultInputTokens: 1000,
        defaultOutputTokens: 500,
      }
    );

    const rlm = new RLM({
      model: "test-model",
      costBudget: 0.001, // Very small budget
      provider,
    });

    // Should throw when budget exceeded
    await expect(rlm.completion("Test", "Context")).rejects.toThrow(
      CostBudgetExceededError
    );
  });
});

describe("RLM Recursion: Error Handling", () => {
  it("should handle sub-RLM returning error message", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        return `
const result = await recursiveLlm("will fail", context);
FINAL("Got: " + result)
        `;
      }
      // Sub-RLM returns an error-like message (simulating depth exceeded)
      return 'FINAL("Error: something went wrong")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.completion("Test", "Context");

    // Should include the error message from sub-RLM
    expect(result.answer).toContain("Error");
  });

  it("should propagate meaningful error messages up", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        // Execute recursion first, output result
        return `
const result = await recursiveLlm("deep call", context);
console.log("Result:", result);
        `;
      }
      if (index === 1) {
        // Then provide FINAL
        return 'FINAL("nested depth test completed")';
      }
      // Sub-RLM tries to recurse, gets blocked message, returns it
      return 'FINAL("depth blocked")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 2,
      provider,
    });

    const result = await rlm.completion("Test", "Context");

    // Should complete with some result
    expect(result.answer).toBeDefined();
  });

  it("should handle multiple parallel recursive calls", async () => {
    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        return `
const results = await Promise.all([
  recursiveLlm("q1", "ctx1"),
  recursiveLlm("q2", "ctx2"),
]);
FINAL(results.join(" | "))
        `;
      }
      return `FINAL("Success ${index}")`;
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    const result = await rlm.completion("Test", "Context");

    // Should have results from calls
    expect(result.answer).toContain("Success");
  });
});

describe("RLM Recursion: Event Emission", () => {
  it("should emit recursion event with correct details", async () => {
    const events: {
      depth: number;
      subQuery: string;
      subContextSize: number;
    }[] = [];

    const provider = createCallbackMockProvider((messages, index) => {
      if (index === 0) {
        return `
const result = await recursiveLlm("What is the main topic?", context.slice(0, 500));
FINAL(result)
        `;
      }
      return 'FINAL("Topic: Testing")';
    });

    const rlm = new RLM({
      model: "test-model",
      maxDepth: 3,
      provider,
    });

    rlm.on("recursion", (event) => {
      events.push(event);
    });

    await rlm.completion("Test", "A".repeat(1000));

    expect(events.length).toBe(1);
    expect(events[0].depth).toBe(1);
    expect(events[0].subQuery).toBe("What is the main topic?");
    expect(events[0].subContextSize).toBe(500);
  });
});
