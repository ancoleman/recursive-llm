import EventEmitter from "eventemitter3";
import type {
  RLMConfig,
  CompletionResult,
  ExecutionStats,
  Message,
  SandboxEnvironment,
  RLMEvents,
  ContextProvider,
} from "./types";
import {
  RLMError,
  MaxIterationsError,
  MaxDepthError,
  CostBudgetExceededError,
  REPLError,
  DEFAULT_CONFIG,
  RLMConfigSchema,
  calculateCost,
  isContextProvider,
} from "./types";
import { buildSystemPrompt, buildUserPrompt, buildErrorPrompt } from "./prompts";
import { isFinal, parseResponse } from "./parser";
import { SandboxExecutor } from "./sandbox";

/**
 * LLM provider interface for dependency injection.
 * This allows using different providers (OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
  complete(
    messages: Message[],
    options: {
      model: string;
      temperature?: number;
      timeout?: number;
    }
  ): Promise<{
    content: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}

/**
 * Simple LLM provider using the AI SDK style interface.
 * For real usage, inject a proper provider implementation.
 */
export class MockLLMProvider implements LLMProvider {
  async complete(
    messages: Message[],
    _options: { model: string; temperature?: number; timeout?: number }
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    // This is a mock - in real usage, inject a real provider
    const lastMessage = messages[messages.length - 1];
    return {
      content: `console.log("Mock response for: ${lastMessage?.content.slice(0, 50)}")\nFINAL("Mock answer")`,
      inputTokens: 100,
      outputTokens: 50,
    };
  }
}

/**
 * RLM - Recursive Language Model
 *
 * Main class for processing long contexts without context rot.
 * Stores context as a variable and lets the LLM explore it programmatically.
 *
 * @example
 * ```typescript
 * const rlm = new RLM({
 *   model: "claude-sonnet-4",
 *   recursiveModel: "claude-haiku",
 *   provider: myLLMProvider,
 * });
 *
 * const result = await rlm.complete(
 *   "What is the main topic?",
 *   longDocumentText
 * );
 * console.log(result.answer);
 * ```
 */
export class RLM extends EventEmitter<RLMEvents> {
  private config: Required<
    Pick<
      RLMConfig,
      | "model"
      | "recursiveModel"
      | "maxDepth"
      | "maxIterations"
      | "maxOutputChars"
      | "temperature"
      | "timeout"
      | "debug"
    >
  > & { costBudget?: number; fallbackModels?: string[] };

  private provider: LLMProvider;
  private sandbox: SandboxExecutor;
  private currentDepth: number;

  // Statistics
  private _llmCalls: number = 0;
  private _iterations: number = 0;
  private _totalInputTokens: number = 0;
  private _totalOutputTokens: number = 0;
  private _totalCost: number = 0;
  private _replErrors: number = 0;

  constructor(
    config: RLMConfig & { provider?: LLMProvider },
    depth: number = 0
  ) {
    super();

    // Validate and merge config
    const validated = RLMConfigSchema.parse(config);

    this.config = {
      model: validated.model,
      recursiveModel: validated.recursiveModel ?? validated.model,
      maxDepth: validated.maxDepth,
      maxIterations: validated.maxIterations,
      maxOutputChars: validated.maxOutputChars,
      temperature: validated.temperature,
      timeout: validated.timeout,
      debug: validated.debug,
      costBudget: config.costBudget,
      fallbackModels: config.fallbackModels,
    };

    this.provider = config.provider ?? new MockLLMProvider();
    this.sandbox = new SandboxExecutor({
      maxOutputChars: this.config.maxOutputChars,
      timeout: this.config.timeout,
      debug: this.config.debug,
    });
    this.currentDepth = depth;
  }

