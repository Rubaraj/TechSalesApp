/**
 * `calc_savings` — pure-math savings + commission calculator. Mirrors
 * `techsales-app/src/utils/costSavingsUtils.ts` so the agent's numbers
 * match the FE's existing dashboards.
 *
 * Rates (per enrollment, monthly):
 *   - MAPD / MA: 15% agent / 75% carrier; $20 saved
 *   - PDP:       15% agent / 75% carrier; $18 saved
 *   - Medsup:    20% agent / 80% carrier; 20% of premium saved
 *   - ANC:       20% agent / 80% carrier; 20% of premium saved
 *
 * Annual cost is `premium * 12` (no LIS/Medicaid offset applied — those
 * factors live in a future enrichment).
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const PlanInput = z.object({
  planId: z.string().min(1),
  premium: z.number().nonnegative(),
  productType: z
    .string()
    .describe('Product code: MAPD | MA | PDP | Medsup | ANC. Other values are treated as zero.'),
});

const inputSchema = z.object({
  plans: z.array(PlanInput).min(1).max(50),
  medicaidEligible: z.boolean().optional(),
  lisLevel: z.number().min(0).max(4).optional(),
});

type ToolInput = z.infer<typeof inputSchema>;

interface SavingsRow {
  planId: string;
  agentCommission: number;
  carrierRevenue: number;
  costSavings: number;
  estimatedAnnualCost: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function compute(plan: z.infer<typeof PlanInput>): SavingsRow {
  const { planId, premium, productType } = plan;
  let agentCommission = 0;
  let carrierRevenue = 0;
  let costSavings = 0;
  switch (productType) {
    case 'MAPD':
    case 'MA':
      agentCommission = premium * 0.15;
      carrierRevenue = premium * 0.75;
      costSavings = 20;
      break;
    case 'PDP':
      agentCommission = premium * 0.15;
      carrierRevenue = premium * 0.75;
      costSavings = 18;
      break;
    case 'Medsup':
      agentCommission = premium * 0.20;
      carrierRevenue = premium * 0.80;
      costSavings = premium * 0.20;
      break;
    case 'ANC':
      agentCommission = premium * 0.20;
      carrierRevenue = premium * 0.80;
      costSavings = premium * 0.20;
      break;
    default:
      // Unknown product type — return zeros, matches FE behavior.
      break;
  }
  return {
    planId,
    agentCommission: round2(agentCommission),
    carrierRevenue: round2(carrierRevenue),
    costSavings: round2(costSavings),
    estimatedAnnualCost: round2(premium * 12),
  };
}

export const calcSavingsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      // medicaidEligible / lisLevel are accepted for downstream extension but
      // do not currently shift the math — the FE's costSavingsUtils doesn't
      // factor them in either.
      void input.medicaidEligible;
      void input.lisLevel;
      const rows = input.plans.map(compute);
      // Envelope (rich-chat upgrade): object wrapper for the FE savings card.
      return JSON.stringify({ rows });
    } catch (err) {
      return JSON.stringify({ ok: false, error: String(err) });
    }
  },
  {
    name: 'calc_savings',
    description:
      'Compute monthly agent commission, carrier revenue, agent savings, and ' +
      'estimated annual cost (premium*12) for a list of {planId, premium, productType} ' +
      'records. Pure math — no I/O. productType is one of: MAPD | MA | PDP | Medsup | ANC.',
    schema: inputSchema,
  },
);
