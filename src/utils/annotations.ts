const COMMAND_RE = /^::(?:error|warning)\s+(.*?)::(.*)$/;
const MAX_SUMMARY_CHARS = 100000;

export class AnnotationParser {
  private buffer = "";
  readonly formatted: string[] = [];
  unmatchedCommandLines = 0;
  private rawChunks: string[] = [];
  private rawLength = 0;
  private rawTruncatedChars = 0;
  private formattedLength = 0;
  private formattedTruncatedChars = 0;

  public append(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      this.processLine(line);
    }
  }

  public flush(): void {
    if (this.buffer) {
      this.processLine(this.buffer);
      this.buffer = "";
    }
  }

  private processLine(line: string): void {
    const match = line.match(COMMAND_RE);
    if (match) {
      const [, paramStr, message] = match;
      const params: Record<string, string> = {};
      for (const pair of paramStr.split(",")) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx !== -1) {
          const key = pair.substring(0, eqIdx).trim();
          const val = pair.substring(eqIdx + 1).trim();
          params[key] = val;
        }
      }
      const file = params.file || "";
      const lineNo = params.line || "";
      const col = params.col || "";
      const title = params.title || "";

      let code = "";
      if (title) {
        const codeMatch = title.match(/\(([^)]+)\)/);
        if (codeMatch) {
          code = `${codeMatch[1]} `;
        }
      }

      let cleanedMessage = message;
      if (file && lineNo) {
        const prefixWithCode = `${file}:${lineNo}${col ? `:${col}` : ""}: ${code}`;
        const prefixWithoutCode = `${file}:${lineNo}${col ? `:${col}` : ""}: `;
        if (cleanedMessage.startsWith(prefixWithCode)) {
          cleanedMessage = cleanedMessage.slice(prefixWithCode.length);
        } else if (cleanedMessage.startsWith(prefixWithoutCode)) {
          cleanedMessage = cleanedMessage.slice(prefixWithoutCode.length);
        }
      }

      const formattedLine =
        file && lineNo
          ? `${file}:${lineNo}${col ? `:${col}` : ""}: ${code}${cleanedMessage}`
          : `${code}${cleanedMessage}`;

      this.addFormatted(formattedLine);
    } else if (line.startsWith("::")) {
      this.unmatchedCommandLines++;
      this.addRaw(line);
    } else if (line.trim()) {
      this.addFormatted(line);
    } else {
      this.addRaw(line);
    }
  }

  private addFormatted(line: string): void {
    if (this.formattedLength < MAX_SUMMARY_CHARS) {
      this.formatted.push(line);
      this.formattedLength += line.length + (this.formatted.length > 1 ? 1 : 0);
    } else {
      this.formattedTruncatedChars += line.length + 1;
    }
    this.addRaw(line);
  }

  private addRaw(line: string): void {
    if (this.rawLength < MAX_SUMMARY_CHARS) {
      this.rawChunks.push(line);
      this.rawLength += line.length + (this.rawChunks.length > 1 ? 1 : 0);
    } else {
      this.rawTruncatedChars += line.length + 1;
    }
  }

  public getSummary(): string {
    if (this.unmatchedCommandLines > 0 && this.formatted.length === 0) {
      return this.truncate(
        this.rawChunks.join("\n"),
        MAX_SUMMARY_CHARS,
        this.rawTruncatedChars,
      );
    }

    return this.truncate(
      this.formatted.join("\n"),
      MAX_SUMMARY_CHARS,
      this.formattedTruncatedChars,
    );
  }

  private truncate(
    text: string,
    maxChars: number,
    truncatedCount: number,
  ): string {
    const totalTruncated = Math.max(0, text.length - maxChars) + truncatedCount;
    if (totalTruncated === 0) {
      return text;
    }
    return `${text.slice(0, maxChars)}\n\n... (truncated, ${totalTruncated} more characters)`;
  }
}

export function formatAnnotationsForSummary(raw: string): string {
  const parser = new AnnotationParser();
  parser.append(raw);
  parser.flush();
  return parser.getSummary();
}
