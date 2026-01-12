import type { Enrollment } from '../types/enrollment';
import type { Plan } from '../types/plan';

/**
 * Calculate monthly cost savings based on enrollment data
 * Formula:
 * - MAPD: $20 per enrollment
 * - PDP: $18 per enrollment
 * - MEDSUP and ANC (ancillary): 20% of premium
 */
export function calculateMonthlyCostSavings(
  enrollments: Enrollment[],
  plans: Plan[]
): number {
  let totalSavings = 0;

  // Create a map of planId to Plan for quick lookup
  const planMap = new Map<string, Plan>();
  plans.forEach(plan => {
    planMap.set(plan.planId, plan);
  });

  enrollments.forEach(enrollment => {
    const plan = planMap.get(enrollment.planId);
    
    if (!plan) {
      // If plan not found, skip this enrollment
      return;
    }

    const product = plan.product;
    const premium = enrollment.premium || 0;

    switch (product) {
      case 'MAPD':
      case 'MA': // Medicare Advantage (same as MAPD)
        totalSavings += 20;
        break;
      
      case 'PDP':
        totalSavings += 18;
        break;
      
      case 'Medsup':
      case 'ANC': // Ancillary products
        // 20% of premium
        totalSavings += premium * 0.20;
        break;
      
      default:
        // Unknown product type, skip
        break;
    }
  });

  return Math.round(totalSavings * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate cost savings breakdown by product type
 */
export interface CostSavingsBreakdown {
  mapd: { count: number; savings: number; rate: number };
  pdp: { count: number; savings: number; rate: number };
  medsup: { count: number; savings: number; rate: string };
  anc: { count: number; savings: number; rate: string };
  total: number;
}

export function calculateCostSavingsBreakdown(
  enrollments: Enrollment[],
  plans: Plan[]
): CostSavingsBreakdown {
  const breakdown: CostSavingsBreakdown = {
    mapd: { count: 0, savings: 0, rate: 20 },
    pdp: { count: 0, savings: 0, rate: 18 },
    medsup: { count: 0, savings: 0, rate: '20%' },
    anc: { count: 0, savings: 0, rate: '20%' },
    total: 0,
  };

  // Create a map of planId to Plan for quick lookup
  const planMap = new Map<string, Plan>();
  plans.forEach(plan => {
    planMap.set(plan.planId, plan);
  });

  enrollments.forEach(enrollment => {
    const plan = planMap.get(enrollment.planId);
    
    if (!plan) {
      return;
    }

    const product = plan.product;
    const premium = enrollment.premium || 0;

    switch (product) {
      case 'MAPD':
      case 'MA':
        breakdown.mapd.count++;
        breakdown.mapd.savings += 20;
        break;
      
      case 'PDP':
        breakdown.pdp.count++;
        breakdown.pdp.savings += 18;
        break;
      
      case 'Medsup':
        breakdown.medsup.count++;
        breakdown.medsup.savings += premium * 0.20;
        break;
      
      case 'ANC':
        breakdown.anc.count++;
        breakdown.anc.savings += premium * 0.20;
        break;
    }
  });

  // Round savings
  breakdown.mapd.savings = Math.round(breakdown.mapd.savings * 100) / 100;
  breakdown.pdp.savings = Math.round(breakdown.pdp.savings * 100) / 100;
  breakdown.medsup.savings = Math.round(breakdown.medsup.savings * 100) / 100;
  breakdown.anc.savings = Math.round(breakdown.anc.savings * 100) / 100;
  breakdown.total = breakdown.mapd.savings + breakdown.pdp.savings + breakdown.medsup.savings + breakdown.anc.savings;

  return breakdown;
}

/**
 * Calculate revenue breakdown based on enrollment data and commission structure
 * Commission structure:
 * - MAPD: 15% agent, 75% carrier
 * - PDP: 15% agent, 75% carrier
 * - MEDSUP: 20% agent, 80% carrier
 * - ANC: 20% agent, 80% carrier
 */
export interface RevenueBreakdown {
  agentRevenue: number;
  carrierRevenue: number;
  totalRevenue: number;
}

export function calculateRevenueBreakdown(
  enrollments: Enrollment[],
  plans: Plan[]
): RevenueBreakdown {
  let agentRevenue = 0;
  let carrierRevenue = 0;

  // Create a map of planId to Plan for quick lookup
  const planMap = new Map<string, Plan>();
  plans.forEach(plan => {
    planMap.set(plan.planId, plan);
  });

  enrollments.forEach(enrollment => {
    const plan = planMap.get(enrollment.planId);
    
    if (!plan) {
      // If plan not found, skip this enrollment
      return;
    }

    const product = plan.product;
    const premium = enrollment.premium || 0;

    switch (product) {
      case 'MAPD':
      case 'MA': // Medicare Advantage (same as MAPD)
        agentRevenue += premium * 0.15; // 15% to agent
        carrierRevenue += premium * 0.75; // 75% to carrier
        break;
      
      case 'PDP':
        agentRevenue += premium * 0.15; // 15% to agent
        carrierRevenue += premium * 0.75; // 75% to carrier
        break;
      
      case 'Medsup':
        agentRevenue += premium * 0.20; // 20% to agent
        carrierRevenue += premium * 0.80; // 80% to carrier
        break;
      
      case 'ANC': // Ancillary products
        agentRevenue += premium * 0.20; // 20% to agent
        carrierRevenue += premium * 0.80; // 80% to carrier
        break;
      
      default:
        // Unknown product type, skip
        break;
    }
  });

  // Round to 2 decimal places
  agentRevenue = Math.round(agentRevenue * 100) / 100;
  carrierRevenue = Math.round(carrierRevenue * 100) / 100;
  const totalRevenue = agentRevenue + carrierRevenue;

  return {
    agentRevenue,
    carrierRevenue,
    totalRevenue,
  };
}

/**
 * Calculate agent revenue for a single enrollment based on commission structure
 * Commission structure:
 * - MAPD: 15% agent
 * - PDP: 15% agent
 * - MEDSUP: 20% agent
 * - ANC: 20% agent
 */
export function calculateAgentRevenueForEnrollment(
  enrollment: Enrollment,
  plan: Plan | undefined
): number {
  if (!plan) {
    return 0;
  }

  const product = plan.product;
  const premium = enrollment.premium || 0;

  switch (product) {
    case 'MAPD':
    case 'MA': // Medicare Advantage (same as MAPD)
      return premium * 0.15; // 15% to agent
    
    case 'PDP':
      return premium * 0.15; // 15% to agent
    
    case 'Medsup':
    case 'ANC': // Ancillary products
      return premium * 0.20; // 20% to agent
    
    default:
      // Unknown product type
      return 0;
  }
}

