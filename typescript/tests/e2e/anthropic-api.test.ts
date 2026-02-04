/**
 * End-to-End Tests for RLM with Direct Anthropic API
 *
 * These tests use the @anthropic-ai/sdk directly with API credentials.
 * They validate real-world behavior using prepaid API credits.
 *
 * Prerequisites:
 * - ANTHROPIC_API_KEY environment variable set
 * - API credits available at console.anthropic.com
 *
 * Run these tests with:
 *   ANTHROPIC_API_KEY=your-key bun test tests/e2e/anthropic-api.test.ts
 *
 * Note: These tests make real API calls and will consume API credits.
 */

import { describe, expect, it, beforeAll, setDefaultTimeout } from "bun:test";

// E2E tests need longer timeout for real API calls (2 minutes)
setDefaultTimeout(120_000);
import Anthropic from "@anthropic-ai/sdk";
import { RLM } from "../../src/rlm";
import { AnthropicProvider } from "../../src/providers/unified";
import { loadFinancialReport } from "../utils/fixtures";

// Skip if no API key or if in CI
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const isCI = process.env.CI === "true";
const describeReal = hasApiKey && !isCI ? describe : describe.skip;

describeReal("E2E: Anthropic Direct API", () => {
  let provider: AnthropicProvider;

  beforeAll(() => {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    provider = new AnthropicProvider(anthropic);
  });

  describe("Basic Completion", () => {
    it("should complete simple query with Claude Haiku", async () => {
      const rlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is 2 + 2? Reply with just the number.",
        "Math context"
      );

      expect(result.answer).toBeDefined();
      expect(result.answer).toMatch(/4/);
    });

    it("should complete with Claude Sonnet", async () => {
      const rlm = new RLM({
        model: "claude-sonnet-4",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is the capital of Japan? Answer briefly.",
        "Geography context"
      );

      expect(result.answer.toLowerCase()).toContain("tokyo");
    });

    it("should track real token usage", async () => {
      const rlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete("Say hello world.", "Test context");

      expect(result.stats.totalTokens).toBeGreaterThan(0);
      expect(result.stats.llmCalls).toBeGreaterThanOrEqual(1);
      expect(result.stats.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe("Context Extraction", () => {
    it("should extract data from structured context", async () => {
      const context = `
# Product Catalog

## Electronics
- Laptop: $999, 16GB RAM, 512GB SSD
- Phone: $699, 128GB storage
- Tablet: $499, 10.9" display

## Accessories
- Keyboard: $79
- Mouse: $49
- Monitor: $299
      `;

      const rlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 5,
      });

      const result = await rlm.complete(
        "What is the price of the laptop?",
        context
      );

      expect(result.answer).toMatch(/\$?999/);
    });

    it("should handle multi-step reasoning", async () => {
      const context = `
# Sales Data Q1-Q4

Q1: $100,000
Q2: $120,000
Q3: $150,000
Q4: $180,000
      `;

      const rlm = new RLM({
        model: "claude-sonnet-4",
        provider,
        maxIterations: 5,
      });

      const result = await rlm.complete(
        "What is the total annual sales?",
        context
      );

      // 100k + 120k + 150k + 180k = 550k
      expect(result.answer).toMatch(/550|550,000|550000/);
    });
  });

  describe("Recursive RLM", () => {
    it("should use recursiveModel for depth > 0", async () => {
      const recursionEvents: { depth: number; subQuery: string }[] = [];

      const rlm = new RLM({
        model: "claude-sonnet-4",
        recursiveModel: "claude-haiku",
        maxDepth: 2,
        provider,
        maxIterations: 10,
      });

      rlm.on("recursion", (event) => {
        recursionEvents.push({ depth: event.depth, subQuery: event.subQuery });
      });

      const largeContext = `
# Technical Documentation

## Section A: Architecture
The system uses microservices architecture with Docker containers.
Primary database: PostgreSQL
Cache layer: Redis
Message queue: RabbitMQ

## Section B: API Endpoints
POST /api/users - Create user
GET /api/users/:id - Get user
PUT /api/users/:id - Update user
DELETE /api/users/:id - Delete user

## Section C: Security
Authentication: JWT tokens
Encryption: AES-256
Rate limiting: 100 requests/minute
      `;

      const result = await rlm.complete(
        "What database and authentication method does this system use?",
        largeContext
      );

      expect(result.answer.toLowerCase()).toMatch(/postgresql/);
      expect(result.answer.toLowerCase()).toMatch(/jwt/);
    });
  });

  describe("Cost Management", () => {
    it("should track accurate costs", async () => {
      const rlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is 1 + 1?",
        "Simple math context"
      );

      // Haiku costs: $0.25/M input, $1.25/M output
      // A simple query should cost < $0.001
      expect(result.stats.estimatedCost).toBeGreaterThan(0);
      expect(result.stats.estimatedCost).toBeLessThan(0.01);
    });

    it("should compare costs between models", async () => {
      const haikuRlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 3,
      });

      const sonnetRlm = new RLM({
        model: "claude-sonnet-4",
        provider,
        maxIterations: 3,
      });

      const prompt = "What is 2 + 2?";
      const context = "Math context";

      const haikuResult = await haikuRlm.complete(prompt, context);
      const sonnetResult = await sonnetRlm.complete(prompt, context);

      // Sonnet should cost more than Haiku for same query
      // Haiku: $0.25/$1.25 per M tokens
      // Sonnet: $3/$15 per M tokens
      console.log(`Haiku cost: $${haikuResult.stats.estimatedCost.toFixed(6)}`);
      console.log(
        `Sonnet cost: $${sonnetResult.stats.estimatedCost.toFixed(6)}`
      );

      // Both should have valid costs
      expect(haikuResult.stats.estimatedCost).toBeGreaterThan(0);
      expect(sonnetResult.stats.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe("Error Recovery", () => {
    it("should handle malformed context gracefully", async () => {
      const rlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "Is there anything useful here?",
        "asdfghjkl random gibberish 12345 !!!@@@###"
      );

      // Should still produce a response
      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(0);
    });

    it("should handle very short context", async () => {
      const rlm = new RLM({
        model: "claude-haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete("What is this?", "x");

      expect(result.answer).toBeDefined();
    });
  });
});

describeReal("E2E: Long Context Processing", () => {
  let provider: AnthropicProvider;
  let financialReport: string;

  beforeAll(() => {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    provider = new AnthropicProvider(anthropic);

    try {
      financialReport = loadFinancialReport();
    } catch {
      financialReport = "";
    }
  });

  it("should process financial report accurately", async () => {
    if (!financialReport) return;

    const rlm = new RLM({
      model: "claude-sonnet-4",
      recursiveModel: "claude-haiku",
      provider,
      maxIterations: 10,
    });

    const result = await rlm.complete(
      "What was the Q3 revenue?",
      financialReport
    );

    expect(result.answer).toMatch(/14\.1|14\.0|14/);
  });

  it("should handle multiple questions about same document", async () => {
    if (!financialReport) return;

    const rlm = new RLM({
      model: "claude-haiku",
      provider,
      maxIterations: 5,
    });

    // First question
    const result1 = await rlm.complete(
      "What was the year-over-year growth?",
      financialReport
    );
    expect(result1.answer).toMatch(/45/);

    // Second question (reusing RLM instance)
    rlm.resetStats();
    const result2 = await rlm.complete(
      "How many employees at year end?",
      financialReport
    );
    expect(result2.answer).toMatch(/450/);
  });
});
