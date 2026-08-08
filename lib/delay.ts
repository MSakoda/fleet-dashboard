// Every fake endpoint calls this so loading states and placeholderData
// behavior are actually observable instead of resolving instantly.
export function randomLatencyMs(min = 150, max = 400): number {
  return min + Math.floor(Math.random() * (max - min));
}

// Rejects early if the signal aborts instead of waiting out the full delay,
// so a cancelled query actually stops server-side work instead of just
// having its response ignored on arrival.
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
