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

export function getAnthropicChatModel(opts: GetChatModelOptions = {}): BaseChatModel {
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.trim() === '') {
    throw new Error(
      'ANTHROPIC_API_KEY is missing. Set it in techsales-api/.env. ' +
        'Generate one at https://console.anthropic.com/settings/keys, ' +
        'or change AI_LLM_PROVIDER to "ollama" for the free local path.',
    );
  }
  const model = opts.premium ? env.AI_MODEL_PREMIUM : env.AI_MODEL_DEFAULT;
  return new ChatAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    model,
    temperature: opts.temperature ?? 0.2,
    clientOptions: {
      timeout: opts.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS,
    },
  });
}
