import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

test('latest control appears only after meaningful scroll and occupies its own row', () => {
  const turns: ChatTurn[] = [{ id: 'a', role: 'assistant', text: reply.message, reply }];
  const { rerender } = render(<MessageList turns={turns} followToken={null} />);
  const log = screen.getByRole('log', { name: 'Сообщения чата' });
  Object.defineProperties(log, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 400 },
  });
  log.scrollTop = 520;
  fireEvent.scroll(log);
  expect(screen.queryByRole('button', { name: 'К последним сообщениям' })).not.toBeInTheDocument();
  log.scrollTop = 450;
  fireEvent.scroll(log);
  const latest = screen.getByRole('button', { name: 'К последним сообщениям' });
  const wrap = log.parentElement;
  expect(wrap).toHaveClass('ekt-ai-log-wrap');
  expect(latest.parentElement).toBe(wrap);
  expect(log.contains(latest)).toBe(false);
  expect(screen.getByText('Кабель тестовый')).toBeInTheDocument();
  rerender(<MessageList turns={[...turns, { id: 'u', role: 'user', text: 'Ещё?', status: 'completed' }]} followToken={null} />);
  expect(log.scrollTop).toBe(450);
  expect(screen.getByRole('button', { name: 'К последним сообщениям' })).toBeVisible();
  fireEvent.click(latest);
  expect(log.scrollTop).toBe(1000);
  expect(screen.queryByRole('button', { name: 'К последним сообщениям' })).not.toBeInTheDocument();
});

test('a new submitted turn follows latest while an older reply preserves intentional scroll', () => {
  const turns: ChatTurn[] = [{ id: 'a', role: 'assistant', text: reply.message, reply }];
  const { rerender } = render(<MessageList turns={turns} followToken={null} />);
  const log = screen.getByRole('log', { name: 'Сообщения чата' });
  Object.defineProperties(log, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 400 },
  });
  log.scrollTop = 200;
  fireEvent.scroll(log);
  rerender(<MessageList turns={[...turns, { id: 'a2', role: 'assistant', text: 'Ответ', reply }]} followToken={null} />);
  expect(log.scrollTop).toBe(200);
  rerender(<MessageList turns={[...turns, { id: 'u2', role: 'user', text: 'Новый вопрос', status: 'pending' }]} followToken="new-submit" />);
  expect(log.scrollTop).toBe(1000);
  expect(screen.queryByRole('button', { name: 'К последним сообщениям' })).not.toBeInTheDocument();
});
