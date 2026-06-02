/**
 * Phase 4 (M4) — Personalized greeting shown when the Atlas panel opens
 * with an empty chat. Fetches from `/api/ai/atlas/greeting/:userId` (NO LLM —
 * just templated). Suggested prompts let the agent click-to-send.
 */
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { atlasService, type AtlasGreeting } from '../../services/atlasService';
import { useAuth } from '../../context/AuthContext';
import { useAtlas } from '../../context/AtlasContext';

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

  if (!loaded) return null;
  if (!greeting) return null;

  return (
    <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-b from-primary-50/40 to-transparent dark:from-primary-900/10">
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-4 h-4 mt-0.5 text-primary-600 dark:text-primary-400 shrink-0" />
        <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">
          {greeting.greeting}
        </p>
      </div>
      {greeting.suggestedPrompts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {greeting.suggestedPrompts.slice(0, 4).map((prompt) => (
            <button
              key={prompt}
              onClick={() => void send(prompt)}
              className="text-[11px] px-2 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-600 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
