import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ChatWidget from './ChatWidget';
import fixture from '../../tests/fixtures/backend-chat-success.json';
import { normalizeBackendReply } from '../../contracts/backend';
import type { ChatReply } from '../../contracts/backend';

const fetchStub = vi.fn(() => { throw new Error('Application fetch is forbidden in the UI shell'); });

beforeEach(() => {
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(fetchStub).not.toHaveBeenCalled();
});

function openWidget() {
  render(<ChatWidget />);
  const launcher = screen.getByRole('button', { name: 'Чат EKT AI Assistant' });
  fireEvent.click(launcher);
  return { launcher, textarea: screen.getByRole('textbox', { name: 'Ваш вопрос' }) };
}

test('opens a named non-modal panel and restores focus with both close controls', () => {
  const { launcher, textarea } = openWidget();
  const panel = screen.getByRole('dialog', { name: 'EKT AI Assistant' });
  expect(panel).toHaveAttribute('aria-modal', 'false');
  expect(launcher).toHaveAttribute('aria-controls', panel.id);
  expect(launcher).toHaveAttribute('aria-expanded', 'true');
  expect(textarea).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно чата' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  expect(launcher).toHaveAttribute('aria-expanded', 'false');
  expect(launcher).not.toHaveAttribute('aria-controls');
  fireEvent.click(launcher);
  expect(screen.getByRole('textbox')).toHaveFocus();
  fireEvent.click(launcher);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
});

test('preserves exact multiline draft across closing and reopening', () => {
  const { launcher, textarea } = openWidget();
  const draft = '  Кабель?\n  Вторая строка  \n';
  fireEvent.change(textarea, { target: { value: draft } });
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно чата' }));
  fireEvent.click(launcher);
  expect(screen.getByRole('textbox')).toHaveValue(draft);
});

test('allows outside focus and clicks; only an unhandled inside Escape closes', () => {
  render(<><button type="button">Контроль сайта</button><ChatWidget /></>);
  const outside = screen.getByRole('button', { name: 'Контроль сайта' });
  const launcher = screen.getByRole('button', { name: 'Чат EKT AI Assistant' });
  fireEvent.click(launcher);
  const textarea = screen.getByRole('textbox');
  outside.focus();
  fireEvent.click(outside);
  fireEvent.keyDown(outside, { key: 'Escape' });
  // A render caused by editing must not recapture focus either.
  fireEvent.change(textarea, { target: { value: 'Вопрос' } });
  expect(outside).toHaveFocus();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const handled = createEvent.keyDown(textarea, { key: 'Escape', cancelable: true });
  handled.preventDefault();
  fireEvent(textarea, handled);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(textarea, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
});

test('does not close during native or locally tracked composition', () => {
  const { textarea } = openWidget();
  expect(fireEvent.keyDown(textarea, { key: 'Escape', isComposing: true })).toBe(true);
  fireEvent.compositionStart(textarea);
  expect(fireEvent.keyDown(textarea, { key: 'Escape' })).toBe(true);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.compositionEnd(textarea);
  fireEvent.keyDown(textarea, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('one explicit submit retains draft and shows a safe failure without an assistant turn', async () => {
  const sendMessage = vi.fn(async () => ({ ok: false as const,
    error: { code: 'BACKEND_NOT_CONFIGURED' as const, message: 'Backend URL is not configured.', retryable: false as const } }));
  render(<ChatWidget service={{ sendMessage }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Чат EKT AI Assistant' }));
  const textarea = screen.getByRole('textbox', { name: 'Ваш вопрос' });
  const draft = '  Нужен кабель\nс доставкой  ';
  fireEvent.change(textarea, { target: { value: draft } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledExactlyOnceWith(draft, expect.any(Function)));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Backend не настроен'));
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(textarea).toHaveValue(draft);
  expect(screen.getByRole('log', { name: 'Сообщения чата' })).toBeVisible();
  expect(screen.getByText(/Нет подтверждённого ответа/)).toBeVisible();
  fireEvent.change(textarea, { target: { value: `${draft}?` } });
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test('one pending request survives close/open and displays its own real answer and card', async () => {
  const reply = normalizeBackendReply(fixture);
  if (!reply) throw new Error('bad fixture');
  let finish: ((value: { ok: true; data: ChatReply }) => void) | undefined;
  const sendMessage = vi.fn(() => new Promise<{ ok: true; data: ChatReply }>((resolve) => { finish = resolve; }));
  render(<ChatWidget service={{ sendMessage }} />);
  const launcher = screen.getByRole('button', { name: 'Чат EKT AI Assistant' });
  fireEvent.click(launcher);
  const textarea = screen.getByRole('textbox', { name: 'Ваш вопрос' });
  fireEvent.change(textarea, { target: { value: 'Кабель?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  expect(textarea).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно чата' }));
  fireEvent.click(launcher);
  expect(screen.getByRole('textbox')).toHaveValue('Кабель?');
  expect(sendMessage).toHaveBeenCalledTimes(1);
  finish?.({ ok: true, data: reply });
  await waitFor(() => expect(screen.getByText('Кабель тестовый')).toBeVisible());
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText(/Кабель доступен/)).toBeVisible();
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

test('rapid double submit starts one request and leaves the composer outside the message area', async () => {
  let finish: ((value: { ok: false; error: { code: 'BACKEND_UNAVAILABLE'; message: string; retryable: false } }) => void) | undefined;
  const sendMessage = vi.fn(() => new Promise<{ ok: false; error: { code: 'BACKEND_UNAVAILABLE'; message: string; retryable: false } }>(
    (resolve) => { finish = resolve; }));
  render(<ChatWidget service={{ sendMessage }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Чат EKT AI Assistant' }));
  const textarea = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Ваш вопрос' });
  fireEvent.change(textarea, { target: { value: 'Кабель?' } });
  if (!textarea.form) throw new Error('Missing composer form');
  fireEvent.submit(textarea.form);
  fireEvent.submit(textarea.form);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  const log = screen.getByRole('log', { name: 'Сообщения чата' });
  expect(log.parentElement).toHaveClass('ekt-ai-log-wrap');
  expect(textarea.form.parentElement).toBe(log.parentElement?.parentElement);
  expect(log.parentElement?.contains(textarea.form)).toBe(false);
  finish?.({ ok: false, error: { code: 'BACKEND_UNAVAILABLE', message: 'offline', retryable: false } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Не удалось связаться'));
  expect(textarea).toHaveValue('Кабель?');
});
