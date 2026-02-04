import type { SandboxEnvironment } from "../types";

/**
 * Extract answer from FINAL() statement in LLM response.
 *
 * Supports multiple quote styles:
 * - FINAL("answer")
 * - FINAL('answer')
 * - FINAL("""multiline answer""")
 * - FINAL('''multiline answer''')
 * - FINAL(`template literal`)
 *
 * @param response - The LLM response text
 * @returns The extracted answer or null if no FINAL found
 */
export function extractFinal(response: string): string | null {
  // Patterns ordered by specificity (triple quotes first)
  const patterns = [
    // Triple double quotes (multiline)
    /FINAL\s*\(\s*"""([\s\S]*?)"""\s*\)/,
    // Triple single quotes (multiline)
    /FINAL\s*\(\s*'''([\s\S]*?)'''\s*\)/,
    // Template literal
    /FINAL\s*\(\s*`([\s\S]*?)`\s*\)/,
    // Double quotes (single line)
    /FINAL\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/,
    // Single quotes (single line)
    /FINAL\s*\(\s*'([^'\\]*(?:\\.[^'\\]*)*)'\s*\)/,
    // Unquoted value (numbers only - for safety, require digits or decimal)
    /FINAL\s*\(\s*(-?[\d.]+)\s*\)/,
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match?.[1] !== undefined) {
      // Unescape common escape sequences
      return unescapeString(match[1].trim());
    }
  }

  return null;
}

/**
 * Extract answer from FINAL_VAR(variableName) statement.
 *
 * Looks up the variable in the sandbox environment and returns its string value.
 *
 * @param response - The LLM response text
 * @param env - The sandbox environment containing variables
 * @returns The variable value as string, or null if not found
 */
export function extractFinalVar(
  response: string,
  env: SandboxEnvironment
): string | null {
  // Match FINAL_VAR(variableName) - variable names can be alphanumeric with underscores
  const pattern = /FINAL_VAR\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/;
  const match = response.match(pattern);

  if (!match?.[1]) {
    return null;
  }

  const varName = match[1];
  const value = env[varName];

  if (value === undefined) {
    return null;
  }

  // Convert to string representation
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Extract answer from FINAL_WITH_CONFIDENCE({ answer, confidence, reasoning }).
 *
 * @param response - The LLM response text
 * @returns Parsed confidence result or null if not found
 */
export function extractFinalWithConfidence(response: string): {
  answer: string;
  confidence: number;
  reasoning?: string;
} | null {
  // Match FINAL_WITH_CONFIDENCE({ ... })
  const pattern = /FINAL_WITH_CONFIDENCE\s*\(\s*(\{[\s\S]*?\})\s*\)/;
  const match = response.match(pattern);

  if (!match?.[1]) {
    return null;
  }

  try {
    // Try to parse as JSON
    const parsed = JSON.parse(match[1]);

    if (
      typeof parsed.answer !== "string" ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      answer: parsed.answer,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
    };
  } catch {
    // Try to extract fields manually if JSON parsing fails
    const answerMatch = match[1].match(/answer\s*:\s*["'`]([^"'`]+)["'`]/);
    const confidenceMatch = match[1].match(/confidence\s*:\s*([\d.]+)/);

    if (answerMatch?.[1] && confidenceMatch?.[1]) {
      const reasoningMatch = match[1].match(/reasoning\s*:\s*["'`]([^"'`]+)["'`]/);
      return {
        answer: answerMatch[1],
        confidence: Math.max(0, Math.min(1, parseFloat(confidenceMatch[1]))),
        reasoning: reasoningMatch?.[1],
      };
    }

    return null;
  }
}

/**
 * Check if response contains any FINAL marker.
 *
 * @param response - The LLM response text
 * @returns True if response contains FINAL, FINAL_VAR, or FINAL_WITH_CONFIDENCE
 */
export function isFinal(response: string): boolean {
  return (
    response.includes("FINAL(") ||
    response.includes("FINAL_VAR(") ||
    response.includes("FINAL_WITH_CONFIDENCE(")
  );
}

/**
 * Parse response for any final statement.
 *
 * Tries extractors in order:
 * 1. FINAL_WITH_CONFIDENCE (most specific)
 * 2. FINAL (literal string)
 * 3. FINAL_VAR (variable reference)
 *
 * @param response - The LLM response text
 * @param env - The sandbox environment
 * @returns Parsed result or null if no FINAL found
 */
export function parseResponse(
  response: string,
  env: SandboxEnvironment
): { answer: string; confidence?: number; reasoning?: string } | null {
  // Try FINAL_WITH_CONFIDENCE first (most structured)
  const withConfidence = extractFinalWithConfidence(response);
  if (withConfidence) {
    return withConfidence;
  }

  // Try FINAL (literal string)
  const finalAnswer = extractFinal(response);
  if (finalAnswer !== null) {
    return { answer: finalAnswer };
  }

  // Try FINAL_VAR (variable reference)
  const varAnswer = extractFinalVar(response, env);
  if (varAnswer !== null) {
    return { answer: varAnswer };
  }

  return null;
}

/**
 * Unescape common escape sequences in strings.
 */
function unescapeString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}
