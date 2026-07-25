/**
 * Gap 1 — `control_call`. Hang up / mute / unmute the agent's CURRENT call.
 * Returns a `{callControl}` payload the SSE bridge marshals into a
 * `call_control` event; the FE executes it via the call runtime. The
 * explicit chat request is the consent — executes in both autonomy modes.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getActiveCalls } from '../../services/callBus.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The requesting agent's userId. Required."),
  action: z
    .enum(['hangup', 'mute', 'unmute'])
    .describe('What to do with the current call.'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const controlCallTool = tool(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (input: ToolInput): Promise<string> => {
    const hasLiveCall = getActiveCalls().some((c) => c.userId === input.userId);
    if (!hasLiveCall) {
      return JSON.stringify({
        error: 'No active call found for you right now — nothing to control.',
      });
    }
    return JSON.stringify({
      callControl: { action: input.action },
      note: `Sent ${input.action} to the dialer.`,
    });
  },
  {
    name: 'control_call',
    description:
      "Control the agent's CURRENT live call: hangup, mute, or unmute their microphone. " +
      'Only use when the agent explicitly asks (e.g. "mute me", "end the call"). ' +
      'Errors when no call is active.',
    schema: inputSchema,
  },
);
