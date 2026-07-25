/**
 * Maps raw LLM/provider failures to user-friendly copy. The raw error is
 * always logged server-side by the call sites — users never see stack
 * traces, provider JSON, or LangChain troubleshooting URLs.
 */

export function friendlyLlmError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Provider auth failures — for this deployment that means the OpenRouter
  // key's backing VM is off ("User not found") or the key is invalid.
  if (
    lower.includes('user not found') ||
    lower.includes('model_authentication') ||
    lower.includes('401') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication')
  ) {
    return (
      'The AI assistant is temporarily unavailable. ' +
      'Live transcript and compliance monitoring are not affected. ' +
      'Please try again in a few minutes.'
    );
  }

  // Provider overload / rate limits.
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('overloaded')) {
    return 'The AI assistant is busy right now — please try again in a moment.';
  }

  // Timeouts.
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return 'The AI assistant took too long to respond — please try again.';
  }

  // Stub provider (AI intentionally not configured).
  if (lower.includes('stub')) {
    return 'The AI assistant is not enabled on this server.';
  }

  return 'The AI assistant hit an unexpected error — please try again.';
}
