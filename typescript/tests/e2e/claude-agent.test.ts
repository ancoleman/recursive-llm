/**
 * End-to-End Tests for RLM with Claude Agent SDK Provider
 *
 * These tests use the @anthropic-ai/claude-agent-sdk to run completions
 * against your Claude Pro/Max subscription.
 *
 * Prerequisites:
 * - Claude Code CLI installed
 * - Logged in via `claude login` with Pro/Max subscription
 *
 * Run these tests with:
 *   bun test tests/e2e/claude-agent.test.ts
 */

import { describe, expect, it, beforeAll, setDefaultTimeout } from "bun:test";
import { RLM } from "../../src/rlm";
import { ClaudeAgentProvider } from "../../src/providers/claude-agent";

// E2E tests need longer timeout for real API calls (2 minutes)
setDefaultTimeout(120_000);

// Skip if CI environment
const isCI = process.env.CI === "true";
const describeReal = isCI ? describe.skip : describe;

describeReal("E2E: Claude Agent Provider", () => {
  let provider: ClaudeAgentProvider;

  beforeAll(() => {
    provider = new ClaudeAgentProvider({
      debug: true,
    });
  });

  describe("Basic Completion", () => {
    it("should complete simple query", async () => {
      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is 2 + 2? Reply with just the number.",
        "Math context: basic arithmetic"
      );

      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(0);
      expect(result.answer).toMatch(/4/);
    });

    it("should track token usage", async () => {
      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete("Say hello.", "Greeting context");

      expect(result.stats.totalTokens).toBeGreaterThan(0);
      expect(result.stats.llmCalls).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Anti-Hallucination", () => {
    it("should refuse to hallucinate on insufficient context", async () => {
      // Deliberately small/irrelevant context - no revenue info
      const context = "The weather is nice today. The sky is blue.";

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is the company's revenue?",
        context
      );

      // Should indicate it can't find the answer, NOT make one up
      const answer = result.answer.toLowerCase();
      expect(
        answer.includes("cannot") ||
        answer.includes("not") ||
        answer.includes("no") ||
        answer.includes("unable") ||
        answer.includes("doesn't contain") ||
        answer.includes("don't have")
      ).toBe(true);
    });
  });

  describe("Direct Answers (no code execution)", () => {
    it("should answer directly when question is simple", async () => {
      // For Claude Agent Provider, the context is in the prompt
      // (not accessible via sandbox code execution)
      // So we test direct Q&A capability
      const context = "The capital of France is Paris. The Eiffel Tower is located there.";

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is the capital of France? Answer with just the city name.",
        context
      );

      const answer = result.answer.toLowerCase();
      expect(answer).toMatch(/paris/i);
    });
  });

  // NOTE: Full context exploration via code execution requires AnthropicProvider
  // ClaudeAgentProvider is suitable for simple Q&A without sandbox
});
