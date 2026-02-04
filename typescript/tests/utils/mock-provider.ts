/**
 * Enhanced mock LLM provider for testing.
 *
 * Supports:
 * - Sequential responses
 * - Response callbacks based on message content
 * - Token tracking
 * - Error simulation
 * - Delay simulation
 */

import type { Message } from "../../src/types";
import type { LLMProvider } from "../../src/rlm";

export interface MockProviderOptions {
  /** Default response if no matching handler */
  defaultResponse?: string;

  /** Default input tokens per call */
  defaultInputTokens?: number;

  /** Default output tokens per call */
  defaultOutputTokens?: number;

  /** Delay in ms before responding */
  delay?: number;

  /** Whether to throw on next call */
  shouldError?: boolean;

  /** Error message to throw */
  errorMessage?: string;
}

export interface MockCall {
  messages: Message[];
  options: {
    model: string;
    temperature?: number;
    timeout?: number;
  };
  timestamp: number;
}

/**
 * Create a mock provider that returns predefined responses in sequence.
 */
export function createMockProvider(
  responses: string[],
  options: MockProviderOptions = {}
): LLMProvider & {
  calls: MockCall[];
  callCount: number;
  reset: () => void;
  getLastCall: () => MockCall | undefined;
} {
  let callIndex = 0;
  const calls: MockCall[] = [];
  const {
    defaultResponse = 'FINAL("fallback")',
    defaultInputTokens = 100,
    defaultOutputTokens = 50,
    delay = 0,
    shouldError = false,
    errorMessage = "Mock LLM error",
  } = options;

  const provider = {
    calls,
    get callCount() {
      return calls.length;
    },
    reset() {
      callIndex = 0;
      calls.length = 0;
    },
    getLastCall() {
      return calls[calls.length - 1];
    },
    async complete(
      messages: Message[],
      opts: { model: string; temperature?: number; timeout?: number }
    ) {
      // Record the call
      calls.push({
        messages: [...messages],
        options: { ...opts },
        timestamp: Date.now(),
      });

      // Simulate delay
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Simulate error
      if (shouldError) {
        throw new Error(errorMessage);
      }

      // Get response
      const response = responses[callIndex] ?? defaultResponse;
      callIndex++;

      return {
        content: response,
        inputTokens: defaultInputTokens,
        outputTokens: defaultOutputTokens,
      };
    },
  };

  return provider;
}

/**
 * Create a mock provider with callback-based responses.
 * Useful for dynamic responses based on message content.
 */
export function createCallbackMockProvider(
  callback: (
    messages: Message[],
    callIndex: number
  ) => string | Promise<string>,
  options: MockProviderOptions = {}
): LLMProvider & { calls: MockCall[]; callCount: number } {
  let callIndex = 0;
  const calls: MockCall[] = [];
  const {
    defaultInputTokens = 100,
    defaultOutputTokens = 50,
    delay = 0,
  } = options;

  return {
    calls,
    get callCount() {
      return calls.length;
    },
    async complete(
      messages: Message[],
      opts: { model: string; temperature?: number; timeout?: number }
    ) {
      calls.push({
        messages: [...messages],
        options: { ...opts },
        timestamp: Date.now(),
      });

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await callback(messages, callIndex++);

      return {
        content: response,
        inputTokens: defaultInputTokens,
        outputTokens: defaultOutputTokens,
      };
    },
  };
}

/**
 * Create a mock provider that simulates recursive chunking.
 * First call returns chunking code, subsequent calls return FINAL for each chunk.
 */
export function createChunkingMockProvider(
  chunkCount: number,
  chunkResponses: string[] = []
): LLMProvider & { calls: MockCall[]; callCount: number } {
  return createCallbackMockProvider((messages, index) => {
    if (index === 0) {
      // First call: return chunking code
      return `
const chunkSize = Math.ceil(context.length / ${chunkCount});
const results = [];
for (let i = 0; i < ${chunkCount}; i++) {
  const start = i * chunkSize;
  const end = Math.min(start + chunkSize, context.length);
  const chunk = context.slice(start, end);
  const result = await recursiveLlm(query, chunk);
  results.push(result);
}
const answer = results.join(" | ");
FINAL(answer)
      `.trim();
    }

    // Subsequent calls: return chunk responses
    const chunkIndex = index - 1;
    if (chunkResponses[chunkIndex]) {
      return chunkResponses[chunkIndex];
    }

    return `FINAL("Chunk ${chunkIndex} processed")`;
  });
}

/**
 * Create a mock provider that tracks model usage.
 */
export function createModelTrackingProvider(
  responses: string[]
): LLMProvider & {
  calls: MockCall[];
  modelUsage: Map<string, number>;
  getModelCalls: (model: string) => number;
} {
  const provider = createMockProvider(responses);
  const modelUsage = new Map<string, number>();

  const originalComplete = provider.complete.bind(provider);

  return {
    ...provider,
    modelUsage,
    getModelCalls(model: string) {
      return modelUsage.get(model) ?? 0;
    },
    async complete(
      messages: Message[],
      opts: { model: string; temperature?: number; timeout?: number }
    ) {
      modelUsage.set(opts.model, (modelUsage.get(opts.model) ?? 0) + 1);
      return originalComplete(messages, opts);
    },
  };
}

/**
 * Create a mock provider that simulates token usage based on message content.
 */
export function createRealisticTokenProvider(
  responses: string[]
): LLMProvider & { calls: MockCall[] } {
  const calls: MockCall[] = [];
  let callIndex = 0;

  return {
    calls,
    async complete(
      messages: Message[],
      opts: { model: string; temperature?: number; timeout?: number }
    ) {
      calls.push({
        messages: [...messages],
        options: { ...opts },
        timestamp: Date.now(),
      });

      const response = responses[callIndex] ?? 'FINAL("fallback")';
      callIndex++;

      // Estimate tokens (roughly 4 chars per token)
      const inputChars = messages.reduce(
        (acc, m) => acc + m.content.length,
        0
      );
      const inputTokens = Math.ceil(inputChars / 4);
      const outputTokens = Math.ceil(response.length / 4);

      return {
        content: response,
        inputTokens,
        outputTokens,
      };
    },
  };
}

/**
 * Create a mock provider that fails after N calls.
 */
export function createFailAfterNProvider(
  successResponses: string[],
  failAfter: number,
  errorMessage = "Provider error after N calls"
): LLMProvider & { calls: MockCall[]; callCount: number } {
  const calls: MockCall[] = [];
  let callIndex = 0;

  return {
    calls,
    get callCount() {
      return calls.length;
    },
    async complete(
      messages: Message[],
      opts: { model: string; temperature?: number; timeout?: number }
    ) {
      calls.push({
        messages: [...messages],
        options: { ...opts },
        timestamp: Date.now(),
      });

      if (callIndex >= failAfter) {
        throw new Error(errorMessage);
      }

      const response = successResponses[callIndex] ?? 'FINAL("fallback")';
      callIndex++;

      return {
        content: response,
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  };
}
