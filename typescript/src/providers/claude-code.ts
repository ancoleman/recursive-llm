/**
 * Claude Code Provider - Uses Claude CLI with subscription authentication.
 *
 * This provider uses the Claude Code CLI's `-p` (print) mode to leverage your
 * Claude Pro/Max subscription for RLM completions. It spawns the CLI as a
 * subprocess, using your logged-in subscription credentials.
 *
 * Requirements:
 * - Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
 * - Logged in via `claude login` with Pro/Max subscription
 * - ANTHROPIC_API_KEY should NOT be set (to use subscription instead of API credits)
 *
 * @example
 * ```typescript
 * import { RLM, ClaudeCodeProvider } from "@rlm/core";
 *
 * const provider = new ClaudeCodeProvider();
 * const rlm = new RLM({
 *   model: "claude-sonnet-4",
 *   recursiveModel: "claude-haiku",
 *   provider,
 * });
 *
 * const result = await rlm.complete("What is the summary?", longDocument);
 * ```
 */

import { spawn } from "child_process";
import type { Message } from "../types";
import type { LLMProvider } from "../rlm";
import type { LLMResponse } from "./unified";

/**
 * Configuration options for the Claude Code Provider.
 */
export interface ClaudeCodeProviderConfig {
  /**
   * Default model to use if not specified in the request.
   * Common options: "claude-sonnet-4", "claude-opus-4", "claude-haiku"
   */
  defaultModel?: string;

  /**
   * Working directory for Claude Code operations.
   * Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Maximum budget in USD for a single query.
   * Claude Code will stop if this budget is exceeded.
   */
  maxBudgetUsd?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Path to Claude Code executable
   * Defaults to "claude" (using PATH)
   */
  claudePath?: string;

  /**
   * Timeout in milliseconds for each query
   * Defaults to 120000 (2 minutes)
   */
  timeout?: number;
}

/**
 * JSON response structure from Claude Code CLI with --output-format json
 */
interface ClaudeCodeResponse {
  result: string;
  session_id: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  cost_usd?: number;
  is_error?: boolean;
  error?: string;
}

/**
 * Claude Code Provider - Uses Claude subscription via CLI subprocess.
 *
 * This provider allows you to use your Claude Pro/Max subscription
 * programmatically for RLM completions, avoiding separate API billing.
 */
export class ClaudeCodeProvider implements LLMProvider {
  private config: Required<ClaudeCodeProviderConfig>;

  constructor(config: ClaudeCodeProviderConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel || "sonnet", // Claude Code uses short names: sonnet, opus, haiku
      cwd: config.cwd || process.cwd(),
      maxBudgetUsd: config.maxBudgetUsd || 1.0,
      debug: config.debug || false,
      claudePath: config.claudePath || "claude",
      timeout: config.timeout || 120000,
    };
  }

  /**
   * Convert standard model names to Claude Code format.
   * Claude Code uses short aliases: sonnet, opus, haiku
   * Also accepts full names like claude-sonnet-4-5-20250929
   */
  private normalizeModelName(model: string): string {
    // Map common full names to aliases
    const modelMap: Record<string, string> = {
      "claude-sonnet-4": "sonnet",
      "claude-sonnet-4-5": "sonnet",
      "claude-opus-4": "opus",
      "claude-opus-4-5": "opus",
      "claude-haiku": "haiku",
      "claude-3-5-haiku": "haiku",
      "claude-3-5-sonnet": "sonnet",
      "claude-3-opus": "opus",
    };
    return modelMap[model.toLowerCase()] || model;
  }

  /**
   * Complete a chat request using Claude Code subscription.
   */
  async complete(
    messages: Message[],
    options: { model: string; temperature?: number; timeout?: number }
  ): Promise<LLMResponse> {
    const rawModel = options.model || this.config.defaultModel;
    const model = this.normalizeModelName(rawModel);
    const timeout = options.timeout || this.config.timeout;

    // Build the prompt from messages
    const prompt = this.buildPrompt(messages);

    if (this.config.debug) {
      console.log("[ClaudeCodeProvider] Model:", model);
      console.log("[ClaudeCodeProvider] Prompt length:", prompt.length);
    }

    // Build CLI arguments (prompt via stdin to avoid arg length limits)
    const args = [
      "-p", // Print mode (non-interactive)
      "--model",
      model,
      "--output-format",
      "json",
      "--tools", "", // Disable built-in tools - RLM uses its own sandbox
      "--setting-sources", "", // Don't load project settings (CLAUDE.md)
    ];

    if (this.config.maxBudgetUsd) {
      args.push("--max-budget-usd", this.config.maxBudgetUsd.toString());
    }

    // Execute Claude Code CLI with prompt via stdin
    const result = await this.executeClaudeCLI(args, prompt, timeout);

    if (this.config.debug) {
      console.log("[ClaudeCodeProvider] Response received");
      console.log("[ClaudeCodeProvider] Tokens:", result.inputTokens, "/", result.outputTokens);
    }

    return result;
  }

  /**
   * Execute Claude Code CLI and parse the response.
   */
  private executeClaudeCLI(args: string[], prompt: string, timeout: number): Promise<LLMResponse> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.claudePath, args, {
        cwd: this.config.cwd,
        env: {
          ...process.env,
          // Unset API key to use subscription auth
          ANTHROPIC_API_KEY: undefined,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      // Set timeout
      const timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Claude Code timed out after ${timeout}ms`));
      }, timeout);

      // Write prompt to stdin and close
      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (this.config.debug) {
          console.log("[ClaudeCodeProvider] stderr:", data.toString());
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timeoutId);

        if (code !== 0) {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const response = this.parseResponse(stdout);
          resolve(response);
        } catch (error) {
          // If JSON parsing fails, try to extract text result
          if (stdout.trim()) {
            resolve({
              content: stdout.trim(),
              inputTokens: 0,
              outputTokens: 0,
            });
          } else {
            reject(new Error(`Failed to parse Claude Code response: ${error}`));
          }
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn Claude Code: ${error.message}`));
      });
    });
  }

  /**
   * Parse JSON response from Claude Code CLI.
   */
  private parseResponse(stdout: string): LLMResponse {
    // Try to parse as JSON
    const response: ClaudeCodeResponse = JSON.parse(stdout);

    if (response.is_error || response.error) {
      throw new Error(response.error || "Claude Code returned an error");
    }

    return {
      content: response.result || "",
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };
  }

  /**
   * Build the prompt string from message history.
   *
   * For RLM, we need to preserve the full conversation history
   * so the LLM can continue from where it left off.
   */
  private buildPrompt(messages: Message[]): string {
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const parts: string[] = [];

    // Add system prompt if present
    if (systemMessage?.content) {
      parts.push(`<system>\n${systemMessage.content}\n</system>\n`);
    }

    // Add conversation history
    for (const msg of conversationMessages) {
      if (msg.role === "user") {
        parts.push(`<user>\n${msg.content}\n</user>`);
      } else if (msg.role === "assistant") {
        parts.push(`<assistant>\n${msg.content}\n</assistant>`);
      }
    }

    return parts.join("\n\n");
  }
}
