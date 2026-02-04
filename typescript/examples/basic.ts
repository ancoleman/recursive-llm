/**
 * Basic usage example for RLM TypeScript implementation.
 *
 * Run with: bun examples/basic.ts
 *
 * Note: Requires ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { RLM, AnthropicProvider } from "../src";

async function main() {
  // Initialize the Anthropic client
  const anthropic = new Anthropic();

  // Create the provider
  const provider = new AnthropicProvider(anthropic, "claude-sonnet-4-20250514");

  // Create the RLM instance
  const rlm = new RLM({
    model: "claude-sonnet-4",
    recursiveModel: "claude-haiku",
    maxDepth: 5,
    maxIterations: 30,
    provider,
  });

  // Example context - a long document
  const context = `
    # Company Financial Report 2024

    ## Q1 Results
    Revenue: $10.5 million
    Net Income: $2.1 million
    Operating Margin: 20%

    Key highlights:
    - Launched new product line in March
    - Expanded to 3 new markets
    - Customer base grew by 15%

    ## Q2 Results
    Revenue: $12.3 million
    Net Income: $2.8 million
    Operating Margin: 22.7%

    Key highlights:
    - Partnership with TechCorp announced
    - R&D spending increased by 30%
    - Employee count: 450

    ## Q3 Results
    Revenue: $14.1 million
    Net Income: $3.2 million
    Operating Margin: 22.6%

    Key highlights:
    - Acquired StartupX for $5 million
    - International revenue now 40% of total
    - Customer satisfaction score: 4.8/5

    ## Q4 Results
    Revenue: $15.8 million
    Net Income: $3.5 million
    Operating Margin: 22.1%

    Key highlights:
    - Full year revenue: $52.7 million
    - Year-over-year growth: 45%
    - Plans for IPO in 2025
  `.repeat(100); // Repeat to make it longer

  console.log(`Context size: ${(context.length / 1000).toFixed(1)}K characters`);

  // Subscribe to events for visibility
  rlm.on("iteration", ({ iteration, depth }) => {
    console.log(`[Iteration ${iteration}] Depth: ${depth}`);
  });

  rlm.on("code", ({ iteration, code }) => {
    console.log(`[Code ${iteration}] ${code.slice(0, 100)}...`);
  });

  rlm.on("output", ({ iteration, output, truncated }) => {
    console.log(
      `[Output ${iteration}] ${output.slice(0, 100)}${truncated ? " [truncated]" : ""}`
    );
  });

  // Execute the query
  console.log("\n--- Starting RLM Completion ---\n");

  try {
    const result = await rlm.complete(
      "What was the total revenue for the year and what was the year-over-year growth?",
      context
    );

    console.log("\n--- Results ---\n");
    console.log("Answer:", result.answer);
    console.log("\nStats:");
    console.log(`  - LLM Calls: ${result.stats.llmCalls}`);
    console.log(`  - Iterations: ${result.stats.iterations}`);
    console.log(`  - Total Tokens: ${result.stats.totalTokens}`);
    console.log(`  - Estimated Cost: $${result.stats.estimatedCost.toFixed(4)}`);
    console.log(`  - Execution Time: ${result.stats.executionTimeMs}ms`);

    if (result.confidence) {
      console.log(`  - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
