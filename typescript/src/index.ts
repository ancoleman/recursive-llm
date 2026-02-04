/**
 * @rlm/core - Recursive Language Model for TypeScript/Bun
 *
 * A framework for processing extremely long contexts (100k+ tokens)
 * without "context rot". Instead of putting entire context in the prompt,
 * RLM stores context as a variable and lets the LLM explore it through
 * safe code execution.
 *
 * @example
 * ```typescript
 * import { RLM, AnthropicProvider } from "@rlm/core";
 * import Anthropic from "@anthropic-ai/sdk";
 *
 * const anthropic = new Anthropic();
 * const provider = new AnthropicProvider(anthropic);
 *
 * const rlm = new RLM({
 *   model: "claude-sonnet-4",
 *   recursiveModel: "claude-haiku",
 *   provider,
 * });
 *
 * const result = await rlm.complete(
 *   "What are the key findings?",
 *   veryLongDocument
 * );
 *
 * console.log(result.answer);
 * console.log(`Tokens used: ${result.stats.totalTokens}`);
 * ```
 *
 * @packageDocumentation
 */

// Main RLM class
export { RLM, createRLM } from "./rlm";
export type { LLMProvider } from "./rlm";

// Types
export type {
  RLMConfig,
  CompletionResult,
  ExecutionStats,
  Message,
  SandboxEnvironment,
  SandboxResult,
  ContextProvider,
  RLMEvents,
  ModelPricing,
} from "./types";

// Errors
export {
  RLMError,
  MaxIterationsError,
  MaxDepthError,
  REPLError,
  CostBudgetExceededError,
  LLMError,
} from "./types";

// Utilities
export {
  calculateCost,
  isContextProvider,
  MODEL_PRICING,
  DEFAULT_CONFIG,
  RLMConfigSchema,
} from "./types";

// Providers
export {
  OpenAIProvider,
  AnthropicProvider,
  VercelAIProvider,
  FetchProvider,
  ClaudeAgentProvider,
  ClaudeCodeProvider, // Legacy alias for ClaudeAgentProvider
} from "./providers";
export type { ProviderConfig, LLMResponse, ClaudeAgentProviderConfig, ClaudeCodeProviderConfig } from "./providers";

// Parser utilities (for advanced usage)
export {
  extractFinal,
  extractFinalVar,
  extractFinalWithConfidence,
  isFinal,
  parseResponse,
  extractCodeBlocks,
  extractFirstCodeBlock,
} from "./parser";

// Prompt utilities (for customization)
export {
  buildSystemPrompt,
  buildMinimalSystemPrompt,
  buildUserPrompt,
  buildErrorPrompt,
} from "./prompts";

// Sandbox (for advanced usage)
export { SandboxExecutor, createSandboxExecutor } from "./sandbox";
export type { SandboxConfig } from "./sandbox";
