export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(Math.max(limit, 1), items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Run at most `limit` tasks at once; extra callers wait their turn. */
export function limiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= Math.max(limit, 1)) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
