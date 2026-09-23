import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { mountWidget, type WidgetMount } from './widget-mount';

const handles: WidgetMount[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  act(() => { handles.splice(0).forEach((handle) => handle.unmount()); });
  hosts.splice(0).forEach((host) => host.remove());
});

function setup() {
  const host = document.createElement('div');
  hosts.push(host);
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  const sentinel = document.createElement('span');
  sentinel.textContent = 'Unrelated sibling';
  container.append(sentinel);
  shadow.append(container);
  let handle: WidgetMount | undefined;
  act(() => { handle = mountWidget(container); });
  if (!handle) throw new Error('Mount must return its cleanup handle');
  handles.push(handle);
  return { host, shadow, container, sentinel, handle, ui: within(container) };
}

test('mounts real App only inside Shadow DOM and manages inner focus', () => {
  const { host, shadow, container, ui } = setup();
  const launcher = ui.getByRole('button', { name: 'Чат EKT AI Assistant' });
  expect(container.querySelector('#ekt-ai-assistant-react-root')).toContainElement(launcher);
  expect(document.body.querySelector('#ekt-ai-assistant-react-root')).toBeNull();
  expect(host.childNodes).toHaveLength(0);
  expect(ui.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(launcher);
  expect(shadow.activeElement).toBe(ui.getByRole('textbox', { name: 'Ваш вопрос' }));
  fireEvent.click(ui.getByRole('button', { name: 'Закрыть окно чата' }));
  expect(shadow.activeElement).toBe(launcher);
});

test('cleanup removes only its wrapper, is idempotent, and permits a single fresh mount', () => {
  const { container, sentinel, handle, ui } = setup();
  fireEvent.click(ui.getByRole('button', { name: 'Чат EKT AI Assistant' }));
  fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Temporary draft' } });
  act(() => { handle.unmount(); handle.unmount(); });
  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild).toBe(sentinel);
  expect(sentinel).toHaveTextContent('Unrelated sibling');
  act(() => { handles.push(mountWidget(container)); });
  expect(container.querySelectorAll('#ekt-ai-assistant-react-root')).toHaveLength(1);
  expect(ui.getAllByRole('button', { name: 'Чат EKT AI Assistant' })).toHaveLength(1);
  expect(ui.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(ui.getByRole('button', { name: 'Чат EKT AI Assistant' }));
  expect(ui.getByRole('textbox')).toHaveValue('');
  expect(container).toContainElement(sentinel);
});
