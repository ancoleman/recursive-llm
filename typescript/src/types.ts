import { z } from "zod";

// =============================================================================
// Core Configuration Types
// =============================================================================

/**
 * Configuration for the RLM instance
 */
export interface RLMConfig {
  /** Primary model for root-level completions (e.g., "claude-sonnet-4", "gpt-4o") */
  model: string;

  /** Model for recursive calls at depth > 0 (defaults to model if not specified) */
  recursiveModel?: string;

  /** Maximum recursion depth (default: 5) */
  maxDepth?: number;

  /** Maximum iterations per completion call (default: 30) */
  maxIterations?: number;

  /** Maximum characters for REPL output before truncation (default: 2000) */
  maxOutputChars?: number;

  /** LLM temperature (default: 0 for deterministic) */
  temperature?: number;

  /** Optional cost budget in USD - stops execution if exceeded */
  costBudget?: number;

  /** Timeout per LLM call in milliseconds (default: 60000) */
  timeout?: number;

  /** Fallback models to try if primary fails */
  fallbackModels?: string[];

  /** API key override (uses env vars by default) */
  apiKey?: string;

  /** API base URL override */
  apiBase?: string;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Zod schema for runtime config validation
 */
export const RLMConfigSchema = z.object({
  model: z.string().min(1),
  recursiveModel: z.string().optional(),
  maxDepth: z.number().int().positive().default(5),
  maxIterations: z.number().int().positive().default(30),
  maxOutputChars: z.number().int().positive().default(2000),
  temperature: z.number().min(0).max(2).default(0),
  costBudget: z.number().positive().optional(),
  timeout: z.number().int().positive().default(60000),
  fallbackModels: z.array(z.string()).optional(),
  apiKey: z.string().optional(),
  apiBase: z.string().url().optional(),
  debug: z.boolean().default(false),
});

// =============================================================================
// Execution Types
// =============================================================================

/**
 * Statistics from a completion execution
 */
export interface ExecutionStats {
  /** Total LLM API calls made */
  llmCalls: number;

  /** Number of iterations in the completion loop */
  iterations: number;

  /** Maximum recursion depth reached */
  maxDepthReached: number;

  /** Total tokens used (input + output) */
  totalTokens: number;

  /** Estimated cost in USD */
  estimatedCost: number;

  /** Total execution time in milliseconds */
  executionTimeMs: number;

  /** Number of REPL execution errors recovered from */
  replErrors: number;
}

/**
 * Result from a completion call
 */
export interface CompletionResult {
  /** The final answer extracted from FINAL() or FINAL_VAR() */
  answer: string;

  /** Optional confidence score (0-1) if LLM provided one */
  confidence?: number;

  /** Optional reasoning provided by LLM */
  reasoning?: string;

  /** Execution statistics */
  stats: ExecutionStats;
}

/**
 * Message in the conversation history
 */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// =============================================================================
// Sandbox Types
// =============================================================================

/**
 * Environment provided to the sandbox for code execution
 */
export interface SandboxEnvironment {
  /** The context string to explore */
  context: string;

  /** The user's query */
  query: string;

  /** Function to make recursive RLM calls */
  recursiveLlm: (subQuery: string, subContext: string) => Promise<string>;

  /** Captured console output */
  __output__: string[];

  /** Any variables defined during execution */
  [key: string]: unknown;
}

/**
 * Result from sandbox code execution
 */
export interface SandboxResult {
  /** Captured output from console.log and expression evaluations */
  output: string;

  /** Whether execution succeeded */
  success: boolean;

  /** Error message if execution failed */
  error?: string;

  /** Updated environment with any new variables */
  environment: SandboxEnvironment;
}

/**
 * Provider for lazy-loaded context (for large files)
 */
export interface ContextProvider {
  /** Total size of the context in characters */
  size: number;

  /** Get a slice of the context */
  slice: (start: number, end: number) => Promise<string>;

