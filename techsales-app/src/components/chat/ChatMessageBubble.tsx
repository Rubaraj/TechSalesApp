/**
 * One conversation turn rendered as a chat bubble. User messages float right
 * with primary-tinted background; assistant messages float left with a muted
 * background. Theme-aware via primary-* / gray-* tokens; never hard-coded
 * brand colours.
 */
import type { ChatMessage } from '../../types/ai';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** When true, render a small "typing…" dot trail after the bubble content. */
  isStreaming?: boolean;
}

export function ChatMessageBubble({ message, isStreaming = false }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={[
          'max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary-600 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm',
        ].join(' ')}
      >
        {message.content}
        {isStreaming && (
          <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
            <span className="w-1 h-1 bg-current rounded-full animate-pulse" />
            <span className="w-1 h-1 bg-current rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="w-1 h-1 bg-current rounded-full animate-pulse [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
