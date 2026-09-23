import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ChatWidget from './ChatWidget';

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

test('submits locally without messages, requests or delivery states, and clears stale feedback on edit', () => {
  const { textarea } = openWidget();
  const preview = 'Предпросмотр интерфейса. Отправка сообщений пока не подключена.';
  const notice = 'Отправка пока не подключена. Текст остался в поле ввода.';
  const draft = '  Нужен кабель\nс доставкой  ';
  expect(screen.getByText(preview)).toBeVisible();
  fireEvent.change(textarea, { target: { value: draft } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  expect(screen.getByRole('status')).toHaveTextContent(notice);
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(textarea).toHaveValue(draft);
  expect(screen.getByText(preview)).toBeVisible();
  expect(screen.getByText('Чем помочь?')).toBeVisible();
  expect(screen.queryByRole('log')).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText(/отправляется|доставлено|online|connected|sending|delivered/i)).not.toBeInTheDocument();
  // Draft content exists only in the textarea, never as a rendered message.
  expect(screen.queryByText(/Нужен кабель/, { ignore: 'textarea' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  expect(screen.getAllByText(notice)).toHaveLength(1);
  expect(textarea).toHaveValue(draft);
  fireEvent.change(textarea, { target: { value: `${draft}?` } });
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