  /** Optional: search for a pattern in the context */
  search?: (pattern: RegExp) => Promise<string[]>;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Events emitted during RLM execution
 */
export interface RLMEvents {
  /** Emitted at the start of each iteration */
  iteration: {
    iteration: number;
    depth: number;
    messageCount: number;
  };

  /** Emitted when LLM generates code */
  code: {
    iteration: number;
    code: string;
  };

  /** Emitted after REPL execution */
  output: {
    iteration: number;
    output: string;
    truncated: boolean;
  };

  /** Emitted when making a recursive call */
  recursion: {
    depth: number;
    subQuery: string;
    subContextSize: number;
  };

  /** Emitted on recoverable error */
  error: {
    iteration: number;
    error: string;
    recovered: boolean;
  };

  /** Emitted when cost budget warning threshold hit (80%) */
  costWarning: {
    spent: number;
    budget: number;
    remaining: number;
  };

  /** Emitted when completion finishes */
  complete: {
    answer: string;
    stats: ExecutionStats;
  };
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error class for RLM errors
 */
export class RLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RLMError";
  }
}

/**
 * Thrown when max iterations exceeded without FINAL()
 */
export class MaxIterationsError extends RLMError {
  constructor(maxIterations: number, lastResponse?: string) {
    super(
      `Max iterations (${maxIterations}) exceeded without FINAL() marker`,
      "MAX_ITERATIONS_EXCEEDED",
      { maxIterations, lastResponse }
    );
    this.name = "MaxIterationsError";
  }
}

/**
 * Thrown when max recursion depth exceeded
 */
export class MaxDepthError extends RLMError {
  constructor(maxDepth: number) {
    super(
      `Max recursion depth (${maxDepth}) exceeded`,
      "MAX_DEPTH_EXCEEDED",
      { maxDepth }
    );
    this.name = "MaxDepthError";
  }
}

/**
 * Thrown on REPL execution errors
 */
export class REPLError extends RLMError {
  constructor(message: string, code?: string) {
    super(message, "REPL_ERROR", { originalError: code });
    this.name = "REPLError";
  }
}

/**
 * Thrown when cost budget exceeded
 */
export class CostBudgetExceededError extends RLMError {
  constructor(spent: number, budget: number) {
    super(
      `Cost budget exceeded: $${spent.toFixed(4)} spent of $${budget.toFixed(4)} budget`,
      "COST_BUDGET_EXCEEDED",
      { spent, budget }
    );
    this.name = "CostBudgetExceededError";
  }
}

/**
 * Thrown when LLM API call fails after retries
 */
export class LLMError extends RLMError {
  constructor(message: string, provider?: string, statusCode?: number) {
    super(message, "LLM_ERROR", { provider, statusCode });
    this.name = "LLMError";
  }
}

// =============================================================================
// Model Configuration Types
// =============================================================================

/**
 * Pricing info for a model (per 1M tokens)
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Known model configurations
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-sonnet-4": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku": { inputPer1M: 0.25, outputPer1M: 1.25 },

  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4-turbo": { inputPer1M: 10.0, outputPer1M: 30.0 },
  "o1": { inputPer1M: 15.0, outputPer1M: 60.0 },
  "o1-mini": { inputPer1M: 3.0, outputPer1M: 12.0 },

  // Google
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
};

/**
 * Calculate cost for a given model and token usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Default to moderate pricing if unknown
    return (inputTokens * 2.5 + outputTokens * 10.0) / 1_000_000;
  }
  return (
    (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) /
    1_000_000
  );
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Type guard for ContextProvider
 */
export function isContextProvider(
  context: string | ContextProvider
): context is ContextProvider {
  return (
    typeof context === "object" &&
    "size" in context &&
    "slice" in context &&
    typeof context.slice === "function"
  );
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<
  Omit<RLMConfig, "apiKey" | "apiBase" | "fallbackModels" | "costBudget">
> = {
  model: "claude-sonnet-4",
  recursiveModel: "claude-haiku",
  maxDepth: 5,
  maxIterations: 30,
  maxOutputChars: 2000,
  temperature: 0,
  timeout: 60000,
  debug: false,
};
