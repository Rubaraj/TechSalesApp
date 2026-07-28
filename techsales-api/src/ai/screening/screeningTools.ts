/**
 * AI call screening — Deepgram Voice Agent function calling, backed by the
 * SAME Atlas tool singletons the chat copilot uses (`atlasTools`).
 *
 * Flow: Settings declares `agent.think.functions` (built here from each
 * tool's zod schema); mid-call Deepgram sends FunctionCallRequest; the
 * bridge calls `executeScreeningFunction`, which invokes the tool and
 * returns its JSON string as the FunctionCallResponse content.
 *
 * Security invariant: `userId` is STRIPPED from every schema sent to
 * Deepgram and injected server-side as the screening agent's userId —
 * the voice model never chooses whose data it reads (admin tools trust
 * that param).
 *
 * Excluded tools: FE-executed ones (their payloads only mean something to
 * the browser) and admin-gated ones (always fail for agents; run_qa_review
 * also spends LLM tokens).
 *
 * Extra function: `save_caller_details` — structured capture of the
 * caller's name/zip/phone/email/reason/callback, merged into the same
 * entity accumulator the auto-lead reads (far more reliable than regex
 * extraction from phone-quality transcripts).
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { atlasTools } from '../tools/index.js';
import { publish } from '../../services/callBus.js';
import { logger } from '../../config/logger.js';
import {
  ingestScreeningEntities,
  getLiveEntities,
  getCallerNumber,
} from '../agents/callAnalysisAgent.js';
import { appendScreeningNote, getScreening, claimScreeningNavigation } from './screeningState.js';
import { saveScreeningLead } from './liveLead.js';
import type { ExtractedEntities } from '../types/call.types.js';

export interface ScreeningToolContext {
  callSid: string;
  agentUserId: string;
  /** Persona toggle — drive the agent's browser + save the lead mid-call. */
  createLeadLive?: boolean;
}

/** Shape Deepgram expects in `agent.think.functions[]` (no `endpoint` ⇒
 *  client-side: DG sends FunctionCallRequest instead of calling a URL). */
export interface ScreeningFunctionDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const SAVE_CALLER_DETAILS = 'save_caller_details';
const SAVE_LEAD = 'save_lead';

/**
 * Ceiling on any one function call. Deepgram holds generation until we
 * reply, so this is really "how long the caller may hear silence" — keep it
 * shorter than a person's patience, not as long as a backend would allow.
 */
const SCREENING_FN_TIMEOUT_MS = 4_000;

const EXCLUDED_TOOLS = new Set([
  // FE-executed — their outputs are side-channel payloads only the browser
  // (AtlasContext) knows how to act on.
  'navigate_to',
  'start_call',
  'control_call',
  'fill_lead_form',
  // Admin-gated — self-check accessLevel via userId; always fail for the
  // screening agent. run_qa_review additionally spends LLM tokens.
  'get_team_calls',
  'get_qa_review',
  'run_qa_review',
]);

/** Minimal runtime surface of a LangChain StructuredTool — every Atlas tool
 *  returns a JSON string and self-catches errors into `{error}`. */
interface InvokableTool {
  name: string;
  description: string;
  schema: unknown;
  invoke: (args: Record<string, unknown>) => Promise<string>;
}

const TOOL_MAP: Map<string, InvokableTool> = new Map(
  (atlasTools as readonly unknown[])
    .map((t) => t as InvokableTool)
    .filter((t) => !EXCLUDED_TOOLS.has(t.name))
    .map((t) => [t.name, t]),
);

/** Short human labels for the live info cards the watching agent sees. */
const TOOL_LABELS: Record<string, string> = {
  get_my_pipeline: 'Checked your pipeline',
  search_leads: 'Searched leads',
  get_lead_details: 'Looked up a lead',
  search_plans: 'Searched plans',
  check_drug_coverage: 'Checked drug coverage',
  compare_plans: 'Compared plans',
  calc_savings: 'Calculated savings',
  get_enrollments: 'Checked enrollments',
  get_my_targets: 'Checked your targets',
  get_appointments: 'Checked your calendar',
  check_eligibility: 'Checked eligibility',
  find_pharmacies_near: 'Looked up pharmacies',
  propose_status_change: 'Proposed a status change',
  propose_lead_update: 'Proposed a lead update',
  append_lead_note: 'Added a lead note',
  [SAVE_CALLER_DETAILS]: 'Saved caller details',
  [SAVE_LEAD]: 'Saved the lead',
};