  /**
   * Execute a complete query against a context.
   *
   * @param query - The question to answer
   * @param context - The context document (string or ContextProvider)
   * @returns Completion result with answer and stats
   */
  async complete(
    query: string,
    context: string | ContextProvider
  ): Promise<CompletionResult> {
    const startTime = Date.now();

    // Check depth limit
    if (this.currentDepth >= this.config.maxDepth) {
      throw new MaxDepthError(this.config.maxDepth);
    }

    // Resolve context if it's a provider
    let contextStr: string;
    if (isContextProvider(context)) {
      // For providers, we need to make the slice function available
      // For now, load full context (optimization: lazy loading)
      contextStr = await context.slice(0, context.size);
    } else {
      contextStr = context;
    }

    // Build initial messages
    const systemPrompt = buildSystemPrompt(
      contextStr.length,
      this.currentDepth,
      this.config.maxDepth
    );

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(query) },
    ];

    // Build REPL environment
    const replEnv: SandboxEnvironment = {
      context: contextStr,
      query,
      recursiveLlm: this.makeRecursiveFn(),
      __output__: [],
    };

    // Main completion loop
    for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
      this._iterations = iteration;

      // Emit iteration event
      this.emit("iteration", {
        iteration,
        depth: this.currentDepth,
        messageCount: messages.length,
      });

      // Check cost budget
      if (this.config.costBudget && this._totalCost >= this.config.costBudget) {
        throw new CostBudgetExceededError(
          this._totalCost,
          this.config.costBudget
        );
      }

      // Warn at 80% budget
      if (
        this.config.costBudget &&
        this._totalCost >= this.config.costBudget * 0.8
      ) {
        this.emit("costWarning", {
          spent: this._totalCost,
          budget: this.config.costBudget,
          remaining: this.config.costBudget - this._totalCost,
        });
      }

      // Call LLM
      const model =
        this.currentDepth === 0
          ? this.config.model
          : this.config.recursiveModel;

      const response = await this.callLLM(messages, model);

      // Emit code event
      this.emit("code", {
        iteration,
        code: response,
      });

      // Check for FINAL marker
      if (isFinal(response)) {
        const result = parseResponse(response, replEnv);

        if (result) {
          const executionTimeMs = Date.now() - startTime;

          const stats: ExecutionStats = {
            llmCalls: this._llmCalls,
            iterations: this._iterations,
            maxDepthReached: this.currentDepth,
            totalTokens: this._totalInputTokens + this._totalOutputTokens,
            estimatedCost: this._totalCost,
            executionTimeMs,
            replErrors: this._replErrors,
          };

          const completionResult: CompletionResult = {
            answer: result.answer,
            confidence: result.confidence,
            reasoning: result.reasoning,
            stats,
          };

          // Emit complete event
          this.emit("complete", {
            answer: result.answer,
            stats,
          });

          return completionResult;
        }
      }

      // Execute code in sandbox
      let execResult: string;
      try {
        const sandboxResult = await this.sandbox.execute(response, replEnv);
        execResult = sandboxResult.output || "(no output)";

        // Emit output event
        this.emit("output", {
          iteration,
          output: execResult,
          truncated: execResult.includes("[Output truncated]"),
        });
      } catch (error) {
        this._replErrors++;

        if (error instanceof REPLError) {
          execResult = buildErrorPrompt(error.message);
        } else {
          execResult = buildErrorPrompt(
            error instanceof Error ? error.message : String(error)
          );
        }

        // Emit error event
        this.emit("error", {
          iteration,
          error: execResult,
          recovered: true,
        });
      }

      // Add to message history
      messages.push({ role: "assistant", content: response });
      messages.push({ role: "user", content: execResult });

      if (this.config.debug) {
        console.log(`[RLM] Iteration ${iteration}:`, response.slice(0, 100));
        console.log(`[RLM] Output:`, execResult.slice(0, 100));
      }
    }

    // Max iterations exceeded
    throw new MaxIterationsError(
      this.config.maxIterations,
      messages[messages.length - 1]?.content
    );
  }

  /**
   * Call the LLM with the given messages.
   */
  private async callLLM(messages: Message[], model: string): Promise<string> {
    this._llmCalls++;

    const response = await this.provider.complete(messages, {
      model,
      temperature: this.config.temperature,
      timeout: this.config.timeout,
    });

    // Track tokens and cost
    this._totalInputTokens += response.inputTokens;
    this._totalOutputTokens += response.outputTokens;
    this._totalCost += calculateCost(
      model,
      response.inputTokens,
      response.outputTokens
    );

    return response.content;
  }

  /**
   * Create the recursive LLM function for the sandbox environment.
   */
  private makeRecursiveFn(): (
    subQuery: string,
    subContext: string
  ) => Promise<string> {
    return async (subQuery: string, subContext: string): Promise<string> => {
      // Check if we can recurse
      if (this.currentDepth + 1 >= this.config.maxDepth) {
        return `Max recursion depth (${this.config.maxDepth}) reached. Cannot process sub-query.`;
      }

      // Emit recursion event
      this.emit("recursion", {
        depth: this.currentDepth + 1,
        subQuery,
        subContextSize: subContext.length,
      });

      // Create sub-RLM with incremented depth
      const subRLM = new RLM(
        {
          model: this.config.recursiveModel,
          recursiveModel: this.config.recursiveModel,
          maxDepth: this.config.maxDepth,
          maxIterations: this.config.maxIterations,
          maxOutputChars: this.config.maxOutputChars,
          temperature: this.config.temperature,
          timeout: this.config.timeout,
          debug: this.config.debug,
          costBudget: this.config.costBudget
            ? this.config.costBudget - this._totalCost
            : undefined,
          provider: this.provider,
        },
        this.currentDepth + 1
      );

      try {
        const result = await subRLM.complete(subQuery, subContext);

        // Accumulate stats from sub-RLM
        this._llmCalls += subRLM.stats.llmCalls;
        this._totalInputTokens +=
          subRLM.stats.totalTokens -
          subRLM._totalOutputTokens; // Approximate
        this._totalOutputTokens += subRLM._totalOutputTokens;
        this._totalCost += subRLM.stats.estimatedCost;
        this._replErrors += subRLM.stats.replErrors;

        return result.answer;
      } catch (error) {
        if (error instanceof RLMError) {
          return `Error in recursive call: ${error.message}`;
        }
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
  }

  /**
   * Get current execution statistics.
   */
  get stats(): ExecutionStats {
    return {
      llmCalls: this._llmCalls,
      iterations: this._iterations,
      maxDepthReached: this.currentDepth,
      totalTokens: this._totalInputTokens + this._totalOutputTokens,
      estimatedCost: this._totalCost,
      executionTimeMs: 0, // Only accurate after completion
      replErrors: this._replErrors,
    };
  }

  /**
   * Reset statistics (for reuse).
   */
  resetStats(): void {
    this._llmCalls = 0;
    this._iterations = 0;
    this._totalInputTokens = 0;
    this._totalOutputTokens = 0;
    this._totalCost = 0;
    this._replErrors = 0;
  }
}

/**
 * Create a new RLM instance with the given configuration.
 */
export function createRLM(
  config: RLMConfig & { provider?: LLMProvider }
): RLM {
  return new RLM(config);
}
