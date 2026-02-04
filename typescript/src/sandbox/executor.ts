import type { SandboxEnvironment, SandboxResult } from "../types";
import { REPLError } from "../types";
import { extractFirstCodeBlock } from "../parser/code";
import { buildSafeGlobals, containsForbiddenPattern } from "./globals";

/**
 * Configuration for the sandbox executor.
 */
export interface SandboxConfig {
  /** Maximum characters in output before truncation */
  maxOutputChars: number;

  /** Timeout for code execution in milliseconds */
  timeout: number;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_CONFIG: SandboxConfig = {
  maxOutputChars: 2000,
  timeout: 5000,
  debug: false,
};

/**
 * SandboxExecutor - Executes LLM-generated code in a restricted environment.
 *
 * Security model:
 * 1. Code is checked for forbidden patterns before execution
 * 2. Only whitelisted globals are available
 * 3. Output is captured and truncated
 * 4. Async operations are supported via await
 *
 * Note: For production use with untrusted code, consider using
 * QuickJS WebAssembly (https://github.com/aspect-sh/quickjs)
 * for true process isolation.
 */
export class SandboxExecutor {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute code in the sandbox environment.
   *
   * @param response - The LLM response (may contain markdown code blocks)
   * @param env - The sandbox environment with context, query, recursiveLlm
   * @returns Execution result with output and updated environment
   */
  async execute(
    response: string,
    env: SandboxEnvironment
  ): Promise<SandboxResult> {
    // Extract code from markdown blocks (or use raw response)
    const code = extractFirstCodeBlock(response) ?? response.trim();

    if (!code) {
      return {
        output: "",
        success: true,
        environment: env,
      };
    }

    // Security check: Look for forbidden patterns
    const forbidden = containsForbiddenPattern(code);
    if (forbidden) {
      throw new REPLError(
        `Forbidden pattern detected: "${forbidden}". ` +
          "File system, network, and process access are not allowed."
      );
    }

    // Initialize output capture
    const output: string[] = [];
    env.__output__ = output;

    // Build execution context with safe globals
    const globals = buildSafeGlobals(output);

    // Create the execution context combining globals with environment
    const context: Record<string, unknown> = {
      ...globals,
      context: env.context,
      query: env.query,
      recursiveLlm: env.recursiveLlm,
    };

    // Copy any existing variables from previous iterations
    for (const [key, value] of Object.entries(env)) {
      if (
        key !== "context" &&
        key !== "query" &&
        key !== "recursiveLlm" &&
        key !== "__output__"
      ) {
        context[key] = value;
      }
    }

    try {
      // Get param names and build the async wrapper
      const paramNames = Object.keys(context);
      const paramList = paramNames.join(", ");

      // Wrap code in async IIFE that passes params explicitly
      // This ensures variables are accessible inside the async function
      const wrappedCode = `
        return (async (${paramList}) => {
          ${code}
        })(${paramList})
      `;

      // Create function with controlled scope
      const fn = new Function(...paramNames, wrappedCode);

      // Execute with timeout
      const result = await Promise.race([
        fn(...Object.values(context)),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Execution timeout")),
            this.config.timeout
          )
        ),
      ]);

      // If the code returns a value (expression evaluation), add to output
      if (result !== undefined) {
        const resultStr =
          typeof result === "object"
            ? JSON.stringify(result, null, 2)
            : String(result);
        output.push(resultStr);
      }

      // Update environment with any new variables
      // Note: Due to JavaScript scoping, we can't easily extract new variables
      // from the executed code. For now, we rely on explicit variable setting.

      // Format and potentially truncate output
      let outputStr = output.join("\n");
      let truncated = false;

      if (outputStr.length > this.config.maxOutputChars) {
        outputStr =
          outputStr.slice(0, this.config.maxOutputChars) +
          `\n\n[Output truncated: ${outputStr.length} chars total, showing first ${this.config.maxOutputChars}]`;
        truncated = true;
      }

      if (this.config.debug) {
        console.log("[Sandbox] Executed:", code.slice(0, 100) + "...");
        console.log("[Sandbox] Output:", outputStr.slice(0, 200) + "...");
      }

      return {
        output: outputStr,
        success: true,
        environment: env,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (this.config.debug) {
        console.error("[Sandbox] Error:", errorMessage);
      }

      throw new REPLError(`Execution error: ${errorMessage}`, code);
    }
  }

  /**
   * Execute code with variable extraction.
   *
   * This version attempts to extract variables defined in the code
   * by wrapping execution in a way that captures the local scope.
   */
  async executeWithVariables(
    response: string,
    env: SandboxEnvironment,
    variablesToExtract: string[]
  ): Promise<SandboxResult & { variables: Record<string, unknown> }> {
    const code = extractFirstCodeBlock(response) ?? response.trim();

    if (!code) {
      return {
        output: "",
        success: true,
        environment: env,
        variables: {},
      };
    }

    const forbidden = containsForbiddenPattern(code);
    if (forbidden) {
      throw new REPLError(`Forbidden pattern detected: "${forbidden}"`);
    }

    const output: string[] = [];
    env.__output__ = output;

    const globals = buildSafeGlobals(output);
    const context: Record<string, unknown> = {
      ...globals,
      context: env.context,
      query: env.query,
      recursiveLlm: env.recursiveLlm,
    };

    // Prepare variable extraction
    const extractVars = variablesToExtract
      .map((v) => `"${v}": typeof ${v} !== "undefined" ? ${v} : undefined`)
      .join(", ");

    try {
      const paramNames = Object.keys(context);
      const paramList = paramNames.join(", ");

      const wrappedCode = `
        return (async (${paramList}) => {
          ${code}
          return { ${extractVars} };
        })(${paramList})
      `;

      const fn = new Function(...paramNames, wrappedCode);

      const result = await Promise.race([
        fn(...Object.values(context)),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Execution timeout")),
            this.config.timeout
          )
        ),
      ]);

      let outputStr = output.join("\n");
      if (outputStr.length > this.config.maxOutputChars) {
        outputStr =
          outputStr.slice(0, this.config.maxOutputChars) +
          `\n\n[Output truncated]`;
      }

      // Extract variables from result
      const variables: Record<string, unknown> = {};
      if (result && typeof result === "object") {
        for (const varName of variablesToExtract) {
          if ((result as Record<string, unknown>)[varName] !== undefined) {
            variables[varName] = (result as Record<string, unknown>)[varName];
            // Also add to environment for next iteration
            env[varName] = variables[varName];
          }
        }
      }

      return {
        output: outputStr,
        success: true,
        environment: env,
        variables,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new REPLError(`Execution error: ${errorMessage}`, code);
    }
  }
}

/**
 * Create a new sandbox executor with default configuration.
 */
export function createSandboxExecutor(
  config?: Partial<SandboxConfig>
): SandboxExecutor {
  return new SandboxExecutor(config);
}
