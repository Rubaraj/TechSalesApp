/**
 * Maps raw LLM/provider failures to user-friendly copy. The raw error is
 * always logged server-side by the call sites — users never see stack
 * traces, provider JSON, or LangChain troubleshooting URLs.
 *
 * Gap 7 — `classifyLlmError` exposes the CATEGORY (not just the copy) so
 * llmHealth can track degradation state from the same substring logic.
 */

export type LlmErrorCategory = 'auth' | 'rate_limit' | 'timeout' | 'stub' | 'unknown';

export function classifyLlmError(err: unknown): LlmErrorCategory {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Provider auth failures — for this deployment that means the OpenRouter
  // key's backing VM is off ("User not found") or the key is invalid.
  // 'api key is missing' / 'anthropic_api_key' cover getChatModel()
  // construction throws (no invoke ever happens).
  if (
    lower.includes('user not found') ||
    lower.includes('model_authentication') ||
    lower.includes('401') ||
    lower.includes('invalid api key') ||
    lower.includes('api key is missing') ||
    lower.includes('anthropic_api_key') ||
    lower.includes('authentication')
  ) {
    return 'auth';
  }

  // Provider overload / rate limits.
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('overloaded')) {
    return 'rate_limit';
  }

  // Timeouts.
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return 'timeout';
  }

  // Stub provider (AI intentionally not configured).
  if (lower.includes('stub')) {
    return 'stub';
  }

  return 'unknown';
}

export function friendlyLlmError(err: unknown): string {
  switch (classifyLlmError(err)) {
    case 'auth':
      return (
        'The AI assistant is temporarily unavailable. ' +
        'Live transcript and compliance monitoring are not affected. ' +
        'Please try again in a few minutes.'
      );
    case 'rate_limit':
      return 'The AI assistant is busy right now — please try again in a moment.';
    case 'timeout':
      return 'The AI assistant took too long to respond — please try again.';
    case 'stub':
      return 'The AI assistant is not enabled on this server.';
    case 'unknown':
      return 'The AI assistant hit an unexpected error — please try again.';
  }
}
