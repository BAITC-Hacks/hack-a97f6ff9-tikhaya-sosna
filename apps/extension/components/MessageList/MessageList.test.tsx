import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import MessageList from './MessageList';
import fixture from '../../tests/fixtures/backend-chat-success.json';
import { normalizeBackendReply } from '../../contracts/backend';
import type { ChatTurn } from '../../state/chat-reducer';

afterEach(cleanup);
const reply = normalizeBackendReply(fixture);
if (!reply) throw new Error('bad fixture');

test('named log keeps replies and cards with their own assistant turns as text', () => {
  const turns: ChatTurn[] = [
    { id: 'u1', role: 'user', text: '<b>Вопрос</b>', status: 'completed' },
    { id: 'a1', role: 'assistant', text: reply.message, reply },
    { id: 'u2', role: 'user', text: 'Ещё?', status: 'failed', error: 'Сбой' },
  ];
  render(<MessageList turns={turns} followToken="t1" />);
  expect(screen.getByRole('log', { name: 'Сообщения чата' })).toBeVisible();
  expect(screen.getByText('<b>Вопрос</b>')).toBeVisible();
  expect(document.querySelector('b')).toBeNull();
  expect(screen.getByText('Кабель тестовый')).toBeVisible();
  expect(screen.getByText(/Нет подтверждённого ответа/)).toBeVisible();
});

test('text-only answer and cart handoff notice do not offer a mutation control', () => {
  render(<MessageList turns={[{ id: 'a', role: 'assistant', text: 'Ответ',
    reply: { ...reply, products: [], cart_proposal_received: true } }]} followToken={null} />);
  expect(screen.getByText('Ответ')).toBeVisible();
  expect(screen.getByText('Добавление в корзину здесь пока недоступно.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /добавить|купить|подтвердить/i })).not.toBeInTheDocument();
});
