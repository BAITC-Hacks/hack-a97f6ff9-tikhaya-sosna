import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import fixture from '../../tests/fixtures/backend-chat-success.json';
import { normalizeBackendReply } from '../../contracts/backend';
import ProductCard from './ProductCard';

afterEach(cleanup);
const product = normalizeBackendReply(fixture)?.products[0];
if (!product) throw new Error('bad fixture');

test('shows supplied price, fractional stock, location and safe links without cart action', () => {
  render(<ProductCard product={product} />);
  expect(screen.getByText('Кабель тестовый')).toBeVisible();
  expect(screen.getByText(/FIX-42/)).toBeVisible();
  expect(screen.getByText('Наличие: 1,5')).toBeVisible();
  expect(screen.getByText('Склад: Склад А')).toBeVisible();
  expect(screen.getByText(/0,00/)).toBeVisible();
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  const image = screen.getByRole('img');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
  fireEvent.error(image);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('unknown facts stay unknown and forged links are inactive at render boundary', () => {
  render(<ProductCard product={{ ...product, price: null, available_quantity: null,
    stock_location: null, stores: [], image_url: 'https://evil.invalid/upload/a.jpg',
    product_url: 'javascript:alert(1)', certificate_url: 'https://ekt.kz/private/x.pdf' }} />);
  expect(screen.getByText('Цена не указана')).toBeVisible();
  expect(screen.getByText('Наличие: не указано')).toBeVisible();
  expect(screen.getByText('Склад: не указан')).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
