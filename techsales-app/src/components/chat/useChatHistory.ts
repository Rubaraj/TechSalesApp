/**
 * Member chat history hook. Persists the last 50 messages per member in
 * localStorage under `medhub-chat-${memberId}` so the conversation survives
 * a hard refresh / re-login.
 *
 * The hook intentionally exposes a tiny surface (`messages`, `appendUser`,
 * `appendAssistant`, `clear`) — UI-side concerns like the streaming buffer
 * live in the widget itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types/ai';

const MAX_MESSAGES = 50;
const STORAGE_PREFIX = 'medhub-chat-';

function storageKey(memberId: string): string {
  return `${STORAGE_PREFIX}${memberId}`;
}

function readFromStorage(memberId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(memberId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ChatMessage =>
        Boolean(
          m &&
            typeof m === 'object' &&
            'role' in m &&
            'content' in m &&
            typeof (m as ChatMessage).content === 'string',
        ),
      )
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function writeToStorage(memberId: string, messages: ChatMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(memberId), JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or storage disabled — silently drop. The in-memory
    // copy is still authoritative for the current session.
  }
}

export interface UseChatHistory {
  messages: ChatMessage[];
  appendUser: (content: string) => void;
  appendAssistant: (content: string) => void;
  clear: () => void;
}

export function useChatHistory(memberId: string): UseChatHistory {
  const [messages, setMessages] = useState<ChatMessage[]>(() => readFromStorage(memberId));

  // Reset state when the memberId changes (logout + relogin to a different
  // member should not surface another member's transcript).
  const lastMemberId = useRef(memberId);
  useEffect(() => {
    if (lastMemberId.current !== memberId) {
      lastMemberId.current = memberId;
      setMessages(readFromStorage(memberId));
    }
  }, [memberId]);

  // Persist on every change, capped to MAX_MESSAGES to bound disk usage.
  useEffect(() => {
    writeToStorage(memberId, messages);
  }, [memberId, messages]);

  const appendUser = useCallback((content: string) => {
    setMessages((prev) =>
      [...prev, { role: 'user' as const, content }].slice(-MAX_MESSAGES),
    );
  }, []);

  const appendAssistant = useCallback((content: string) => {
    setMessages((prev) =>
      [...prev, { role: 'assistant' as const, content }].slice(-MAX_MESSAGES),
    );
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(storageKey(memberId));
    } catch {
      // ignore
    }
  }, [memberId]);

  return { messages, appendUser, appendAssistant, clear };
}