function toFunctionDef(tool: InvokableTool): ScreeningFunctionDef {
  // $refStrategy 'none' inlines everything — DG gets a flat JSON Schema.
  const json = zodToJsonSchema(tool.schema as ZodTypeAny, { $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
  const parameters: Record<string, unknown> = { ...json };
  delete parameters.$schema;
  const properties = { ...((parameters.properties as Record<string, unknown>) ?? {}) };
  delete properties.userId;
  parameters.properties = properties;
  const required = ((parameters.required as string[]) ?? []).filter((k) => k !== 'userId');
  if (required.length > 0) parameters.required = required;
  else delete parameters.required;
  return { name: tool.name, description: tool.description, parameters };
}

const SAVE_CALLER_DETAILS_DEF: ScreeningFunctionDef = {
  name: SAVE_CALLER_DETAILS,
  description:
    'Save details the caller reveals about themselves. Call this EVERY time you learn any of ' +
    'these — immediately, one call per new batch of details. This is what fills the agent’s ' +
    'screen while you talk, so completeness matters.',
  parameters: {
    type: 'object',
    properties: {
      firstName: { type: 'string', description: "Caller's first name" },
      lastName: { type: 'string', description: "Caller's last name" },
      dateOfBirth: {
        type: 'string',
        description: 'Date of birth as YYYY-MM-DD (convert what the caller says, e.g. "March 2nd 1955" → 1955-03-02)',
      },
      gender: { type: 'string', enum: ['Male', 'Female'], description: 'Gender for the file' },
      zipCode: { type: 'string', description: '5-digit zip code' },
      phone: {
        type: 'string',
        description: 'Callback phone number, only if the caller states one',
      },
      email: { type: 'string', description: 'Email address, only if the caller states one' },
      reason: { type: 'string', description: "Short summary of why they're calling" },
      callbackPreference: {
        type: 'string',
        description: 'When the caller wants the agent to call back (e.g. "tomorrow 10 AM")',
      },
    },
  },
};

const SAVE_LEAD_DEF: ScreeningFunctionDef = {
  name: SAVE_LEAD,
  description:
    "Save the caller's file. Call this once you have their first name, last name, date of " +
    'birth, gender, email and zip code. If the answer says fields are still missing, ask the ' +
    'caller for exactly those and call this again. Takes no arguments — it saves everything ' +
    'you captured with save_caller_details.',
  parameters: { type: 'object', properties: {} },
};

let cachedDefs: ScreeningFunctionDef[] | null = null;

/** All function defs sent to Deepgram in Settings. Built once — the
 *  schemas are static module singletons. */
export function buildScreeningFunctionDefs(): ScreeningFunctionDef[] {
  if (cachedDefs) return cachedDefs;
  cachedDefs = [...TOOL_MAP.values()].map(toFunctionDef);
  cachedDefs.push(SAVE_CALLER_DETAILS_DEF, SAVE_LEAD_DEF);
  return cachedDefs;
}

/** One-line args summary for the live info card (never the full payload). */
function summarizeArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([k, v]) => k !== 'userId' && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  const line = parts.join(' · ');
  return line.length > 160 ? line.slice(0, 157) + '…' : line || '(no arguments)';
}

function publishToolCard(ctx: ScreeningToolContext, name: string, args: Record<string, unknown>): void {
  publish(ctx.callSid, {
    type: 'actions',
    actions: [
      {
        type: 'show_info',
        topic: `ai-tool:${name}`,
        title: `AI assistant — ${TOOL_LABELS[name] ?? name}`,
        content: summarizeArgs(args),
      },
    ],
  });
}

function asCleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** ISO date, or null when the model sent something unparseable. */
function asIsoDate(value: unknown): string | null {
  const raw = asCleanString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function saveCallerDetails(args: Record<string, unknown>, ctx: ScreeningToolContext): string {
  const diff: Partial<ExtractedEntities> = {};
  const captured: string[] = [];

  const firstName = asCleanString(args.firstName);
  if (firstName) {
    diff.firstName = firstName;
    captured.push('firstName');
  }
  const lastName = asCleanString(args.lastName);
  if (lastName) {
    diff.lastName = lastName;
    captured.push('lastName');
  }
  const zipDigits = asCleanString(args.zipCode)?.replace(/\D/g, '') ?? '';
  if (/^\d{5}$/.test(zipDigits)) {
    diff.zipCode = zipDigits;
    captured.push('zipCode');
  }
  const phoneDigits = asCleanString(args.phone)?.replace(/\D/g, '') ?? '';
  if (phoneDigits.length >= 10) {
    diff.phone = phoneDigits;
    captured.push('phone');
  }
  const email = asCleanString(args.email);
  if (email && email.includes('@')) {
    diff.email = email;
    captured.push('email');
  }
  const dob = asIsoDate(args.dateOfBirth);
  if (dob) {
    diff.dateOfBirth = dob;
    captured.push('dateOfBirth');
  }
  const gender = asCleanString(args.gender)?.toLowerCase();
  if (gender === 'male' || gender === 'female') {
    diff.gender = gender === 'male' ? 'Male' : 'Female';
    captured.push('gender');
  }

  ingestScreeningEntities(ctx.callSid, diff);

  // First real capture of the call → open the lead form in the watching
  // agent's browser so they see it fill in as the assistant talks. The
  // phone prefill matches what CallLeadRoutingHost/PendingCaptureNudge use.
  if (ctx.createLeadLive && captured.length > 0 && claimScreeningNavigation(ctx.callSid)) {
    const phone = getCallerNumber(ctx.callSid) ?? '';
    publish(ctx.callSid, {
      type: 'navigate',
      route: phone ? `/leads/new?phone=${encodeURIComponent(phone)}` : '/leads/new',
      reason: 'AI assistant is taking the caller’s details',
    });
  }

  const reason = asCleanString(args.reason);
  if (reason) {
    appendScreeningNote(ctx.callSid, `Reason for calling (captured by AI): ${reason}`);
    captured.push('reason');
  }
  const callback = asCleanString(args.callbackPreference);
  if (callback) {
    appendScreeningNote(ctx.callSid, `Callback preference: ${callback}`);
    captured.push('callbackPreference');
  }

  return JSON.stringify({ saved: true, captured });
}

/**
 * Write the caller's file. Answers with the still-missing fields (spoken
 * labels) rather than an error when the intake isn't complete, so the
 * voice model knows exactly what to ask next.
 */
async function saveLead(ctx: ScreeningToolContext): Promise<string> {
  const entry = getScreening(ctx.callSid);
  const result = await saveScreeningLead({
    callSid: ctx.callSid,
    agentUserId: ctx.agentUserId,
    entities: getLiveEntities(ctx.callSid),
    ...(entry?.callerNumber ? { callerNumber: entry.callerNumber } : {}),
    ...(entry?.notes?.length ? { noteLines: entry.notes } : {}),
    ...(entry?.leadId ? { existingLeadId: entry.leadId } : {}),
  });
  return JSON.stringify(result);
}

/**
 * Execute one Deepgram function call. Never throws — errors come back as a
 * JSON `{error}` string the voice model can talk around. Every call also
 * publishes a live info card so the watching agent sees the lookup happen.
 */
export async function executeScreeningFunction(
  name: string,
  argsJson: string,
  ctx: ScreeningToolContext,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(argsJson || '{}');
    args = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: 'Malformed function arguments' });
  }

  try {
    publishToolCard(ctx, name, args);
    // Hard ceiling: Deepgram pauses generation until we answer, so a tool
    // that never settles leaves the caller listening to silence. Always
    // answer — a timed-out lookup is a result the assistant can talk around.
    return await Promise.race([
      runScreeningFunction(name, args, ctx),
      timeoutAfter(SCREENING_FN_TIMEOUT_MS, ctx, name),
    ]);
  } catch (err) {
    logger.error({ err, callSid: ctx.callSid, name }, 'screening: function execution failed');
    return JSON.stringify({ error: 'The lookup failed — continue without it.' });
  }
}

async function runScreeningFunction(
  name: string,
  args: Record<string, unknown>,
  ctx: ScreeningToolContext,
): Promise<string> {
  if (name === SAVE_CALLER_DETAILS) return saveCallerDetails(args, ctx);
  if (name === SAVE_LEAD) return await saveLead(ctx);
  const tool = TOOL_MAP.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown function: ${name}` });
  // Security: the voice model never picks the userId.
  return await tool.invoke({ ...args, userId: ctx.agentUserId });
}

/** Resolves (never rejects) with a spoken-safe result once the cap elapses. */
function timeoutAfter(ms: number, ctx: ScreeningToolContext, name: string): Promise<string> {
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      logger.warn({ callSid: ctx.callSid, name, ms }, 'screening: function timed out');
      resolve(
        JSON.stringify({
          error: 'That lookup did not come back in time. Continue without it.',
        }),
      );
    }, ms).unref?.();
  });
}
