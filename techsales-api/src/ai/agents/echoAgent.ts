/**
 * Phase 1 — minimal LangGraph ReAct agent. One tool, one LLM call. Exists
 * purely to prove out the end-to-end pipeline plumbing (Express → guard →
 * agent → tool → Claude → audit handler → MongoDB row → JSON response).
 *
 * The agent is constructed per-request because it accepts a fresh
 * `AuditCallbackHandler` each time. Construction is cheap; the LangGraph
 * graph compile is a one-shot.
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getChatModel } from '../llm/chatModel.js';
import type { AuditCallbackHandler } from '../llm/callbacks.js';
import { env } from '../../config/env.js';
import { searchPlansTool } from '../tools/searchPlans.tool.js';

const echoTool = tool(
  async ({ text }) => {
    // The trivial Phase 1 tool — uppercase the input. Plenty for an end-to-end
    // smoke test of tool calling + audit-handler tool-trace capture.
    return JSON.stringify({ echoed: text.toUpperCase() });
  },
  {
    name: 'echo',
    description:
      'Echoes the given text back, transformed to uppercase. Use this exactly once per request.',
    schema: z.object({
      text: z.string().describe('The text to echo back in uppercase.'),
    }),
  },
);

const SYSTEM_PROMPT =
  'You are a test assistant for a healthcare sales POC. ' +
  'You may call `echo` or `search_plans` based on the request. ' +
  'For plan searches (anything mentioning plans, carriers, premiums, HMO/PPO, states, ' +
  'dental, drug coverage, etc.), call `search_plans` with the relevant filters and ' +
  'summarize the top results in 1-2 sentences. ' +
  'For other text, call `echo` exactly once and rephrase its output. ' +
  'Keep your final reply under 60 words.';

export interface RunEchoAgentInput {
  text: string;
  audit: AuditCallbackHandler;
}

export interface RunEchoAgentResult {
  output: string;
}

/**
 * One-shot wrapper around `createReactAgent.invoke`. Handles the prompt-flow
 * boilerplate (system + human messages) and extracts the final assistant
 * message text from the returned state.
 */
export async function runEchoAgent(input: RunEchoAgentInput): Promise<RunEchoAgentResult> {
  const llm = getChatModel({ premium: false });
  const agent = createReactAgent({
    llm,
    tools: [echoTool, searchPlansTool],
  });

  const state = await agent.invoke(
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input.text },
      ],
    },
    {
      callbacks: [input.audit],
      recursionLimit: env.AI_MAX_TOOL_STEPS * 2,
    },
  );

  // The agent returns `{ messages: [...] }`. The final assistant message is
  // the last entry; pull its text content for the response.
  const messages = (state as { messages: Array<{ content: unknown }> }).messages ?? [];
  const last = messages[messages.length - 1];
  const output = stringifyContent(last?.content);
  return { output };
}

const stringifyContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
};
