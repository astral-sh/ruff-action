const COMMAND_RE = /^::(?:error|warning)\s+(.*?)::(.*)$/;

export function formatAnnotationsForSummary(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const formatted: string[] = [];
  let unmatchedCommandLines = 0;

  for (const line of lines) {
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

      if (file && lineNo) {
        const colStr = col ? `:${col}` : "";
        formatted.push(`${file}:${lineNo}${colStr}: ${code}${message}`);
      } else {
        formatted.push(`${code}${message}`);
      }
    } else if (line.startsWith("::")) {
      unmatchedCommandLines++;
    } else if (line.trim()) {
      formatted.push(line);
    }
  }

  if (unmatchedCommandLines > 0 && formatted.length === 0) {
    return raw;
  }

  return truncate(formatted.join("\n"), 100000);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n... (truncated, ${text.length - maxChars} more characters)`;
}
