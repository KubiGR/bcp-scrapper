/** One GET against BCP's web API, e.g. { path: '/v1/events/X/players', query: { placings: 'true' } }. */
export interface BcpRequest {
  path: string;
  query?: Record<string, string | number | undefined>;
}

/** Anything that can answer a BcpRequest with parsed JSON: the real HTTP client or fixture files. */
export interface BcpTransport {
  get(request: BcpRequest): Promise<unknown>;
}

export interface AccessTokenProvider {
  /** The current access token, refreshing first if it is about to expire. Null = anonymous. */
  getAccessToken(): Promise<string | null>;
  /** Forces a refresh, e.g. after BCP answered 401. */
  refresh(): Promise<void>;
}
