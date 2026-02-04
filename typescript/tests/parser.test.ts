import { describe, expect, it } from "bun:test";
import {
  extractFinal,
  extractFinalVar,
  extractFinalWithConfidence,
  isFinal,
  parseResponse,
  extractCodeBlocks,
  extractFirstCodeBlock,
} from "../src/parser";
import type { SandboxEnvironment } from "../src/types";

describe("Parser: extractFinal", () => {
  it("should extract answer from double-quoted FINAL", () => {
    const response = 'Some code\nFINAL("The answer is 42")';
    expect(extractFinal(response)).toBe("The answer is 42");
  });

  it("should extract answer from single-quoted FINAL", () => {
    const response = "FINAL('Hello World')";
    expect(extractFinal(response)).toBe("Hello World");
  });

  it("should extract multiline answer from triple-quoted FINAL", () => {
    const response = `FINAL("""This is
a multiline
answer""")`;
    expect(extractFinal(response)).toBe("This is\na multiline\nanswer");
  });

  it("should extract answer from template literal FINAL", () => {
    const response = "FINAL(`Template answer`)";
    expect(extractFinal(response)).toBe("Template answer");
  });

  it("should handle escaped quotes", () => {
    const response = 'FINAL("He said \\"Hello\\"")';
    expect(extractFinal(response)).toBe('He said "Hello"');
  });

  it("should handle newline escape sequences", () => {
    const response = 'FINAL("Line1\\nLine2")';
    expect(extractFinal(response)).toBe("Line1\nLine2");
  });

  it("should return null if no FINAL found", () => {
    const response = "Just some code without FINAL";
    expect(extractFinal(response)).toBeNull();
  });

  it("should handle whitespace around FINAL", () => {
    const response = 'FINAL( "answer" )';
    expect(extractFinal(response)).toBe("answer");
  });
});

describe("Parser: extractFinalVar", () => {
  const createEnv = (vars: Record<string, unknown>): SandboxEnvironment => ({
    context: "",
    query: "",
    recursiveLlm: async () => "",
    __output__: [],
    ...vars,
  });

  it("should extract string variable", () => {
    const env = createEnv({ result: "Test Answer" });
    const response = "FINAL_VAR(result)";
    expect(extractFinalVar(response, env)).toBe("Test Answer");
  });

  it("should extract number variable", () => {
    const env = createEnv({ count: 42 });
    const response = "FINAL_VAR(count)";
    expect(extractFinalVar(response, env)).toBe("42");
  });

  it("should extract object variable as JSON", () => {
    const env = createEnv({ data: { foo: "bar" } });
    const response = "FINAL_VAR(data)";
    const result = extractFinalVar(response, env);
    expect(result).toContain('"foo"');
    expect(result).toContain('"bar"');
  });

  it("should extract array variable as JSON", () => {
    const env = createEnv({ items: [1, 2, 3] });
    const response = "FINAL_VAR(items)";
    const result = extractFinalVar(response, env);
    expect(JSON.parse(result!)).toEqual([1, 2, 3]);
  });

  it("should return null for undefined variable", () => {
    const env = createEnv({});
    const response = "FINAL_VAR(nonexistent)";
    expect(extractFinalVar(response, env)).toBeNull();
  });

  it("should handle underscore in variable names", () => {
    const env = createEnv({ my_variable: "value" });
    const response = "FINAL_VAR(my_variable)";
    expect(extractFinalVar(response, env)).toBe("value");
  });
});

describe("Parser: extractFinalWithConfidence", () => {
  it("should extract structured confidence response", () => {
    const response = `FINAL_WITH_CONFIDENCE({ "answer": "Test", "confidence": 0.95, "reasoning": "Because" })`;
    const result = extractFinalWithConfidence(response);
    expect(result).toEqual({
      answer: "Test",
      confidence: 0.95,
      reasoning: "Because",
    });
  });

  it("should clamp confidence to 0-1 range", () => {
    const response = `FINAL_WITH_CONFIDENCE({ "answer": "Test", "confidence": 1.5 })`;
    const result = extractFinalWithConfidence(response);
    expect(result?.confidence).toBe(1);
  });

  it("should handle missing reasoning", () => {
    const response = `FINAL_WITH_CONFIDENCE({ "answer": "Test", "confidence": 0.8 })`;
    const result = extractFinalWithConfidence(response);
    expect(result?.reasoning).toBeUndefined();
  });

  it("should return null for invalid JSON", () => {
    const response = `FINAL_WITH_CONFIDENCE({ invalid json })`;
    expect(extractFinalWithConfidence(response)).toBeNull();
  });
});

