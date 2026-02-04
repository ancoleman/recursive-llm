/**
 * End-to-End Tests for RLM with Claude Code Provider (Subscription-based)
 *
 * These tests use the Claude Agent SDK to run completions against your
 * Claude Pro/Max subscription. They validate real-world behavior without
 * requiring separate API credits.
 *
 * Prerequisites:
 * - Claude Code CLI installed
 * - Logged in via `claude login` with Pro/Max subscription
 * - ANTHROPIC_API_KEY should NOT be set (to use subscription)
 *
 * Run these tests with:
 *   bun test tests/e2e/claude-code.test.ts
 *
 * Note: These tests make real API calls and will consume subscription usage.
 */

import { describe, expect, it, beforeAll } from "bun:test";
import { RLM } from "../../src/rlm";
import { ClaudeCodeProvider } from "../../src/providers/claude-code";
import { loadFinancialReport } from "../utils/fixtures";

// Skip if CI environment (these tests require real subscription)
const isCI = process.env.CI === "true";
const describeReal = isCI ? describe.skip : describe;

/**
 * Check if Claude Code is available and logged in
 */
async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["claude", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

describeReal("E2E: Claude Code Provider", () => {
  let provider: ClaudeCodeProvider;
  let available = false;

  beforeAll(async () => {
    available = await isClaudeCodeAvailable();
    if (!available) {
      console.log(
        "Skipping Claude Code E2E tests - Claude Code not available"
      );
      console.log("Install with: npm install -g @anthropic-ai/claude-code");
      console.log("Login with: claude login");
    }
    provider = new ClaudeCodeProvider({
      debug: true, // Enable debug logging for E2E tests
    });
  });

  describe("Basic Completion", () => {
    it("should complete simple query with Claude", async () => {
      if (!available) return;

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
      // Should contain "4" somewhere in the response
      expect(result.answer).toMatch(/4/);
    });

    it("should track token usage", async () => {
      if (!available) return;

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

  describe("Context Processing", () => {
    it("should extract information from context", async () => {
      if (!available) return;

      const context = `
# Company Report

## Financial Summary
- Revenue: $10 million
- Profit: $2 million
- Employees: 50

## Key Metrics
- Growth rate: 25%
- Customer satisfaction: 4.5/5
      `;

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 5,
      });

      const result = await rlm.complete(
        "What is the company's revenue?",
        context
      );

      expect(result.answer.toLowerCase()).toMatch(/\$?10|ten/i);
      expect(result.answer.toLowerCase()).toMatch(/million/i);
    });

    it("should process medium-sized context", async () => {
      if (!available) return;

      // Generate a ~5000 character context
      const context = `
# Technical Documentation

## Introduction
This document describes the architecture of our system. The system is designed
to handle large-scale data processing with high availability and fault tolerance.

## Components

### Data Ingestion Layer
The data ingestion layer handles incoming data from multiple sources including
REST APIs, message queues, and batch file uploads. It performs validation,
transformation, and routing of data to appropriate processing pipelines.

### Processing Engine
The processing engine uses a distributed computing framework to parallelize
data processing across multiple nodes. It supports both batch and stream
processing modes.

### Storage Layer
Data is stored in a combination of relational databases for structured data
and object storage for unstructured content. We use PostgreSQL for operational
data and S3-compatible storage for large files.

### API Gateway
The API gateway provides a unified interface for external clients to interact
with the system. It handles authentication, rate limiting, and request routing.

## Performance Metrics
- Throughput: 10,000 requests/second
- Latency: p99 < 100ms
- Uptime: 99.99%

## Conclusion
The system has been designed with scalability and reliability as core principles.
      `.repeat(3); // ~15,000 characters

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 5,
      });

      const result = await rlm.complete(
        "What is the system's p99 latency?",
        context
      );

      expect(result.answer).toMatch(/100|100ms|p99/i);
    });
  });

  describe("Model Selection", () => {
    it("should use haiku for faster responses", async () => {
      if (!available) return;

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 3,
      });

      const start = Date.now();
      const result = await rlm.complete("Say 'test'", "Test context");
      const duration = Date.now() - start;

      expect(result.answer).toBeDefined();
      // Haiku should be fast (usually < 5 seconds)
      expect(duration).toBeLessThan(30000);
    });

    it("should use sonnet for complex queries", async () => {
      if (!available) return;

      const rlm = new RLM({
        model: "sonnet",
        provider,
        maxIterations: 5,
      });

      const result = await rlm.complete(
        "What is the time complexity of quicksort? Be brief.",
        "Algorithms context"
      );

      expect(result.answer).toBeDefined();
      // Should mention O(n log n) or similar
      expect(result.answer.toLowerCase()).toMatch(
        /o\(n\s*log\s*n\)|nlogn|n log n/i
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle empty context gracefully", async () => {
      if (!available) return;

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 3,
      });

      const result = await rlm.complete(
        "What is 1 + 1?",
        "" // Empty context
      );

      expect(result.answer).toBeDefined();
      // Should still be able to answer basic math
      expect(result.answer).toMatch(/2/);
    });

    it("should respect maxIterations limit", async () => {
      if (!available) return;

      const rlm = new RLM({
        model: "haiku",
        provider,
        maxIterations: 2,
      });

      // This query might need exploration
      const result = await rlm.complete(
        "Analyze this document",
        "Short document for testing."
      );

      expect(result.stats.llmCalls).toBeLessThanOrEqual(2);
    });
  });
});

