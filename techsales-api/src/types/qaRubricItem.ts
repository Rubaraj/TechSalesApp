/**
 * Gap 9 — admin-editable QA rubric row. One collection holds both row
 * kinds (discriminated by `kind`):
 *
 *   dimension  — a scoring dimension the QA reviewer grades 0-100.
 *                `key` is the immutable camelCase slug used as the
 *                structured-output property name AND the key stored in
 *                each review's dimensions map; editing the label never
 *                regenerates it (old reviews' snapshots stay valid).
 *   disclosure — a required-disclosure checklist item the reviewer
 *                marks met / not met.
 *
 * Supervisors manage rows from Admin › QA Rubric; runQaReview loads
 * active rows with the same 60s-TTL cache pattern as the compliance and
 * coaching rules.
 */
export type QaRubricItemKind = 'dimension' | 'disclosure';

export interface QaRubricItem {
  itemId: string;
  kind: QaRubricItemKind;
  /** dimension only — immutable camelCase slug (structured-output key). */
  key?: string;
  /** Dimension name shown in scorecards / the checklist item text. */
  label: string;
  /** dimension only — what the reviewer should judge. */
  description?: string;
  /** dimension only — 1-5; 5 = heaviest (a serious violation on a
   *  weight-5 dimension caps the overall score). */
  weight?: number;
  /** Render + prompt order within the kind (ascending). */
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}
