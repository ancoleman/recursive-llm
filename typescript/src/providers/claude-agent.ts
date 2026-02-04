/**
 * Claude Agent Provider - Uses the official Claude Agent SDK.
 *
 * This provider uses the @anthropic-ai/claude-agent-sdk to leverage your
 * Claude Pro/Max subscription for RLM completions. It provides proper
 * programmatic access with iteration support.
 *
 * Requirements:
 * - Claude Code CLI installed and logged in via `claude login`
 * - Pro/Max subscription
 *
 * @example
 * ```typescript
 * import { RLM, ClaudeAgentProvider } from "@rlm/core";
 *
 * const provider = new ClaudeAgentProvider();
 * const rlm = new RLM({
 *   model: "claude-sonnet-4",
 *   provider,
 * });
 *
 * const result = await rlm.complete("What is the summary?", longDocument);
 * ```
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Message } from "../types";
import type { LLMProvider } from "../rlm";
import type { LLMResponse } from "./unified";

/**
 * Configuration options for the Claude Agent Provider.
 */
export interface ClaudeAgentProviderConfig {
  /**
   * Default model to use if not specified in the request.
   * Common options: "sonnet", "opus", "haiku"
   */
  defaultModel?: string;

  /**
   * Working directory for operations.
   * Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Maximum number of turns (API round-trips) for a single query.
   * Defaults to 1 for simple completions.
   */
  maxTurns?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Claude Agent Provider - Uses the official Claude Agent SDK.
 *
 * This provider uses your Claude Pro/Max subscription programmatically
 * for RLM completions, avoiding separate API billing.
 */
export class ClaudeAgentProvider implements LLMProvider {
  private config: Required<ClaudeAgentProviderConfig>;

  constructor(config: ClaudeAgentProviderConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel || "sonnet",
      cwd: config.cwd || process.cwd(),
      maxTurns: config.maxTurns || 1,
      debug: config.debug || false,
    };
  }

  /**
   * Convert standard model names to Claude Agent SDK format.
   */
  private normalizeModelName(model: string): "sonnet" | "opus" | "haiku" {
    const modelMap: Record<string, "sonnet" | "opus" | "haiku"> = {
      "claude-sonnet-4": "sonnet",
      "claude-sonnet-4-5": "sonnet",
      "claude-opus-4": "opus",
      "claude-opus-4-5": "opus",
      "claude-haiku": "haiku",
      "claude-3-5-haiku": "haiku",
      "claude-3-5-sonnet": "sonnet",
      "claude-3-opus": "opus",
      sonnet: "sonnet",
      opus: "opus",
      haiku: "haiku",
    };
    return modelMap[model.toLowerCase()] || "sonnet";
  }

  /**
   * Complete a chat request using Claude Agent SDK.
   */
  async complete(
    messages: Message[],
    options: { model: string; temperature?: number; timeout?: number }
  ): Promise<LLMResponse> {
    const model = this.normalizeModelName(options.model || this.config.defaultModel);

    // Build the prompt from messages
    const prompt = this.buildPrompt(messages);

    if (this.config.debug) {
      console.log("[ClaudeAgentProvider] Model:", model);
      console.log("[ClaudeAgentProvider] Prompt length:", prompt.length);
    }

    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeout = options.timeout || 120000;
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    try {
      // Use the Agent SDK query function
      const queryResult = query({
        prompt,
        options: {
          model,
          maxTurns: this.config.maxTurns,
          tools: [], // Disable built-in tools - RLM uses its own sandbox
          cwd: this.config.cwd,
          abortController,
        },
      });

      // Iterate through messages to get the result
      let result: string = "";
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const message of queryResult) {
        if (message.type === "result") {
          result = message.result || "";
          if (message.usage) {
            inputTokens = message.usage.input_tokens || 0;
            outputTokens = message.usage.output_tokens || 0;
          }
          break;
        }
      }

      clearTimeout(timeoutId);

      if (this.config.debug) {
        console.log("[ClaudeAgentProvider] Response received");
        console.log("[ClaudeAgentProvider] Tokens:", inputTokens, "/", outputTokens);
      }

      return {
        content: result,
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build prompt from messages array.
   */
  private buildPrompt(messages: Message[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        parts.push(msg.content);
      } else if (msg.role === "user") {
        parts.push(`\n${msg.content}`);
      } else if (msg.role === "assistant") {
        parts.push(`\nAssistant: ${msg.content}`);
      }
    }

    return parts.join("\n");
  }
}
