/**
 * Rich-chat — LIS/Medicaid eligibility card for `check_eligibility`.
 * Two program tiles + dual-eligible banner + the mandatory verification
 * note. "Find D-SNP plans" action (LLM-mediated) appears when dual.
 */
import { ShieldCheck, BadgeCheck, BadgeX, Search } from 'lucide-react';
import { useAtlas, type AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardButton,
  CardDataUnavailable,
} from './CardChrome';
import { asObj, isNum, isStr } from './cardUtils';

interface ProgramResult {
  found: boolean;
  isEligible?: boolean;
  lisLevel?: number;
  benefitType?: string;
  medicaidState?: string;
  expirationDate?: string;
}

interface EligibilityData {
  lis: ProgramResult;
  medicaid: ProgramResult;
  isDualEligible: boolean;
  note?: string;
}

function parseProgram(raw: unknown): ProgramResult | null {
  const p = asObj(raw);
  if (!p || typeof p.found !== 'boolean') return null;
  return {
    found: p.found,
    isEligible: typeof p.isEligible === 'boolean' ? p.isEligible : undefined,
    lisLevel: isNum(p.lisLevel) ? p.lisLevel : undefined,
    benefitType: isStr(p.benefitType) ? p.benefitType : undefined,
    medicaidState: isStr(p.medicaidState) ? p.medicaidState : undefined,
    expirationDate: isStr(p.expirationDate) ? p.expirationDate : undefined,
  };
}

function parseEligibility(data: unknown): EligibilityData | null {
  const obj = asObj(data);
  if (!obj) return null;
  const lis = parseProgram(obj.lis);
  const medicaid = parseProgram(obj.medicaid);
  if (!lis || !medicaid) return null;
  return {
    lis,
    medicaid,
    isDualEligible: obj.isDualEligible === true,
    note: isStr(obj.note) ? obj.note : undefined,
  };
}

function ProgramTile({
  name,
  program,
  detail,
}: {
  name: string;
  program: ProgramResult;
  detail?: string;
}): React.JSX.Element {
  const eligible = program.found && program.isEligible === true;
  const tone = eligible ? '#6ad48f' : program.found ? '#eab308' : 'var(--color-atlas-fg-subtle)';
  const StatusIcon = eligible ? BadgeCheck : BadgeX;
  return (
    <div
      className="flex-1 min-w-0 px-3 py-2.5 rounded-lg"
      style={{ background: 'var(--color-atlas-surface-3)' }}
    >
      <div className="flex items-center gap-1.5">
        <StatusIcon className="w-3.5 h-3.5 shrink-0" style={{ color: tone }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-atlas-fg-muted)' }}>
          {name}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: tone, marginTop: 3 }}>
        {!program.found ? 'Not found' : eligible ? 'Eligible' : 'Not eligible'}
      </div>
      {detail && (
        <div style={{ fontSize: 11, color: 'var(--color-atlas-fg-muted)', marginTop: 1 }}>{detail}</div>
      )}
      {program.expirationDate && program.found && (
        <div style={{ fontSize: 10.5, color: 'var(--color-atlas-fg-subtle)', marginTop: 1 }}>
          Expires {program.expirationDate}
        </div>
      )}
    </div>
  );
}

export function EligibilityCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const { send, isStreaming } = useAtlas();
  const parsed = parseEligibility(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={ShieldCheck} title="Eligibility check">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  return (
    <CardChrome
      icon={ShieldCheck}
      title="Eligibility check"
      pill={parsed.isDualEligible ? 'Dual eligible' : undefined}
      footer={
        parsed.isDualEligible ? (
          <CardButton
            onClick={() => void send('Find DSNP plans for dual-eligible prospects')}
            disabled={isStreaming}
          >
            <Search className="w-3.5 h-3.5" />
            Find D-SNP plans
          </CardButton>
        ) : undefined
      }
    >
      <div className="flex gap-2 px-3.5 py-3">
        <ProgramTile
          name="LIS / Extra Help"
          program={parsed.lis}
          detail={parsed.lis.lisLevel !== undefined ? `Level ${parsed.lis.lisLevel}` : undefined}
        />
        <ProgramTile
          name="Medicaid"
          program={parsed.medicaid}
          detail={
            [parsed.medicaid.benefitType, parsed.medicaid.medicaidState]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />
      </div>
      {parsed.isDualEligible && (
        <div
          className="mx-3.5 mb-2.5 px-3 py-1.5 rounded-lg"
          style={{ fontSize: 11.5, fontWeight: 600, color: '#9580ff', background: 'rgba(149,128,255,0.10)', border: '1px solid rgba(149,128,255,0.30)' }}
        >
          Qualifies for both Medicare & Medicaid — D-SNP plans may fit.
        </div>
      )}
      {parsed.note && (
        <div
          className="px-3.5 pb-2.5"
          style={{ fontSize: 10.5, color: 'var(--color-atlas-fg-subtle)', fontStyle: 'italic' }}
        >
          {parsed.note}
        </div>
      )}
    </CardChrome>
  );
}
