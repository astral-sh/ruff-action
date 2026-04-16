import { existsSync } from "node:fs";
import { glob } from "node:fs/promises";

/**
 * Tokenize a shell-style input string, respecting single and double quotes.
 * Unquoted whitespace splits tokens; quoted content is taken literally
 * (with backslash escaping inside double quotes).
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < input.length && input[i] !== quote) {
        if (
          quote === '"' &&
          input[i] === "\\" &&
          i + 1 < input.length &&
          (input[i + 1] === '"' || input[i + 1] === "\\")
        ) {
          i++; // skip the backslash
          current += input[i];
        } else {
          current += input[i];
        }
        i++;
      }
      // skip closing quote
      i++;
    } else if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      i++;
    } else {
      current += ch;
      i++;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

const GLOB_CHARS = /[*?[{]/;

function isGlobPattern(s: string): boolean {
  return GLOB_CHARS.test(s);
}

/**
 * Expand glob patterns in the src input.
 *
 * - Plain paths (no glob characters) that don't exist on disk are a hard error.
 * - Glob patterns that match zero files are a hard error.
 * - Tokens without glob characters are returned as-is (no glob I/O).
 */
export async function expandGlobs(srcInput: string): Promise<string[]> {
  const tokens = tokenize(srcInput);

  const expanded: string[] = [];

  for (const token of tokens) {
    if (!isGlobPattern(token)) {
      if (!existsSync(token)) {
        throw new Error(`Source path '${token}' does not exist.`);
      }
      expanded.push(token);
      continue;
    }

    const matches: string[] = [];
    for await (const entry of glob(token)) {
      matches.push(entry);
    }

    if (matches.length === 0) {
      throw new Error(`Glob pattern '${token}' matched no files.`);
    }

    expanded.push(...matches);
  }

  return expanded;
}
