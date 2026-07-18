/**
 * Anthropic provider — wraps `ChatAnthropic` from `@langchain/anthropic`.
 * Only used when `AI_LLM_PROVIDER='anthropic'`. Lazy-asserts the key so the
 * server still boots and `/api/health` reports correctly when the key is
 * missing.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { env } from '../../../config/env.js';
import type { GetChatModelOptions } from '../chatModel.js';

/**
 * Gateway streaming-usage fix (OpenRouter et al.).
 *
 * Anthropic's native stream reports input tokens in `message_start`; gateways
 * like OpenRouter send `input_tokens: 0` there and only report real usage
 * (input + cache counts) in the final `message_delta`. `@langchain/anthropic`
 * hardcodes `input_tokens: 0` when mapping `message_delta` (it trusts the
 * native contract), so streamed runs through a gateway audit as 0 input
 * tokens — undercounting the daily token caps.
 *
 * This fetch wrapper watches the SSE stream and, when a `message_delta`
 * arrives carrying `usage.input_tokens > 0`, appends a synthetic
 * `message_start` event whose usage holds those input/cache tokens (and
 * `output_tokens: 0` to avoid double-counting). LangChain's chunk
 * aggregation sums usage across chunks, so totals come out right without
 * touching the library. Injected at most once per stream; pass-through is
 * byte-identical otherwise.
 */
function createGatewayUsageFixFetch(): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.body || !contentType.includes('text/event-stream')) return res;

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    let injected = false;

    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        if (injected) return;
        buffer += decoder.decode(chunk, { stream: true });
        let boundary: number;
        while (!injected && (boundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const dataLine = block
            .split('\n')
            .find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(5).trim()) as {
              type?: string;
              usage?: Record<string, unknown>;
            };
            const usage = evt.usage;
            if (evt.type === 'message_delta' && usage && Number(usage.input_tokens) > 0) {
              const synthetic = {
                type: 'message_start',
                message: {
                  content: [],
                  usage: {
                    input_tokens: Number(usage.input_tokens),
                    output_tokens: 0,
                    cache_creation_input_tokens: Number(usage.cache_creation_input_tokens) || 0,
                    cache_read_input_tokens: Number(usage.cache_read_input_tokens) || 0,
                  },
                },
              };
              controller.enqueue(
                encoder.encode(`event: message_start\ndata: ${JSON.stringify(synthetic)}\n\n`),
              );
              injected = true;
            }
          } catch {
            // Non-JSON data line (comment/keepalive) — pass through untouched.
          }
        }
      },
    });

    return new Response(res.body.pipeThrough(transform), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
}

export function getAnthropicChatModel(opts: GetChatModelOptions = {}): BaseChatModel {
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.trim() === '') {
    throw new Error(
      'ANTHROPIC_API_KEY is missing. Set it in techsales-api/.env. ' +
        'Generate one at https://console.anthropic.com/settings/keys, ' +
        'or change AI_LLM_PROVIDER to "ollama" for the free local path.',
    );
  }
  const model =
    opts.modelOverride ?? (opts.premium ? env.AI_MODEL_PREMIUM : env.AI_MODEL_DEFAULT);
  return new ChatAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    model,
    temperature: opts.temperature ?? 0.2,
    // Anthropic-compatible gateway support (OpenRouter): the SDK appends
    // /v1/messages, so the override is the bare host + /api prefix.
    ...(env.ANTHROPIC_BASE_URL ? { anthropicApiUrl: env.ANTHROPIC_BASE_URL } : {}),
    clientOptions: {
      timeout: opts.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS,
      // Gateways report streaming input tokens in message_delta, which
      // LangChain discards — see createGatewayUsageFixFetch. Direct
      // api.anthropic.com traffic keeps the default fetch.
      ...(env.ANTHROPIC_BASE_URL ? { fetch: createGatewayUsageFixFetch() } : {}),
    },
  });
}
