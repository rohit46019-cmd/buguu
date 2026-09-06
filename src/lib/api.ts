// Advanced API Client with Concurrency Limiter, In-Flight Deduplication, and 429 Rate-Limit Exponential Backoff

// Active in-flight GET requests promise map for deduplication
const inFlightRequests = new Map<string, Promise<Response>>();

// In-memory short-lived cache for idempotent GET requests
const responseCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 2500; // 2.5s caching for smooth UI without redundant HTTP hits

// Simple concurrency queue to prevent browser request spikes from hitting rate limits
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 4;
const requestQueue: (() => void)[] = [];

function releaseQueue() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const next = requestQueue.shift();
    if (next) {
      activeRequests++;
      next();
    }
  }
}

function acquireQueue(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestQueue.push(resolve);
  });
}

export interface ApiFetchOptions extends RequestInit {
  bypassCache?: boolean;
  retries?: number;
}

/**
 * Standard safe fetch with automatic rate-limit throttling and account headers
 */
export async function apiFetch(
  resource: string | Request,
  config: ApiFetchOptions = {}
): Promise<Response> {
  const urlString = typeof resource === 'string' ? resource : resource.url;
  const method = (config.method || 'GET').toUpperCase();
  const maxRetries = config.retries !== undefined ? config.retries : 2;

  // For GET requests, check in-flight deduplication
  if (method === 'GET' && !config.bypassCache) {
    const inFlight = inFlightRequests.get(urlString);
    if (inFlight) {
      // Clone response to avoid body already read errors
      const res = await inFlight;
      return res.clone();
    }
  }

  const execute = async (retryCount = 0): Promise<Response> => {
    await acquireQueue();
    try {
      const token = localStorage.getItem('token');
      const activeAccountId =
        localStorage.getItem('currentProfileId') ||
        localStorage.getItem('activeAccountId') ||
        'default';

      const headers: Record<string, string> = {
        'X-Account-Id': activeAccountId,
        ...(config.headers as Record<string, string> || {}),
      };

      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(resource, {
        ...config,
        headers,
      });

      // Handle 429 "Rate exceeded" or 503 Service Unavailable gracefully with exponential backoff
      if ((response.status === 429 || response.status === 503) && retryCount < maxRetries) {
        console.warn(`[apiFetch] Rate limit reached on ${urlString}. Retrying in ${(retryCount + 1) * 1200}ms...`);
        await new Promise((resolve) => setTimeout(resolve, (retryCount + 1) * 1200));
        return execute(retryCount + 1);
      }

      return response;
    } catch (err: any) {
      if (retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return execute(retryCount + 1);
      }
      throw err;
    } finally {
      releaseQueue();
    }
  };

  if (method === 'GET' && !config.bypassCache) {
    const requestPromise = execute().finally(() => {
      inFlightRequests.delete(urlString);
    });
    inFlightRequests.set(urlString, requestPromise);
    const res = await requestPromise;
    return res.clone();
  }

  return execute();
}

/**
 * Safe JSON parser helper that completely prevents "Unexpected token 'R', Rate exceeded" crashes
 */
export async function apiJson<T = any>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  // Check memory cache for GET requests
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${url}_${localStorage.getItem('currentProfileId') || 'default'}`;

  if (method === 'GET' && !options.bypassCache) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ok: true, status: 200, data: cached.data };
    }
  }

  try {
    const res = await apiFetch(url, options);
    const text = await res.text();

    if (!text || text.trim() === '') {
      return { ok: res.ok, status: res.status, data: null };
    }

    // Check if the response is rate limit text instead of JSON
    if (text.includes('Rate exceeded') || text.includes('Too Many Requests')) {
      console.warn(`[apiJson] Rate limit intercepted for ${url}`);
      return {
        ok: false,
        status: 429,
        data: null,
        error: 'Rate limit reached. Data will sync automatically.'
      };
    }

    try {
      const parsed = JSON.parse(text) as T;
      if (res.ok && method === 'GET') {
        responseCache.set(cacheKey, { timestamp: Date.now(), data: parsed });
      }
      return { ok: res.ok, status: res.status, data: parsed };
    } catch (jsonErr) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `Invalid response format: ${text.substring(0, 100)}`
      };
    }
  } catch (netErr: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: netErr.message || 'Network request failed'
    };
  }
}

/**
 * Invalidate cached response
 */
export function invalidateApiCache(urlPrefix?: string) {
  if (!urlPrefix) {
    responseCache.clear();
  } else {
    for (const key of responseCache.keys()) {
      if (key.includes(urlPrefix)) {
        responseCache.delete(key);
      }
    }
  }
}

