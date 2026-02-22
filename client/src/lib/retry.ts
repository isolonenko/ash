interface RetryOptions {
  attempts: number;
  baseDelay: number;
  label?: string;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retryWithBackoff = <T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  attempt = 0,
): Promise<T> =>
  fn().catch((err: unknown) => {
    const nextAttempt = attempt + 1;

    if (nextAttempt >= options.attempts) {
      if (options.label) {
        console.warn(`[${options.label}] Failed after ${options.attempts} attempts:`, err);
      }
      return Promise.reject(err);
    }

    const delay = options.baseDelay * Math.pow(2, attempt);
    return wait(delay).then(() => retryWithBackoff(fn, options, nextAttempt));
  });
