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
import { proposeStatusChangeTool } from './proposeStatusChange.tool.js';
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
  proposeStatusChangeTool,
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
 * Phase 4 (M3) + Phase A — Atlas's tool list. Order matches the
 * system-prompt mention order so models prefer reading top-to-bottom.
 *
 * NOTE: this list is part of the prompt-cache prefix — adding/removing/
 * reordering tools invalidates the cache for in-flight sessions (acceptable
 * on deploy; never vary the list per-request).
 */
export const atlasTools = [
  getMyPipelineTool,
  searchLeadsTool,
  getLeadDetailsTool,
  searchPlansTool,
  checkDrugCoverageTool,
  comparePlansTool,
  calcSavingsTool,
  draftFollowUpEmailTool,
  proposeStatusChangeTool,
  navigateToTool,
] as const;
