/**
 * Phase 4 — Drug Coverage Q&A agent.
 *
 * Pipeline:
 *   1) (Optional) If a `leadId` is provided, fetch the lead and use the
 *      tagged drugs as a fallback when `drugIds` is empty. We do NOT
 *      override an explicit caller-supplied list.
 *   2) Look up every (planId, drugId) pair in the synthetic formulary,
 *      collecting tier / priorAuth / stepTherapy / qtyLimit per row.
 *   3) Call Claude (no tools) to write a friendly narrative explaining the
 *      coverage. Banner the response as synthetic / pilot data.
 *   4) Audit row flushed via `AuditCallbackHandler.flush('drug-coverage', ...)`.
 *
 * Carrier names are not used here — the formulary table joins on plan/drug
 * ids only. Plan names appear when we ask Claude to describe each row.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { repos } from '../../repositories/registry.js';
import { logger } from '../../config/logger.js';
import type { AIDrugAnswer, AIDrugCoverageRow } from '../types.js';

interface FormularyRow {
  planId: string;
  drugId: string;
  tier: number;
  priorAuth: boolean;
  stepTherapy: boolean;
  qtyLimit: number;
}

let lookup: Map<string, FormularyRow> | null = null;

const here = path.dirname(fileURLToPath(import.meta.url));
const FORMULARY_PATH = path.resolve(here, '..', '..', '..', 'data', 'formulary-synthetic.json');

function loadFormulary(): Map<string, FormularyRow> {
  if (lookup) return lookup;
  const raw = readFileSync(FORMULARY_PATH, 'utf-8');
  const rows = JSON.parse(raw) as FormularyRow[];
  const map = new Map<string, FormularyRow>();
  for (const r of rows) {
    map.set(`${r.planId}::${r.drugId}`, r);
  }
  lookup = map;
  return map;
}

const InputSchema = z.object({
  leadId: z.string().min(1).optional(),
  planIds: z.array(z.string().min(1)).min(1),
  drugIds: z.array(z.string().min(1)).min(0).optional(),
  userId: z.string().min(1).optional(),
});

export type RunDrugCoverageInput = z.infer<typeof InputSchema>;

export interface RunDrugCoverageResult {
  result: AIDrugAnswer;
  interactionId?: string;
}

const SYSTEM_PROMPT = [
  'You are answering a Medicare drug-coverage question for a sales agent.',
  'You are given a JSON block listing each (plan, drug) pair with: isCovered,',
  'tier (1-5), priorAuth (boolean), stepTherapy (boolean), qtyLimit.',
  '',
  'Write a friendly, concrete narrative (≤200 words) that walks through the',
  'coverage plan-by-plan. Mention tier where covered, prior auth and step',
  'therapy explicitly when true, and call out any uncovered drugs.',
  '',
  'End with a short reminder that the formulary feed is pilot/synthetic data',
  'and should be verified against the official formulary.',
  '',
  'Plan ids are opaque; drug ids may be opaque too. Use them as-is. Do not',
  'invent brand names or carrier names.',
].join('\n');

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join('')
      .trim();
  }
  return '';
}

export async function runDrugCoverageAgent(
  input: RunDrugCoverageInput,
): Promise<RunDrugCoverageResult> {
  const validated = InputSchema.parse(input);
  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({ premium: false });

  // Resolve drugIds — fall back to the lead's tagged drugs when none supplied.
  let drugIds = validated.drugIds ?? [];
  if (drugIds.length === 0 && validated.leadId) {
    try {
      const lead = await repos.lead.findById(validated.leadId);
      if (lead && Array.isArray(lead.taggedDrugs)) {
        drugIds = lead.taggedDrugs
          .map((d: { drugId?: string }) => (typeof d.drugId === 'string' ? d.drugId : ''))
          .filter((id: string) => id.length > 0);
      }
    } catch (err) {
      logger.warn(
        { err, leadId: validated.leadId },
        'drugCoverageAgent: failed to fetch lead for drug fallback',
      );
    }
  }

  if (drugIds.length === 0) {
    const interactionId = await auditCb.flush({
      kind: 'drug-coverage',
      ...(validated.userId ? { userId: validated.userId } : {}),
      input: { leadId: validated.leadId, planIds: validated.planIds, drugIds },
      output: {},
      error: 'No drug ids supplied (and lead has no tagged drugs)',
    });
    void interactionId;
    throw new Error(
      'No drug ids supplied. Provide drugIds explicitly or a leadId with tagged drugs.',
    );
  }

  // Build coverage rows.
  let coverage: AIDrugCoverageRow[] = [];
  try {
    const map = loadFormulary();
    for (const planId of validated.planIds) {
      for (const drugId of drugIds) {
        const row = map.get(`${planId}::${drugId}`);
        if (row) {
          coverage.push({
            planId,
            drugId,
            isCovered: true,
            tier: row.tier,
            priorAuth: row.priorAuth,
            stepTherapy: row.stepTherapy,
            qtyLimit: row.qtyLimit,
          });
        } else {
          coverage.push({ planId, drugId, isCovered: false });
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'drugCoverageAgent: formulary load failed');
    throw err;
  }

  // Narrative.
  let narrative = '';
  let agentError: string | undefined;
  try {
    const userPrompt = `Coverage matrix:\n${JSON.stringify(coverage, null, 2)}\n\nWrite the narrative now.`;
    const res = await llm.invoke(
      [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userPrompt)],
      { callbacks: [auditCb] },
    );
    narrative = stringifyContent(res.content);
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    logger.error({ err, planIds: validated.planIds }, 'drugCoverageAgent: narrative failed');
  }

  if (!narrative) {
    const interactionId = await auditCb.flush({
      kind: 'drug-coverage',
      ...(validated.userId ? { userId: validated.userId } : {}),
      input: { leadId: validated.leadId, planIds: validated.planIds, drugIds },
      output: { coverage },
      error: agentError ?? 'Empty narrative returned',
    });
    void interactionId;
    throw new Error(agentError ?? 'Drug-coverage agent returned an empty narrative.');
  }

  const result: AIDrugAnswer = {
    planIds: validated.planIds,
    drugIds,
    coverage,
    narrative,
    isSyntheticData: true,
    generatedAt: new Date().toISOString(),
  };

  const interactionId = await auditCb.flush({
    kind: 'drug-coverage',
    ...(validated.userId ? { userId: validated.userId } : {}),
    input: { leadId: validated.leadId, planIds: validated.planIds, drugIds },
    output: result,
  });

  return {
    result,
    ...(interactionId ? { interactionId } : {}),
  };
}
