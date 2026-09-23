import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from './App';

test('renders the extension scaffold placeholder', () => {
  render(<App />);

  expect(screen.getByText('EKT AI Assistant')).toBeInTheDocument();
  expect(screen.getByText('Extension initialized')).toBeInTheDocument();
});