describeReal("E2E: Financial Report Analysis", () => {
  let provider: ClaudeCodeProvider;
  let financialReport: string;
  let available = false;

  beforeAll(async () => {
    available = await isClaudeCodeAvailable();
    if (!available) return;

    provider = new ClaudeCodeProvider({ debug: true });

    // Load the financial report fixture
    try {
      financialReport = loadFinancialReport();
    } catch {
      console.log("Financial report fixture not found");
      financialReport = "";
    }
  });

  it("should extract Q3 revenue from financial report", async () => {
    if (!available || !financialReport) return;

    const rlm = new RLM({
      model: "haiku",
      provider,
      maxIterations: 5,
    });

    const result = await rlm.complete(
      "What was the Q3 revenue? Give me just the number.",
      financialReport
    );

    expect(result.answer).toBeDefined();
    // Expected: $14.1 million (from fixture)
    expect(result.answer).toMatch(/\$?14|14\.1/);
  });

  it("should extract year-over-year growth rate", async () => {
    if (!available || !financialReport) return;

    const rlm = new RLM({
      model: "haiku",
      provider,
      maxIterations: 5,
    });

    const result = await rlm.complete(
      "What was the year-over-year growth rate?",
      financialReport
    );

    expect(result.answer).toBeDefined();
    // Expected: 45% (from fixture)
    expect(result.answer).toMatch(/45|forty.?five/i);
  });

  it("should count employees at year end", async () => {
    if (!available || !financialReport) return;

    const rlm = new RLM({
      model: "haiku",
      provider,
      maxIterations: 5,
    });

    const result = await rlm.complete(
      "How many employees were there at year end?",
      financialReport
    );

    expect(result.answer).toBeDefined();
    // Expected: 450 (from fixture)
    expect(result.answer).toMatch(/450|four hundred fifty/i);
  });
});

describeReal("E2E: Recursive Processing", () => {
  let provider: ClaudeCodeProvider;
  let available = false;

  beforeAll(async () => {
    available = await isClaudeCodeAvailable();
    if (!available) return;
    provider = new ClaudeCodeProvider({ debug: true });
  });

  it("should use recursive model for sub-queries", async () => {
    if (!available) return;

    const recursionEvents: { depth: number; subQuery: string }[] = [];

    const rlm = new RLM({
      model: "sonnet",
      recursiveModel: "haiku", // Use cheaper model for recursion
      maxDepth: 2,
      provider,
      maxIterations: 10,
    });

    rlm.on("recursion", (event) => {
      recursionEvents.push({ depth: event.depth, subQuery: event.subQuery });
    });

    // This context is designed to potentially trigger recursive exploration
    const context = `
# Multi-Part Document

## Part A: Technical Specifications
- Memory: 16GB RAM
- Storage: 512GB SSD
- Processor: Intel Core i7

## Part B: Pricing Information
- Base price: $999
- With upgrades: $1,299
- Enterprise: $1,999

## Part C: Support Information
- Standard support: 1 year warranty
- Extended support: 3 year option
- Premium support: 24/7 availability
    `;

    const result = await rlm.complete(
      "What is the enterprise price and what support options are available?",
      context
    );

    expect(result.answer).toBeDefined();
    // Should mention enterprise price
    expect(result.answer).toMatch(/1,?999|\$1999/);
    // Should mention support info
    expect(result.answer.toLowerCase()).toMatch(/support|warranty/i);
  });
});

describeReal("E2E: Cost Tracking", () => {
  let provider: ClaudeCodeProvider;
  let available = false;

  beforeAll(async () => {
    available = await isClaudeCodeAvailable();
    if (!available) return;
    provider = new ClaudeCodeProvider({ debug: true });
  });

  it("should track estimated cost", async () => {
    if (!available) return;

    const rlm = new RLM({
      model: "haiku",
      provider,
      maxIterations: 3,
    });

    const result = await rlm.complete(
      "What is the capital of France?",
      "Geography context: European countries"
    );

    expect(result.stats.estimatedCost).toBeGreaterThan(0);
    // Haiku should be cheap (< $0.01 for simple query)
    expect(result.stats.estimatedCost).toBeLessThan(0.01);
  });

  it("should respect cost budget", async () => {
    if (!available) return;

    const rlm = new RLM({
      model: "haiku",
      provider,
      costBudget: 0.10, // $0.10 budget
      maxIterations: 10,
    });

    const result = await rlm.complete(
      "Summarize this document.",
      "A short document to summarize."
    );

    expect(result.stats.estimatedCost).toBeLessThan(0.10);
  });
});
