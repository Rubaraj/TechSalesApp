/**
 * Ollama provider — wraps `ChatOllama` from `@langchain/ollama`. No API key
 * required; talks to a locally-running Ollama instance on `OLLAMA_URL`. The
 * underlying chat model (e.g. `qwen2.5:7b`) must be pulled into Ollama
 * separately:  `docker exec ollama ollama pull qwen2.5:7b`.
 *
 * Tool calling reliability is meaningfully behind Claude on multi-step ReAct
 * chains; the agent's per-tool try/catch + zod-retry-once-on-parse-fail are
 * load-bearing here.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { env } from '../../../config/env.js';
import type { GetChatModelOptions } from '../chatModel.js';

export function getOllamaChatModel(opts: GetChatModelOptions = {}): BaseChatModel {
  const model =
    opts.modelOverride ?? (opts.premium ? env.OLLAMA_LLM_PREMIUM_MODEL : env.OLLAMA_LLM_MODEL);
  return new ChatOllama({
    baseUrl: env.OLLAMA_URL,
    model,
    temperature: opts.temperature ?? 0.2,
    // Note: ChatOllama doesn't expose a per-request timeout knob. The agent's
    // recursionLimit + AI_REQUEST_TIMEOUT_MS at the controller / SSE layer
    // are where we bound runtime.
  });
}
