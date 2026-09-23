import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import App from './App';

afterEach(cleanup);

test('renders only the closed launcher without stealing focus', () => {
  const initialFocus = document.activeElement;
  render(<App />);
  const launcher = screen.getByRole('button', { name: 'Чат EKT AI Assistant' });
  expect(launcher).toHaveAttribute('type', 'button');
  expect(launcher).toHaveAttribute('aria-expanded', 'false');
  expect(launcher).not.toHaveAttribute('aria-controls');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Extension initialized')).not.toBeInTheDocument();
  expect(document.activeElement).toBe(initialFocus);
});
