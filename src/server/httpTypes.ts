export type HttpRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  /**
   * Exact request bytes. Stripe webhook verification must use this value,
   * never a re-serialized `body`.
   */
  rawBody?: string | Uint8Array;
};

export type HttpResponse = {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): HttpResponse;
  json(body: unknown): unknown;
};
