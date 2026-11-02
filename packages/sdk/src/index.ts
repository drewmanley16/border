import type { CompareRoutesRequest, CompareRoutesResponse, Corridor, CorridorFilter, Health, Provider, RouteDetail, RouteVisualization } from "./types.js";

export type * from "./types.js";

export interface StableFlowOptions {
  /** Required for `routes.*`. Catalog and health calls work without it. */
  apiKey?: string;
  /** Defaults to http://localhost:4000. */
  baseUrl?: string;
  /** Per-attempt timeout. Defaults to 10 seconds. */
  timeoutMs?: number;
  /** Retries for failed GET requests. Defaults to 2. */
  retries?: number;
  fetch?: typeof globalThis.fetch;
}

export interface CompareOptions {
  /** Sandbox only: a seeded scenario such as "base_outage". */
  scenario?: string;
}

/** An error response from the API, or a failure to reach it. */
export class StableFlowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "StableFlowError";
  }
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export class StableFlow {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetcher: typeof globalThis.fetch;

  readonly routes = {
    compare: (request: CompareRoutesRequest, options: CompareOptions = {}) =>
      this.request<CompareRoutesResponse>("POST", "/v1/routes/compare", {
        body: request,
        headers: options.scenario ? { "x-simulation-scenario": options.scenario } : {},
      }),
    get: (routeId: string) => this.request<RouteDetail>("GET", `/v1/routes/${encodeURIComponent(routeId)}`),
    visualization: (routeId: string) =>
      this.request<RouteVisualization>("GET", `/v1/routes/${encodeURIComponent(routeId)}/visualization`),
  };

  readonly corridors = {
    list: async (filter: CorridorFilter = {}) => {
      const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value !== undefined)).toString();
      const { corridors } = await this.request<{ corridors: Corridor[] }>("GET", `/v1/corridors${query ? `?${query}` : ""}`);
      return corridors;
    },
  };

  readonly providers = {
    list: async () => (await this.request<{ providers: Provider[] }>("GET", "/v1/providers")).providers,
  };

  constructor(options: StableFlowOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "http://localhost:4000").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  health(): Promise<Health> {
    return this.request<Health>("GET", "/v1/health");
  }

  private async request<T>(method: "GET" | "POST", path: string, options: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    // Only reads repeat. A compare creates a quote, so it's never resent.
    const attempts = method === "GET" ? this.retries + 1 : 1;
    let failure: StableFlowError | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 2)));
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          method,
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            accept: "application/json",
            ...(options.body === undefined ? {} : { "content-type": "application/json" }),
            ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
            ...options.headers,
          },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        if (response.ok) return (await response.json()) as T;

        const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; requestId?: string; details?: unknown } } | null;
        const error = payload?.error;
        failure = new StableFlowError(error?.message ?? `Request failed with status ${response.status}`, response.status, error?.code ?? "http_error", error?.requestId, error?.details);
        if (!RETRYABLE.has(response.status)) throw failure;
      } catch (error) {
        if (error instanceof StableFlowError && !RETRYABLE.has(error.status)) throw error;
        failure = error instanceof StableFlowError ? error : new StableFlowError(error instanceof Error ? error.message : "Network request failed", 0, "network_error");
      }
    }
    throw failure!;
  }
}
