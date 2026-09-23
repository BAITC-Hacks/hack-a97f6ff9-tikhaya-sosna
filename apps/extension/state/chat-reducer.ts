import type { ChatReply } from '../contracts/backend';

export type ChatTurn =
  | { id: string; role: 'user'; text: string; status: 'pending' | 'waiting' | 'completed' | 'failed'; error?: string }
  | { id: string; role: 'assistant'; text: string; reply: ChatReply };

export interface ChatState {
  sessionId: string | null;
  turns: ChatTurn[];
  activeToken: string | null;
  sessionNotice: string;
}

export const initialChatState: ChatState = { sessionId: null, turns: [], activeToken: null, sessionNotice: '' };

export type ChatAction =
  | { type: 'SUBMIT'; token: string; id: string; text: string }
  | { type: 'PREPARED'; token: string; sessionId: string }
  | { type: 'SUCCEEDED'; token: string; id: string; reply: ChatReply }
  | { type: 'FAILED'; token: string; error: string };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'SUBMIT') {
    if (state.activeToken) return state;
    return { ...state, activeToken: action.token,
      turns: [...state.turns, { id: action.id, role: 'user', text: action.text, status: 'pending' }] };
  }
  if (state.activeToken !== action.token) return state;
  if (action.type === 'PREPARED') {
    const rotated = state.sessionId !== null && state.sessionId !== action.sessionId;
    const turns = rotated ? state.turns.filter((turn) => turn.role === 'user' && turn.status === 'pending') : state.turns;
    return { ...state, sessionId: action.sessionId,
      sessionNotice: rotated ? 'Начат новый диалог.' : state.sessionNotice,
      turns: turns.map((turn) => turn.role === 'user' && turn.status === 'pending' ? { ...turn, status: 'waiting' } : turn) };
  }
  if (action.type === 'FAILED') {
    return { ...state, activeToken: null,
      turns: state.turns.map((turn) => turn.role === 'user' &&
        (turn.status === 'pending' || turn.status === 'waiting') ?
        { ...turn, status: 'failed', error: action.error } : turn) };
  }
  return { ...state, activeToken: null,
    turns: [...state.turns.map((turn) => turn.role === 'user' &&
      (turn.status === 'pending' || turn.status === 'waiting') ? { ...turn, status: 'completed' as const } : turn),
      { id: action.id, role: 'assistant', text: action.reply.message, reply: action.reply }] };
}