describe("Parser: isFinal", () => {
  it("should return true for FINAL", () => {
    expect(isFinal('FINAL("answer")')).toBe(true);
  });

  it("should return true for FINAL_VAR", () => {
    expect(isFinal("FINAL_VAR(result)")).toBe(true);
  });

  it("should return true for FINAL_WITH_CONFIDENCE", () => {
    expect(isFinal('FINAL_WITH_CONFIDENCE({ "answer": "" })')).toBe(true);
  });

  it("should return false for no FINAL", () => {
    expect(isFinal("console.log(x)")).toBe(false);
  });
});

describe("Parser: parseResponse", () => {
  const createEnv = (vars: Record<string, unknown>): SandboxEnvironment => ({
    context: "",
    query: "",
    recursiveLlm: async () => "",
    __output__: [],
    ...vars,
  });

  it("should prefer FINAL_WITH_CONFIDENCE over FINAL", () => {
    const env = createEnv({});
    const response = `FINAL("simple")
FINAL_WITH_CONFIDENCE({ "answer": "detailed", "confidence": 0.9 })`;
    const result = parseResponse(response, env);
    expect(result?.answer).toBe("detailed");
    expect(result?.confidence).toBe(0.9);
  });

  it("should fall back to FINAL if no confidence", () => {
    const env = createEnv({});
    const response = 'FINAL("answer")';
    const result = parseResponse(response, env);
    expect(result?.answer).toBe("answer");
    expect(result?.confidence).toBeUndefined();
  });

  it("should fall back to FINAL_VAR", () => {
    const env = createEnv({ result: "var_answer" });
    const response = "FINAL_VAR(result)";
    const result = parseResponse(response, env);
    expect(result?.answer).toBe("var_answer");
  });
});

describe("Parser: extractCodeBlocks", () => {
  it("should extract JavaScript code block", () => {
    const response = `Here's the code:
\`\`\`javascript
const x = 1;
console.log(x);
\`\`\``;
    const blocks = extractCodeBlocks(response);
    expect(blocks.length).toBe(1);
    expect(blocks[0]).toContain("const x = 1");
  });

  it("should extract TypeScript code block", () => {
    const response = `\`\`\`typescript
const x: number = 1;
\`\`\``;
    const blocks = extractCodeBlocks(response);
    expect(blocks[0]).toContain("const x: number = 1");
  });

  it("should extract multiple code blocks", () => {
    const response = `\`\`\`js
const a = 1;
\`\`\`
\`\`\`ts
const b = 2;
\`\`\``;
    const blocks = extractCodeBlocks(response);
    expect(blocks.length).toBe(2);
  });

  it("should extract unmarked code block", () => {
    const response = `\`\`\`
const x = 1;
\`\`\``;
    const blocks = extractCodeBlocks(response);
    expect(blocks[0]).toContain("const x = 1");
  });

  it("should treat raw code as code if no blocks found", () => {
    const response = "const x = 1;\nconsole.log(x);";
    const blocks = extractCodeBlocks(response);
    expect(blocks.length).toBe(1);
  });
});

describe("Parser: extractFirstCodeBlock", () => {
  it("should return first block only", () => {
    const response = `\`\`\`js
first
\`\`\`
\`\`\`js
second
\`\`\``;
    expect(extractFirstCodeBlock(response)).toBe("first");
  });

  it("should return null for non-code text", () => {
    const response = "Just plain text with no code";
    expect(extractFirstCodeBlock(response)).toBeNull();
  });
});
