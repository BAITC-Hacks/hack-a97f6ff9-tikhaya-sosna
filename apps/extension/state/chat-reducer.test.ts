import { expect, test } from 'vitest';
import { chatReducer, initialChatState } from './chat-reducer';
import type { ChatReply } from '../contracts/backend';

const reply: ChatReply = { request_id: 'backend_1', message: 'Ответ', products: [], cart_proposal_received: false };

test('pure lifecycle keeps user turn pending then attaches a distinct assistant reply', () => {
  const submitted = chatReducer(initialChatState, { type: 'SUBMIT', token: 't1', id: 'u1', text: 'Вопрос' });
  expect(submitted.turns).toEqual([{ id: 'u1', role: 'user', text: 'Вопрос', status: 'pending' }]);
  const prepared = chatReducer(submitted, { type: 'PREPARED', token: 't1', sessionId: 's1' });
  expect(prepared.turns[0]).toMatchObject({ status: 'waiting' });
  const answered = chatReducer(prepared, { type: 'SUCCEEDED', token: 't1', id: 'a1', reply });
  expect(answered.turns).toHaveLength(2);
  expect(answered.turns[0]).toMatchObject({ status: 'completed' });
  expect(answered.turns[1]).toMatchObject({ role: 'assistant', reply });
  expect(chatReducer(answered, { type: 'FAILED', token: 't1', error: 'late' })).toEqual(answered);
});

test('failure keeps a failed user turn without a fabricated assistant reply', () => {
  const submitted = chatReducer(initialChatState, { type: 'SUBMIT', token: 't1', id: 'u1', text: 'Вопрос' });
  const failed = chatReducer(submitted, { type: 'FAILED', token: 't1', error: 'safe' });
  expect(failed.turns).toEqual([{ id: 'u1', role: 'user', text: 'Вопрос', status: 'failed', error: 'safe' }]);
  expect(failed.activeToken).toBeNull();
});

test('new session clears old turns but preserves the newly pending request', () => {
  const first = chatReducer(chatReducer(initialChatState,
    { type: 'SUBMIT', token: 't1', id: 'u1', text: 'old' }),
  { type: 'PREPARED', token: 't1', sessionId: 's1' });
  const done = chatReducer(first, { type: 'SUCCEEDED', token: 't1', id: 'a1', reply });
  const next = chatReducer(done, { type: 'SUBMIT', token: 't2', id: 'u2', text: 'new' });
  const rotated = chatReducer(next, { type: 'PREPARED', token: 't2', sessionId: 's2' });
  expect(rotated.turns).toEqual([{ id: 'u2', role: 'user', text: 'new', status: 'waiting' }]);
  expect(rotated.sessionNotice).toBe('Начат новый диалог.');
  expect(first.sessionNotice).toBe('');
});
