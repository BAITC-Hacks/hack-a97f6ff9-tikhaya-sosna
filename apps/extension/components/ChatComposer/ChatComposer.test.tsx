import { useState } from 'react';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ChatComposer from './ChatComposer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ initial = '', onSubmit }: { initial?: string; onSubmit: (draft: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return <ChatComposer draft={draft} onDraftChange={setDraft} onSubmit={onSubmit} />;
}

function setup(initial = '') {
  const onSubmit = vi.fn<(draft: string) => void>();
  render(<Harness initial={initial} onSubmit={onSubmit} />);
  const textarea = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Ваш вопрос' });
  const button = screen.getByRole('button', { name: 'Отправить' });
  const form = textarea.form;
  if (!form) throw new Error('Composer must use a native form');
  return { onSubmit, textarea, button, form };
}

test('labels the textarea and rejects empty/whitespace drafts, even direct submission', () => {
  const { textarea, button, form, onSubmit } = setup();
  expect(textarea).toHaveAccessibleDescription(/Enter/);
  expect(button).toBeDisabled();
  expect(screen.getByText('0 / 8000')).not.toHaveAttribute('aria-live');
  expect(fireEvent.submit(form)).toBe(false);
  fireEvent.change(textarea, { target: { value: ' \n\t ' } });
  expect(button).toBeDisabled();
  expect(fireEvent.submit(form)).toBe(false);
  expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(false);
  expect(onSubmit).not.toHaveBeenCalled();
});

test('button emits unchanged multiline text exactly once', () => {
  const draft = '  Кабель\nВВГ 3×2,5  ';
  const { textarea, button, onSubmit } = setup();
  fireEvent.change(textarea, { target: { value: draft } });
  fireEvent.click(button);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(draft);
  expect(textarea).toHaveValue(draft);
});

test('plain Enter uses one native submit path and cancels its default', () => {
  const { textarea, onSubmit, form } = setup('  Вопрос  ');
  const observedSubmit = vi.fn();
  form.addEventListener('submit', observedSubmit);
  const enter = createEvent.keyDown(textarea, { key: 'Enter', cancelable: true });
  fireEvent(textarea, enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(observedSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith('  Вопрос  ');
  form.removeEventListener('submit', observedSubmit);
});

test.each(['shiftKey', 'ctrlKey', 'altKey', 'metaKey'] as const)('%s + Enter leaves native input alone', (modifier) => {
  const { textarea, onSubmit } = setup('Вопрос');
  expect(fireEvent.keyDown(textarea, { key: 'Enter', [modifier]: true })).toBe(true);
  expect(onSubmit).not.toHaveBeenCalled();
  // fireEvent does not perform native editing; explicitly change multiline state.
  fireEvent.change(textarea, { target: { value: 'Вопрос\nПродолжение' } });
  expect(textarea).toHaveValue('Вопрос\nПродолжение');
});

test('native IME state and composition events prevent accidental submission without cancellation', () => {
  const { textarea, onSubmit } = setup('Вопрос');
  expect(fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })).toBe(true);
  fireEvent.compositionStart(textarea);
  expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(true);
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.compositionEnd(textarea);
  expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(false);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Вопрос');
});

test('retains over-limit code units with accessible error, then restores eligibility at the boundary', () => {
  const { textarea, button, form, onSubmit } = setup();
  const overlong = '😀'.repeat(4000) + 'x';
  fireEvent.change(textarea, { target: { value: overlong } });
  expect(textarea).toHaveValue(overlong);
  expect(textarea).not.toHaveAttribute('maxlength');
  expect(textarea).toHaveAttribute('aria-invalid', 'true');
  expect(textarea).toHaveAccessibleDescription(/Текст слишком длинный/);
  expect(screen.getByText('8001 / 8000')).toBeVisible();
  expect(button).toBeDisabled();
  expect(fireEvent.submit(form)).toBe(false);
  fireEvent.keyDown(textarea, { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
  const valid = '😀'.repeat(4000);
  fireEvent.change(textarea, { target: { value: valid } });
  expect(button).toBeEnabled();
  expect(textarea).toHaveAttribute('aria-invalid', 'false');
  expect(textarea).not.toHaveAccessibleDescription(/Текст слишком длинный/);
  expect(screen.getByText('8000 / 8000')).toBeVisible();
  expect(fireEvent.submit(form)).toBe(false);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(valid);
});

test('pending composer retains draft but blocks both button and native submission', () => {
  const onSubmit = vi.fn();
  render(<ChatComposer draft="Вопрос" onDraftChange={vi.fn()} onSubmit={onSubmit} pending />);
  const textarea = screen.getByRole<HTMLTextAreaElement>('textbox');
  expect(textarea).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  if (!textarea.form) throw new Error('missing form');
  fireEvent.submit(textarea.form);
  expect(onSubmit).not.toHaveBeenCalled();
});

test('direct valid form submission cancels navigation and stops local bubbling', () => {
  const onSubmit = vi.fn<(draft: string) => void>();
  const onParentSubmit = vi.fn();
  render(<div onSubmit={onParentSubmit}><Harness initial=" Вопрос " onSubmit={onSubmit} /></div>);
  const textarea = screen.getByRole<HTMLTextAreaElement>('textbox');
  if (!textarea.form) throw new Error('Missing form');
  const submit = createEvent.submit(textarea.form, { cancelable: true, bubbles: true });
  fireEvent(textarea.form, submit);
  expect(submit.defaultPrevented).toBe(true);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(' Вопрос ');
  expect(onParentSubmit).not.toHaveBeenCalled();
});
