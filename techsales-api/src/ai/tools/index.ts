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
import { getMyPipelineTool } from './getMyPipeline.tool.js';
import { searchLeadsTool } from './searchLeads.tool.js';
import { draftFollowUpEmailTool } from './draftFollowUpEmail.tool.js';
import { navigateToTool } from './navigateTo.tool.js';

export {
  searchPlansTool,
  getLeadDetailsTool,
  checkDrugCoverageTool,
  calcSavingsTool,
  comparePlansTool,
  getMemberPlanTool,
  getMyPipelineTool,
  searchLeadsTool,
  draftFollowUpEmailTool,
  navigateToTool,
};

export const tools = [
  searchPlansTool,
  getLeadDetailsTool,
  checkDrugCoverageTool,
  calcSavingsTool,
  comparePlansTool,
  getMemberPlanTool,
] as const;

/**
 * Phase 4 (M3) — Atlas's tool list. Vertical-slice subset (the demo-ready
 * essentials). Full 15-tool list ships in a follow-up. Order matches the
 * system-prompt mention order so models prefer reading top-to-bottom.
 */
export const atlasTools = [
  getMyPipelineTool,
  searchLeadsTool,
  getLeadDetailsTool,
  searchPlansTool,
  draftFollowUpEmailTool,
  navigateToTool,
] as const;
