export function getApiBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(raw);
      const browserHost = window.location.hostname;
      if (
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        browserHost &&
        browserHost !== 'localhost' &&
        browserHost !== '127.0.0.1'
      ) {
        parsed.hostname = browserHost;
        return parsed.toString().replace(/\/$/, '');
      }
    } catch {
      // Keep raw URL
    }
  }
  return raw;
}

export const API_BASE_URL = getApiBaseUrl();

export class ApiError extends Error {
  status?: number;
  data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
  timeoutMs?: number;
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Avoid duplicating /api if API_BASE_URL already contains /api
  const finalEndpoint = baseUrl.endsWith('/api') && cleanEndpoint.startsWith('/api/')
    ? cleanEndpoint.slice(4)
    : cleanEndpoint;
  let url = `${baseUrl}${finalEndpoint}`;

  const { params, timeoutMs = 30000, signal: externalSignal, headers: optionHeaders, ...restOptions } = options;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const defaultHeaders: HeadersInit = {};

  // Only set Content-Type if it's not a GET request
  if (restOptions.method && restOptions.method.toUpperCase() !== 'GET') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  const config: RequestInit = {
    ...restOptions,
    signal: controller.signal,
    headers: {
      ...defaultHeaders,
      ...optionHeaders,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    if (didTimeout) {
      throw new ApiError(
        `Délai d'attente dépassé (${Math.round(timeoutMs / 1000)}s) pour ${finalEndpoint}. Le serveur met trop de temps à répondre.`,
        408,
      );
    }
    if (externalSignal?.aborted) {
      throw err;
    }
    throw new ApiError(
      `Impossible de contacter le serveur API (${baseUrl}). Vérifiez que le backend est démarré et accessible.`,
      0,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      data?.message || data?.error || `Erreur serveur (${response.status})`,
      response.status,
      data
    );
  }

  return data as T;
}
