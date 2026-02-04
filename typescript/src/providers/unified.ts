import type { Message } from "../types";
import type { LLMProvider } from "../rlm";

/**
 * Provider configuration options.
 */
export interface ProviderConfig {
  /** API key (uses environment variable if not provided) */
  apiKey?: string;

  /** Base URL override */
  baseUrl?: string;

  /** Default model to use */
  defaultModel?: string;
}

/**
 * Response from an LLM completion call.
 */
export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
}

/**
 * OpenAI-compatible provider using the openai package.
 *
 * Supports OpenAI, Azure OpenAI, and any OpenAI-compatible API.
 *
 * @example
 * ```typescript
 * import OpenAI from "openai";
 *
 * const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * const provider = new OpenAIProvider(openai);
 *
 * const rlm = new RLM({ model: "gpt-4o", provider });
 * ```
 */
export class OpenAIProvider implements LLMProvider {
  private client: {
    chat: {
      completions: {
        create: (params: {
          model: string;
          messages: Array<{ role: string; content: string }>;
          temperature?: number;
          max_tokens?: number;
        }) => Promise<{
          choices: Array<{ message: { content: string | null } }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        }>;
      };
    };
  };

  constructor(
    client: OpenAIProvider["client"],
    private defaultModel: string = "gpt-4o"
  ) {
    this.client = client;
  }

  async complete(
    messages: Message[],
    options: { model: string; temperature?: number; timeout?: number }
  ): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model || this.defaultModel,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    return {
      content,
      inputTokens,
      outputTokens,
    };
  }
}

/**
 * Anthropic provider using the @anthropic-ai/sdk package.
 *
 * @example
 * ```typescript
 * import Anthropic from "@anthropic-ai/sdk";
 *
 * const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 * const provider = new AnthropicProvider(anthropic);
 *
 * const rlm = new RLM({ model: "claude-sonnet-4", provider });
 * ```
 */
export class AnthropicProvider implements LLMProvider {
  private client: {
    messages: {
      create: (params: {
        model: string;
        max_tokens: number;
        system?: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        temperature?: number;
      }) => Promise<{
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      }>;
    };
  };

  constructor(
    client: AnthropicProvider["client"],
    private defaultModel: string = "claude-sonnet-4-20250514"
  ) {
    this.client = client;
  }

  async complete(
    messages: Message[],
    options: { model: string; temperature?: number; timeout?: number }
  ): Promise<LLMResponse> {
    // Extract system message
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: options.model || this.defaultModel,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: options.temperature ?? 0,
    });

    const textContent = response.content.find((c) => c.type === "text");
    const content = textContent?.text ?? "";

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

/**
 * Vercel AI SDK provider adapter.
 *
 * Wraps the Vercel AI SDK's generateText function to work with RLM.
 *
 * @example
 * ```typescript
 * import { generateText } from "ai";
 * import { anthropic } from "@ai-sdk/anthropic";
 *
 * const provider = new VercelAIProvider(
 *   generateText,
 *   anthropic("claude-sonnet-4-20250514")
 * );
 *
 * const rlm = new RLM({ model: "claude-sonnet-4", provider });
 * ```
 */
export class VercelAIProvider implements LLMProvider {
  constructor(
    private generateText: (params: {
      model: unknown;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
    }) => Promise<{
      text: string;
      usage: { promptTokens: number; completionTokens: number };
    }>,
    private model: unknown
  ) {}

  async complete(
    messages: Message[],
    options: { model: string; temperature?: number; timeout?: number }
  ): Promise<LLMResponse> {
    const response = await this.generateText({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0,
    });

    return {
      content: response.text,
      inputTokens: response.usage.promptTokens,
      outputTokens: response.usage.completionTokens,
    };
  }
}

/**
 * Simple fetch-based provider for any OpenAI-compatible API.
 *
 * @example
 * ```typescript
 * const provider = new FetchProvider({
 *   baseUrl: "https://api.openai.com/v1",
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: "gpt-4o",
 * });
 *
 * const rlm = new RLM({ model: "gpt-4o", provider });
 * ```
 */
export class FetchProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    defaultModel?: string;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? "gpt-4o";
  }

  async complete(
    messages: Message[],
    options: { model: string; temperature?: number; timeout?: number }
  ): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout ?? 60000
    );

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature ?? 0,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      return {
        content: data.choices[0]?.message.content ?? "",
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
