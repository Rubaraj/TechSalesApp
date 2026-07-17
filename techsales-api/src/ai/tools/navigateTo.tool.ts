/**
 * Phase 4 (M3) — `navigate_to`. Atlas can drive the FE's router. Returns a
 * navigation payload the SSE bridge marshals into a `navigate` event the FE
 * routes by autonomy mode (Silent: drop; Assist: render NavigationCard;
 * Auto Pilot: actually navigate + show NavToast with Undo).
 *
 * Route allowlist: the tool refuses any URL that doesn't match a known FE
 * route pattern. Atlas can only navigate where the agent can.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const inputSchema = z.object({
  route: z
    .string()
    .min(1)
    .describe(
      'Frontend route to open. Must match an allowed pattern: ' +
        '"/sales" (dashboard) | "/insights" | "/leads" | "/leads/new" | "/leads/<leadId>" | ' +
        '"/plans" | "/plans?zip=<zip>" | "/plans/<planId>" | "/plans/compare" | ' +
        '"/pharmacies" | "/drugs" | "/providers" | "/recommendations" | "/yoy".',
    ),
  reason: z
    .string()
    .min(1)
    .max(120)
    .describe(
      'One short sentence the FE shows on the toast / card explaining the navigation.',
    ),
});

type ToolInput = z.infer<typeof inputSchema>;

// Must stay in sync with the agent-facing routes registered in
// techsales-app/src/App.tsx. (`/dashboard` was allowlisted pre-Phase A but
// never existed in the router — the real dashboard routes are /sales and
// /insights.)
const ALLOWED_ROUTE_PATTERNS = [
  /^\/sales$/,
  /^\/insights$/,
  /^\/leads$/,
  /^\/leads\/new$/,
  /^\/leads\/[A-Za-z0-9-]+$/,
  /^\/plans(\?.*)?$/,
  /^\/plans\/[A-Za-z0-9-]+$/,
  /^\/plans\/compare$/,
  /^\/pharmacies$/,
  /^\/drugs$/,
  /^\/providers$/,
  /^\/recommendations$/,
  /^\/yoy$/,
];

function isAllowed(route: string): boolean {
  return ALLOWED_ROUTE_PATTERNS.some((re) => re.test(route));
}

export const navigateToTool = tool(
  async (input: ToolInput): Promise<string> => {
    if (!isAllowed(input.route)) {
      return JSON.stringify({
        error: 'route not in allowlist',
        attempted: input.route,
        allowed: [
          '/sales',
          '/insights',
          '/leads',
          '/leads/new',
          '/leads/<leadId>',
          '/plans',
          '/plans?zip=<zip>',
          '/plans/<planId>',
          '/plans/compare',
          '/pharmacies',
          '/drugs',
          '/providers',
          '/recommendations',
          '/yoy',
        ],
      });
    }
    // Payload marshalled by the agent into a `navigate` SSE event.
    return JSON.stringify({
      navigate: { route: input.route, reason: input.reason },
    });
  },
  {
    name: 'navigate_to',
    description:
      'Drive the FE to a different screen. Use when the agent\'s next step is on another page ' +
      '(e.g. opening a lead\'s detail, jumping to the plans browser, or starting a new lead form). ' +
      'The FE\'s autonomy mode decides whether to auto-navigate (Auto Pilot) or render a ' +
      'click-to-go card (Assist). Always provide a brief reason — agents see it on the card / toast.',
    schema: inputSchema,
  },
);
