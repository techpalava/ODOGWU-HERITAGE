export type HttpRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type HttpResponse = {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): HttpResponse;
  json(body: unknown): unknown;
};
