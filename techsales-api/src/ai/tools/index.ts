/**
 * Barrel for LangChain tools the agents may call. Each tool exports a single
 * `DynamicStructuredTool` (or compatible) instance. Adding a new tool means
 * appending to `tools` here AND registering it in the agent that should be
 * able to call it.
 */
import { searchPlansTool } from './searchPlans.tool.js';
import { getLeadDetailsTool } from './getLeadDetails.tool.js';
import { checkDrugCoverageTool } from './checkDrugCoverage.tool.js';
import { calcSavingsTool } from './calcSavings.tool.js';
import { comparePlansTool } from './comparePlans.tool.js';
import { getMemberPlanTool } from './getMemberPlan.tool.js';

export {
  searchPlansTool,
  getLeadDetailsTool,
  checkDrugCoverageTool,
  calcSavingsTool,
  comparePlansTool,
  getMemberPlanTool,
};

export const tools = [
  searchPlansTool,
  getLeadDetailsTool,
  checkDrugCoverageTool,
  calcSavingsTool,
  comparePlansTool,
  getMemberPlanTool,
] as const;
