/** What each AI provider must offer Matra. */
export interface Backend {
  /** One request whose answer must match the JSON schema. Returns the raw JSON text. */
  json(req: { system: string; user: string; schema: object; signal?: AbortSignal }): Promise<string>;
  /** Streams plain text; onText receives the full text so far. Returns the final text. */
  stream(req: { system: string; user: string; signal?: AbortSignal }, onText: (soFar: string) => void): Promise<string>;
}

export class MatraAIError extends Error {
  constructor(
    message: string,
    readonly kind: "no_key" | "auth" | "rate" | "network" | "refusal" | "other",
  ) {
    super(message);
  }
}
