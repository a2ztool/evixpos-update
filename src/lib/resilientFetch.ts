import { toast } from "sonner";

interface FetchOptions extends RequestInit {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  silent?: boolean;
}

const DEFAULT_TIMEOUT = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1500;

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly type: "offline" | "timeout" | "server" | "unknown",
    public readonly status?: number
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

async function attemptFetch(
  url: string,
  options: FetchOptions,
  attempt: number
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOpts } = options;

  if (!navigator.onLine) {
    throw new NetworkError(
      "You are offline. Please check your internet connection.",
      "offline"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOpts,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status >= 500) {
      throw new NetworkError(
        `Server error (${response.status})`,
        "server",
        response.status
      );
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error instanceof NetworkError) throw error;

    if (error.name === "AbortError") {
      throw new NetworkError(
        "Request timed out. Please try again.",
        "timeout"
      );
    }

    if (!navigator.onLine) {
      throw new NetworkError(
        "You are offline. Please check your internet connection.",
        "offline"
      );
    }

    throw new NetworkError(
      "Network error. Please check your connection.",
      "unknown"
    );
  }
}

export async function resilientFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
  const silent = options.silent ?? false;

  let lastError: NetworkError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await attemptFetch(url, options, attempt);
    } catch (error: any) {
      lastError = error instanceof NetworkError
        ? error
        : new NetworkError(error.message, "unknown");

      // Don't retry offline errors
      if (lastError.type === "offline") break;

      // Wait before retrying (except last attempt)
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
      }
    }
  }

  if (!silent && lastError) {
    const toastMessage =
      lastError.type === "offline"
        ? "📡 You are offline"
        : lastError.type === "timeout"
        ? "⏱️ Request timed out"
        : "❌ Server error";

    toast.error(toastMessage, {
      description: lastError.message,
      action: lastError.type !== "offline"
        ? { label: "Retry", onClick: () => resilientFetch(url, options) }
        : undefined,
    });
  }

  throw lastError!;
}
