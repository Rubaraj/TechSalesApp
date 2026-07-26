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
import { proposeLeadUpdateTool } from './proposeLeadUpdate.tool.js';
import { appendLeadNoteTool } from './appendLeadNote.tool.js';
import { navigateToTool } from './navigateTo.tool.js';
import { getEnrollmentsTool } from './getEnrollments.tool.js';
import { runQaReviewTool } from './runQaReview.tool.js';
import { getTeamCallsTool } from './getTeamCalls.tool.js';
import { getQaReviewTool } from './getQaReview.tool.js';
import { getMyTargetsTool } from './getMyTargets.tool.js';
import { getAppointmentsTool } from './getAppointments.tool.js';
import { checkEligibilityTool } from './checkEligibility.tool.js';
import { findPharmaciesNearTool } from './findPharmaciesNear.tool.js';
import { startCallTool } from './startCall.tool.js';
import { controlCallTool } from './controlCall.tool.js';
import { fillLeadFormTool } from './fillLeadForm.tool.js';

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
  proposeLeadUpdateTool,
  appendLeadNoteTool,
  navigateToTool,
  runQaReviewTool,
  getTeamCallsTool,
  getQaReviewTool,
  getEnrollmentsTool,
  getMyTargetsTool,
  getAppointmentsTool,
  checkEligibilityTool,
  findPharmaciesNearTool,
  startCallTool,
  controlCallTool,
  fillLeadFormTool,
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
  // Phase C — book & schedule reads.
  getEnrollmentsTool,
  getMyTargetsTool,
  getAppointmentsTool,
  checkEligibilityTool,
  findPharmaciesNearTool,
  // draftFollowUpEmailTool deregistered per product review 2026-07-17 —
  // the mock-send flow wasn't useful. Tool file + 'email' executor kept
  // for a future real-SMTP re-enable.
  proposeStatusChangeTool,
  proposeLeadUpdateTool,
  appendLeadNoteTool,
  // QA/Supervisor pipelines — admin-only (each tool self-checks accessLevel).
  getTeamCallsTool,
  getQaReviewTool,
  runQaReviewTool,
  navigateToTool,
  // Gap 1 — dialer control (dial via lead/phone; hangup/mute the live call).
  startCallTool,
  controlCallTool,
  // Gap 4 — stage values into the lead form UI (agent reviews + saves).
  fillLeadFormTool,
] as const;
