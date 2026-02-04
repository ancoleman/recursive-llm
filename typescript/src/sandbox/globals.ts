/**
 * Whitelisted globals for the sandbox environment.
 *
 * These are the only built-in functions and objects available
 * to LLM-generated code. Everything else is forbidden.
 */

/**
 * Create a captured console.log that stores output.
 */
export function createCapturedConsole(output: string[]): {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
} {
  const formatArg = (arg: unknown): string => {
    if (arg === undefined) return "undefined";
    if (arg === null) return "null";
    if (typeof arg === "string") return arg;
    if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
    if (typeof arg === "function") return "[Function]";
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (Array.isArray(arg)) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return "[Array]";
      }
    }
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return "[Object]";
      }
    }
    return String(arg);
  };

  const log = (...args: unknown[]): void => {
    output.push(args.map(formatArg).join(" "));
  };

  return {
    log,
    warn: log,
    error: log,
  };
}

/**
 * Safe subset of Math object (read-only).
 */
export const SAFE_MATH = Object.freeze({
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  sqrt: Math.sqrt,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  random: Math.random,
  PI: Math.PI,
  E: Math.E,
});

/**
 * Safe subset of JSON object.
 */
export const SAFE_JSON = Object.freeze({
  parse: JSON.parse,
  stringify: JSON.stringify,
});

/**
 * Safe Date constructor wrapper.
 * Only allows creation and reading, not system modification.
 */
export function createSafeDate(): DateConstructor {
  return class SafeDate extends Date {
    constructor(...args: ConstructorParameters<typeof Date>) {
      super(...(args as [string | number | Date]));
    }
  } as unknown as DateConstructor;
}

/**
 * Safe RegExp - same as built-in but documented.
 */
export const SafeRegExp = RegExp;

/**
 * Build the complete safe globals object for the sandbox.
 */
export function buildSafeGlobals(output: string[]): Record<string, unknown> {
  return {
    // Console (captured)
    console: createCapturedConsole(output),

    // Primitives
    String,
    Number,
    Boolean,
    BigInt,
    Symbol,

    // Collections
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,

    // JSON
    JSON: SAFE_JSON,

    // Math
    Math: SAFE_MATH,

    // Date
    Date: createSafeDate(),

    // RegExp
    RegExp: SafeRegExp,

    // Promise (for async operations)
    Promise,

    // Utilities
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,

    // Undefined/null/special values
    undefined,
    NaN,
    Infinity,

    // Error types (for catching)
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
  };
}

/**
 * List of forbidden patterns in code.
 * These will cause immediate rejection before execution.
 */
export const FORBIDDEN_PATTERNS = [
  // Process/OS access
  /\bprocess\b/,
  /\brequire\b/,
  /\bimport\s*\(/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bglobal\b/,
  /\bglobalThis\b/,

  // Dangerous functions
  /\beval\b/,
  /\bFunction\b\s*\(/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bsetImmediate\b/,

  // Prototype pollution
  /\b__proto__\b/,
  /\bconstructor\s*\[/,
  /\bprototype\b/,

  // File system
  /\bfs\b/,
  /\bpath\b/,
  /\bchild_process\b/,

  // Network
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,

  // Bun/Node specific
  /\bBun\b/,
  /\bDeno\b/,
  /\bBuffer\b/,
];

/**
 * Check if code contains forbidden patterns.
 */
export function containsForbiddenPattern(code: string): string | null {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      const match = code.match(pattern);
      return match ? match[0] : "forbidden pattern";
    }
  }
  return null;
}
