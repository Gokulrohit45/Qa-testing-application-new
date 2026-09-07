// The deadline covers both the connection and response body, including requests
// that also supply a caller cancellation signal.
export async function requestJson(url, options = {}, defaultHeaders = {}) {
  const { timeoutMs = 30000, signal, headers, ...requestOptions } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const mergedHeaders = new Headers(defaultHeaders);
    new Headers(headers).forEach((value, key) => mergedHeaders.set(key, value));
    const response = await fetch(url, { ...requestOptions, headers: mergedHeaders, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`HTTP ${response.status}: ${body}`);
      error.status = response.status;
      try { error.details = JSON.parse(body); } catch (_) {}
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
