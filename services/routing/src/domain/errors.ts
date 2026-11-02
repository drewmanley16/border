export type ErrorDetails = Record<string, unknown>;

/** An expected failure, safe to show to API clients. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
