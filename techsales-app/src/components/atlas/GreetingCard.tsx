/**
 * Phase 4 design — Atlas greeting (editorial serif headline + AtlasMark).
 *
 * Fetches `/api/ai/atlas/greeting/:userId` (templated, no LLM). The first
 * sentence of `greeting` is rendered as a Newsreader serif headline; the
 * remainder is muted body text. Suggested prompts render as quick-click
 * pills on the dark surface.
 */
import { useEffect, useState } from 'react';
import { atlasService, type AtlasGreeting } from '../../services/atlasService';
import { useAuth } from '../../context/AuthContext';
import { useAtlas } from '../../context/AtlasContext';
import { AtlasMark } from './AtlasMark';

export function GreetingCard(): React.JSX.Element | null {
  const { user } = useAuth();
  const { send } = useAtlas();
  const [greeting, setGreeting] = useState<AtlasGreeting | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;
    void atlasService.getGreeting(user.userId).then((g) => {
      setGreeting(g);
      setLoaded(true);
    });
  }, [user?.userId]);

  if (!loaded || !greeting) return null;

  const { headline, body } = splitGreeting(greeting.greeting);

  return (
    <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: 'var(--color-atlas-border)' }}>
      <div className="msg-in flex items-start gap-3">
        <AtlasMark size={42} animate={false} />
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.2,
              color: 'var(--color-atlas-fg)',
              letterSpacing: '0',
            }}
          >
            {headline}
          </div>
          {body && (
            <div
              style={{
                fontSize: 13.5,
                color: 'var(--color-atlas-fg-muted)',
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {body}
            </div>
          )}
        </div>
      </div>
      {greeting.suggestedPrompts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {greeting.suggestedPrompts.slice(0, 4).map((prompt) => (
            <button
              key={prompt}
              onClick={() => void send(prompt)}
              className="text-[12px] px-3 py-1.5 rounded-full transition-colors"
              style={{
                background: 'var(--color-atlas-surface-3)',
                color: 'var(--color-atlas-fg)',
                border: '1px solid var(--color-atlas-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-exl-orange-line)';
                e.currentTarget.style.color = 'var(--color-exl-orange-bright)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-atlas-border)';
                e.currentTarget.style.color = 'var(--color-atlas-fg)';
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function splitGreeting(text: string): { headline: string; body: string } {
  const trimmed = text.trim();
  const firstSentenceEnd = trimmed.search(/[.!?](\s|$)/);
  if (firstSentenceEnd === -1) return { headline: trimmed, body: '' };
  const headline = trimmed.slice(0, firstSentenceEnd + 1);
  const body = trimmed.slice(firstSentenceEnd + 1).trim();
  return { headline, body };
}
