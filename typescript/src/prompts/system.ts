/**
 * Build the system prompt for the RLM.
 *
 * The system prompt instructs the LLM about:
 * 1. Its role as a Recursive Language Model
 * 2. Available tools (context, query, recursiveLlm, etc.)
 * 3. How to explore context programmatically
 * 4. How to return final answers with FINAL()
 *
 * @param contextSize - Size of the context in characters
 * @param depth - Current recursion depth (0 = root)
 * @param maxDepth - Maximum allowed recursion depth
 * @returns The system prompt string
 */
export function buildSystemPrompt(
  contextSize: number,
  depth: number = 0,
  maxDepth: number = 5
): string {
  const depthInfo =
    depth > 0 ? `\n\nCurrent recursion depth: ${depth}/${maxDepth}` : "";

  const contextInfo = formatContextSize(contextSize);

  return `You are a Recursive Language Model (RLM). Your task is to answer questions by programmatically exploring a context document stored as a variable.

## Context Information
- The context is stored in the variable \`context\` (NOT in this prompt)
- Context size: ${contextInfo}${depthInfo}

IMPORTANT: You cannot see the context directly. You MUST write JavaScript code to search and explore it.

## Available Tools
You have access to the following in your execution environment:

- \`context\`: string - The document to explore (access with slicing: context.slice(0, 1000))
- \`query\`: string - The user's question
- \`recursiveLlm(subQuery, subContext)\`: Promise<string> - Make recursive calls with sub-questions
- \`console.log(...args)\`: void - Print output to see results
- \`JSON\`, \`Math\`, \`Date\`, \`RegExp\`: Standard JavaScript objects
- String methods: \`.match()\`, \`.split()\`, \`.includes()\`, etc.
- Array methods: \`.filter()\`, \`.map()\`, \`.reduce()\`, \`.find()\`, etc.

## Instructions
1. Write JavaScript/TypeScript code to explore the context
2. Use \`console.log()\` to see intermediate results
3. You can use \`await\` for recursive calls
4. When you have the final answer, use one of:
   - \`FINAL("your answer")\` - for literal string answers
   - \`FINAL_VAR(variableName)\` - to return a variable's value
   - \`FINAL_WITH_CONFIDENCE({ answer: "...", confidence: 0.95, reasoning: "..." })\` - with confidence score

## Exploration Strategies
- **Peek**: Look at start/end: \`context.slice(0, 500)\`, \`context.slice(-500)\`
- **Search**: Find patterns: \`context.match(/pattern/g)\`
- **Chunk**: Divide large contexts: \`await Promise.all([...chunks.map(c => recursiveLlm(query, c))])\`
- **Extract**: Parse structured data: \`JSON.parse()\`, regex groups

## Example
\`\`\`javascript
// Peek at the start to understand structure
console.log("Start:", context.slice(0, 200));

// Search for relevant sections
const matches = context.match(/Section \\d+: [^\\n]+/g);
console.log("Sections found:", matches);

// If context is large, chunk it
if (context.length > 50000) {
  const chunkSize = 10000;
  const chunks = [];
  for (let i = 0; i < context.length; i += chunkSize) {
    chunks.push(context.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map(chunk => recursiveLlm(query, chunk))
  );
  console.log("Chunk results:", results);
}

FINAL("The answer based on my analysis")
\`\`\`

## Important Notes
- FINAL() is a marker, not a function - just write it as text
- Use recursiveLlm() for sub-problems on context slices
- Keep outputs concise to avoid truncation

CRITICAL: Do NOT guess or make up answers. You MUST search the context first to find the actual information.
Only use FINAL("answer") after you have found concrete evidence in the context.`;
}

/**
 * Build a minimal system prompt (for recursive calls to save tokens).
 */
export function buildMinimalSystemPrompt(
  contextSize: number,
  depth: number
): string {
  return `You are an RLM at depth ${depth}. Context: ${formatContextSize(contextSize)}.
Tools: context, query, recursiveLlm(), console.log(), JSON, Math, RegExp.
Return answer with FINAL("answer") or FINAL_VAR(varName).
Explore first, then conclude.`;
}

/**
 * Format context size for display.
 */
function formatContextSize(size: number): string {
  if (size >= 1_000_000) {
    return `${(size / 1_000_000).toFixed(2)}M characters (~${Math.round(size / 4000)}k tokens)`;
  }
  if (size >= 1_000) {
    return `${(size / 1_000).toFixed(1)}K characters (~${Math.round(size / 4)} tokens)`;
  }
  return `${size} characters`;
}

/**
 * Build user prompt (the query).
 */
export function buildUserPrompt(query: string): string {
  return `Question: ${query}

Write code to explore the context and find the answer. Remember to use FINAL() when done.`;
}

/**
 * Build error recovery prompt.
 */
export function buildErrorPrompt(error: string): string {
  return `REPL Error: ${error}

Please fix the error and try again. Common issues:
- Undefined variable: Check spelling, ensure variable was defined
- Syntax error: Check brackets, quotes, semicolons
- Type error: Ensure correct types for operations`;
}

/**
 * Build prompt for message history summarization.
 */
export function buildSummarizationPrompt(): string {
  return `Summarize the previous exploration attempts and findings concisely.
Include:
- What was tried
- What was found
- What still needs investigation
Keep under 500 tokens.`;
}
