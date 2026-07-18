/**
 * Rich-chat — display-card registry. Maps a backend `card` type to its
 * renderer. Unknown types render nothing (forward-compatible: the backend
 * can ship new card types before the FE knows them; the model's text
 * answer still carries the information).
 */
import type { ComponentType } from 'react';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import { ComparisonCard } from './ComparisonCard';
import { LeadListCard } from './LeadListCard';
import { PacingCard } from './PacingCard';
import { EligibilityCard } from './EligibilityCard';
import { PlanResultsCard } from './PlanResultsCard';
import { EnrollmentsCard } from './EnrollmentsCard';
import { AppointmentsCard } from './AppointmentsCard';
import { SavingsCard } from './SavingsCard';
import { QaScorecardCard } from './QaScorecardCard';

const CARD_RENDERERS: Record<string, ComponentType<{ card: AtlasDisplayCard }>> = {
  comparison: ComparisonCard,
  lead_list: LeadListCard,
  pacing: PacingCard,
  eligibility: EligibilityCard,
  plan_results: PlanResultsCard,
  enrollments: EnrollmentsCard,
  appointments: AppointmentsCard,
  savings: SavingsCard,
  qa_review: QaScorecardCard,
};

export function AtlasDisplayCardView({ card }: { card: AtlasDisplayCard }): React.JSX.Element | null {
  const Renderer = CARD_RENDERERS[card.card];
  if (!Renderer) return null;
  return <Renderer card={card} />;
}
