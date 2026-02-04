/**
 * Extract code blocks from LLM response.
 *
 * Supports:
 * - ```javascript ... ```
 * - ```typescript ... ```
 * - ```js ... ```
 * - ```ts ... ```
 * - ``` ... ``` (no language specified)
 * - Raw code (if no markdown blocks found)
 *
 * @param response - The LLM response text
 * @returns Array of extracted code blocks
 */
export function extractCodeBlocks(response: string): string[] {
  const blocks: string[] = [];

  // Pattern for markdown code blocks with optional language
  const codeBlockPattern = /```(?:javascript|typescript|js|ts)?\s*\n?([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = codeBlockPattern.exec(response)) !== null) {
    const code = match[1]?.trim();
    if (code) {
      blocks.push(code);
    }
  }

  // If no markdown blocks found, treat entire response as code
  // (after removing any FINAL markers which aren't executable)
  if (blocks.length === 0) {
    const rawCode = response
      .replace(/FINAL\s*\([^)]*\)/g, "")
      .replace(/FINAL_VAR\s*\([^)]*\)/g, "")
      .replace(/FINAL_WITH_CONFIDENCE\s*\([^)]*\)/g, "")
      .trim();

    if (rawCode && isLikelyCode(rawCode)) {
      blocks.push(rawCode);
    }
  }

  return blocks;
}

/**
 * Extract the first code block from response.
 *
 * @param response - The LLM response text
 * @returns The first code block or null if none found
 */
export function extractFirstCodeBlock(response: string): string | null {
  const blocks = extractCodeBlocks(response);
  return blocks[0] ?? null;
}

/**
 * Check if text looks like code (heuristic).
 */
function isLikelyCode(text: string): boolean {
  const codeIndicators = [
    // Variable declarations
    /\b(?:const|let|var)\s+\w+/,
    // Function calls
    /\w+\s*\(/,
    // Property access
    /\w+\.\w+/,
    // Assignment
    /\w+\s*=/,
    // Array/object literals
    /[\[\{]/,
    // Comparison operators
    /[=!<>]=?/,
    // Arithmetic
    /[+\-*/%]/,
    // Comments
    /\/[/*]/,
  ];

  // At least 2 indicators suggest it's code
  let matches = 0;
  for (const pattern of codeIndicators) {
    if (pattern.test(text)) {
      matches++;
      if (matches >= 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Remove markdown formatting from response while preserving code.
 *
 * @param response - The LLM response text
 * @returns Cleaned response
 */
export function cleanMarkdown(response: string): string {
  return response
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Remove headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Normalize whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse inline code from response.
 *
 * @param response - The LLM response text
 * @returns Array of inline code snippets
 */
export function extractInlineCode(response: string): string[] {
  const snippets: string[] = [];
  const pattern = /`([^`]+)`/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(response)) !== null) {
    if (match[1]) {
      snippets.push(match[1]);
    }
  }

  return snippets;
}
