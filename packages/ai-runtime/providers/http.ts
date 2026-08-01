import { ProviderError, kindFromStatus } from "../errors";

/**
 * Shared HTTP error normalizer for vendor adapters. Both the OpenAI- and
 * Anthropic-shaped APIs report failures as `{ error: { message, ... } }`,
 * so one parser serves every adapter — adapters never hand-roll their own.
 */
export async function httpError(res: Response, providerId: string): Promise<ProviderError> {
  let detail = "";
  try {
    const body = await res.json();
    detail =
      (body as { error?: { message?: string } })?.error?.message ??
      JSON.stringify(body).slice(0, 300);
  } catch {
    detail = res.statusText;
  }
  return new ProviderError(
    kindFromStatus(res.status),
    providerId,
    `${res.status} ${detail}`,
    { status: res.status }
  );
}
