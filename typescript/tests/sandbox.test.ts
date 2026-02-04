import { describe, expect, it } from "bun:test";
import { SandboxExecutor, containsForbiddenPattern } from "../src/sandbox";
import type { SandboxEnvironment } from "../src/types";
import { REPLError } from "../src/types";

describe("Sandbox: Security", () => {
  it("should detect process access", () => {
    expect(containsForbiddenPattern("process.env.SECRET")).toBe("process");
  });

  it("should detect require", () => {
    expect(containsForbiddenPattern('require("fs")')).toBe("require");
  });

  it("should detect dynamic import", () => {
    expect(containsForbiddenPattern('import("module")')).toBe("import(");
  });

  it("should detect eval", () => {
    expect(containsForbiddenPattern('eval("code")')).toBe("eval");
  });

  it("should detect Function constructor", () => {
    expect(containsForbiddenPattern('Function("return this")')).toBe(
      "Function("
    );
  });

  it("should detect __proto__", () => {
    expect(containsForbiddenPattern("obj.__proto__")).toBe("__proto__");
  });

  it("should detect globalThis", () => {
    // Note: "process" is detected first in "globalThis.process"
    // Test with just globalThis
    expect(containsForbiddenPattern("globalThis")).toBe("globalThis");
  });

  it("should detect fetch", () => {
    expect(containsForbiddenPattern('fetch("http://example.com")')).toBe(
      "fetch"
    );
  });

  it("should allow safe code", () => {
    expect(
      containsForbiddenPattern("const x = context.slice(0, 100);")
    ).toBeNull();
  });
});

describe("Sandbox: Execution", () => {
  const createEnv = (): SandboxEnvironment => ({
    context: "Hello World! This is a test context.",
    query: "What is this?",
    recursiveLlm: async (q, c) => `Recursive: ${q} on ${c.length} chars`,
    __output__: [],
  });

  it("should execute simple code", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute('console.log("Hello")', env);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Hello");
  });

  it("should access context variable", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      "console.log(context.slice(0, 5))",
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Hello");
  });

  it("should access query variable", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute("console.log(query)", env);

    expect(result.success).toBe(true);
    expect(result.output).toContain("What is this?");
  });

  it("should support string operations", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      `
      const words = context.split(" ");
      console.log("Word count:", words.length);
    `,
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Word count:");
  });

  it("should support regex operations", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      `
      const matches = context.match(/\\w+/g);
      console.log("Matches:", matches.length);
    `,
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Matches:");
  });

  it("should support JSON operations", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      `
      const obj = { foo: "bar" };
      console.log(JSON.stringify(obj));
    `,
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('"foo"');
  });

  it("should support Math operations", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      `
      const result = Math.floor(3.7);
      console.log("Result:", result);
    `,
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Result: 3");
  });

  it("should support async/await with recursiveLlm", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      `
      const subResult = await recursiveLlm("sub-query", context.slice(0, 10));
      console.log("Sub:", subResult);
    `,
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Recursive:");
  });

  it("should truncate long output", async () => {
    const sandbox = new SandboxExecutor({ maxOutputChars: 100 });
    const env = createEnv();

    const result = await sandbox.execute(
      `
      console.log("A".repeat(200));
    `,
      env
    );

    expect(result.success).toBe(true);
    // Check for truncation message (format may vary)
    expect(
      result.output.includes("[Output truncated") ||
        result.output.includes("truncated")
    ).toBe(true);
  });

  it("should extract code from markdown blocks", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.execute(
      `Here's the code:
\`\`\`javascript
console.log("From markdown");
\`\`\``,
      env
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("From markdown");
  });
});

describe("Sandbox: Error Handling", () => {
  const createEnv = (): SandboxEnvironment => ({
    context: "Test",
    query: "Test",
    recursiveLlm: async () => "",
    __output__: [],
  });

  it("should throw REPLError for forbidden patterns", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    await expect(
      sandbox.execute('require("fs")', env)
    ).rejects.toThrow(REPLError);
  });

  it("should throw REPLError for runtime errors", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    await expect(
      sandbox.execute("undefinedVariable.property", env)
    ).rejects.toThrow(REPLError);
  });

  it("should throw REPLError for syntax errors", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    await expect(
      sandbox.execute("const x = {", env)
    ).rejects.toThrow(REPLError);
  });
});

describe("Sandbox: Variable Extraction", () => {
  const createEnv = (): SandboxEnvironment => ({
    context: "Test context",
    query: "Test query",
    recursiveLlm: async () => "",
    __output__: [],
  });

  it("should extract defined variables", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.executeWithVariables(
      `
      const result = "extracted value";
      const count = 42;
    `,
      env,
      ["result", "count"]
    );

    expect(result.success).toBe(true);
    expect(result.variables.result).toBe("extracted value");
    expect(result.variables.count).toBe(42);
  });

  it("should handle undefined variables gracefully", async () => {
    const sandbox = new SandboxExecutor();
    const env = createEnv();

    const result = await sandbox.executeWithVariables(
      `
      const x = 1;
    `,
      env,
      ["x", "y"]
    );

    expect(result.success).toBe(true);
    expect(result.variables.x).toBe(1);
    expect(result.variables.y).toBeUndefined();
  });
});
