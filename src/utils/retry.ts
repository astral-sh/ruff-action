import * as core from "@actions/core";

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs?: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  maxRetries: 3,
  timeoutMs: 30000, // 30 second timeout
};

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export class NonRetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  operationName = "operation",
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(
          opts.initialDelayMs * opts.backoffMultiplier ** (attempt - 1),
          opts.maxDelayMs,
        );
        core.info(
          `Retrying ${operationName} (attempt ${attempt + 1}/${opts.maxRetries + 1}) after ${delay}ms delay...`,
        );
        await sleep(delay);
      }

      // Wrap operation with timeout if specified
      if (opts.timeoutMs) {
        return await withTimeout(operation(), opts.timeoutMs, operationName);
      } else {
        return await operation();
      }
    } catch (error) {
      lastError = error as Error;

      // Don't retry on non-retryable errors
      if (lastError instanceof NonRetryableError) {
        core.debug(
          `Non-retryable error in ${operationName}: ${lastError.message}`,
        );
        throw lastError.cause || lastError;
      }

      // Log the error for debugging
      core.debug(
        `Attempt ${attempt + 1} failed for ${operationName}: ${lastError.message}`,
      );

      // If this was the last attempt, throw the error
      if (attempt === opts.maxRetries) {
        core.error(
          `${operationName} failed after ${opts.maxRetries + 1} attempts. Last error: ${lastError.message}`,
        );
        throw lastError;
      }
    }
  }

  throw lastError || new Error(`${operationName} failed for unknown reason`);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = "operation",
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new RetryableError(`${operationName} timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network-related errors that should be retried
  const retryableMessages = [
    "connect timeout",
    "connection timeout",
    "timeout",
    "econnreset",
    "econnrefused",
    "enotfound",
    "network error",
    "request timeout",
    "socket timeout",
    "fetch failed",
    "connect etimedout",
  ];

  // HTTP status codes that should be retried
  const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

  // Check for retryable messages
  if (retryableMessages.some((msg) => message.includes(msg))) {
    return true;
  }

  // Check for HTTP status codes in error message
  const statusMatch = message.match(/status.*?(\d{3})/);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    if (retryableStatusCodes.includes(statusCode)) {
      return true;
    }
  }

  return false;
}

export function wrapWithRetryLogic<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: Partial<RetryOptions> = {},
): () => Promise<T> {
  return async () => {
    try {
      return await withRetry(operation, options, operationName);
    } catch (error) {
      const err = error as Error;
      if (isRetryableError(err)) {
        throw new RetryableError(
          `${operationName} failed: ${err.message}`,
          err,
        );
      } else {
        throw new NonRetryableError(
          `${operationName} failed: ${err.message}`,
          err,
        );
      }
    }
  };
}
