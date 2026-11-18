/** What each AI provider must offer Matra. */
export interface Backend {
  /** One request whose answer must match the JSON schema. Returns the raw JSON text. */
  json(req: { system: string; user: string; schema: object; signal?: AbortSignal }): Promise<string>;
  /** Streams plain text; onText receives the full text so far. Returns the final text. */
  stream(req: { system: string; user: string; signal?: AbortSignal }, onText: (soFar: string) => void): Promise<string>;
  /** A request that may search the web first. Returns the answer and the pages it used. */
  search(req: { system: string; user: string; signal?: AbortSignal }): Promise<SearchAnswer>;
}

export interface WebSource {
  title: string;
  url: string;
}

export interface SearchAnswer {
  text: string;
  sources: WebSource[];
}

export class MatraAIError extends Error {
  constructor(
    message: string,
    readonly kind: "no_key" | "auth" | "rate" | "network" | "refusal" | "other",
  ) {
    super(message);
  }
}
