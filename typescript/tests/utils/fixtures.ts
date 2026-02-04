/**
 * Test fixture utilities for loading documents and query sets.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(__dirname, "../fixtures");

/**
 * Load the financial report fixture.
 * @returns Financial report document as string
 */
export function loadFinancialReport(): string {
  return loadDocument("financial-report");
}

/**
 * Load a document fixture by name.
 * @param name - Document name (e.g., "financial-report")
 * @returns Document content as string
 */
export function loadDocument(name: string): string {
  const path = join(FIXTURES_DIR, "documents", `${name}.txt`);

  if (!existsSync(path)) {
    throw new Error(`Document fixture not found: ${name} (${path})`);
  }

  return readFileSync(path, "utf-8");
}

/**
 * Load a query set fixture by name.
 * @param name - Query set name (e.g., "extraction")
 * @returns Array of test cases
 */
export function loadQuerySet(
  name: string
): Array<{
  query: string;
  expectedAnswer: string;
  context?: string;
  category?: string;
}> {
  const path = join(FIXTURES_DIR, "queries", `${name}.json`);

  if (!existsSync(path)) {
    throw new Error(`Query set fixture not found: ${name} (${path})`);
  }

  const content = readFileSync(path, "utf-8");
  return JSON.parse(content);
}

/**
 * Generate a large context by repeating a document.
 * @param name - Document name
 * @param targetSize - Target size in characters
 * @returns Repeated document content
 */
export function generateLargeContext(name: string, targetSize: number): string {
  const doc = loadDocument(name);
  const repeats = Math.ceil(targetSize / doc.length);
  return doc.repeat(repeats).slice(0, targetSize);
}

/**
 * Get all available document names.
 */
export function listDocuments(): string[] {
  return ["financial-report"];
}

/**
 * Get all available query set names.
 */
export function listQuerySets(): string[] {
  return ["extraction", "aggregation", "search"];
}

/**
 * Test case interface for query validation.
 */
export interface TestCase {
  id: string;
  query: string;
  expectedAnswer: string;
  document?: string;
  category: "extraction" | "aggregation" | "search";
  difficulty: "easy" | "medium" | "hard";
}

/**
 * Financial report test cases with known answers.
 */
export const FINANCIAL_REPORT_TEST_CASES: TestCase[] = [
  // Extraction queries
  {
    id: "extract-1",
    query: "What was the Q3 revenue?",
    expectedAnswer: "$14.1 million",
    document: "financial-report",
    category: "extraction",
    difficulty: "easy",
  },
  {
    id: "extract-2",
    query: "What was the total annual revenue?",
    expectedAnswer: "$52.7 million",
    document: "financial-report",
    category: "extraction",
    difficulty: "easy",
  },
  {
    id: "extract-3",
    query: "How many employees were there at year end?",
    expectedAnswer: "450",
    document: "financial-report",
    category: "extraction",
    difficulty: "easy",
  },
  {
    id: "extract-4",
    query: "What was the acquisition cost of StartupX?",
    expectedAnswer: "$5 million",
    document: "financial-report",
    category: "extraction",
    difficulty: "medium",
  },
  {
    id: "extract-5",
    query: "What percentage of revenue came from international markets?",
    expectedAnswer: "40%",
    document: "financial-report",
    category: "extraction",
    difficulty: "medium",
  },

  // Aggregation queries
  {
    id: "agg-1",
    query: "What is the sum of all quarterly revenues?",
    expectedAnswer: "$52.7 million",
    document: "financial-report",
    category: "aggregation",
    difficulty: "medium",
  },
  {
    id: "agg-2",
    query: "How many new customers were acquired throughout the year?",
    expectedAnswer: "675", // 127 + 156 + 189 + 203 = 675
    document: "financial-report",
    category: "aggregation",
    difficulty: "hard",
  },
  {
    id: "agg-3",
    query: "What was the average operating margin across all quarters?",
    expectedAnswer: "21.85%", // (20 + 22.7 + 22.6 + 22.1) / 4
    document: "financial-report",
    category: "aggregation",
    difficulty: "hard",
  },

  // Search queries
  {
    id: "search-1",
    query: "Which quarter had the highest revenue?",
    expectedAnswer: "Q4",
    document: "financial-report",
    category: "search",
    difficulty: "easy",
  },
  {
    id: "search-2",
    query: "When did the company achieve SOC 2 certification?",
    expectedAnswer: "Q2",
    document: "financial-report",
    category: "search",
    difficulty: "medium",
  },
  {
    id: "search-3",
    query: "What regions were expanded to in Q4?",
    expectedAnswer: "Japan, Australia",
    document: "financial-report",
    category: "search",
    difficulty: "medium",
  },
];

/**
 * Check if an answer matches the expected answer.
 * Uses fuzzy matching to account for variations.
 */
export function answerMatches(actual: string, expected: string): boolean {
  // Normalize both strings
  const normalizedActual = actual.toLowerCase().replace(/[,\s]+/g, " ").trim();
  const normalizedExpected = expected
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .trim();

  // Direct match
  if (normalizedActual.includes(normalizedExpected)) {
    return true;
  }

  // Number extraction for monetary values
  const actualNumbers = normalizedActual.match(/[\d.]+/g) || [];
  const expectedNumbers = normalizedExpected.match(/[\d.]+/g) || [];

  for (const expNum of expectedNumbers) {
    if (actualNumbers.some((actNum) => actNum === expNum)) {
      return true;
    }
  }

  return false;
}
