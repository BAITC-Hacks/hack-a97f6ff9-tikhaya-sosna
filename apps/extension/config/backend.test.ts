import { expect, test } from 'vitest';
import { backendHostPermissions, resolveBackendConfig } from './backend';

test('accepts only explicit safe backend origins and fixes one chat endpoint', () => {
  expect(resolveBackendConfig('http://localhost:8000/')).toEqual({
    origin: 'http://localhost:8000', endpoint: 'http://localhost:8000/api/v1/chat',
    hostPermission: 'http://localhost/*',
  });
  expect(resolveBackendConfig('https://assistant.example.com')?.endpoint)
    .toBe('https://assistant.example.com/api/v1/chat');
  expect(backendHostPermissions(resolveBackendConfig('https://assistant.example.com')))
    .toEqual(['https://assistant.example.com/*']);
});

test.each([undefined, '', 'http://assistant.example.com', 'http://192.168.1.4',
  'https://ekt.kz', 'https://nursultan.ekt.kz', 'https://evil-ekt.kz/api',
  'https://user:pass@assistant.example.com', 'https://assistant.example.com/api/v1/chat',
  'https://assistant.example.com?x=1', 'https://assistant.example.com#x',
  'https://*.example.com', 'https://[::1]', 'https:\\\\assistant.example.com',
  ' https://assistant.example.com', 'ftp://assistant.example.com',
])('rejects unsafe or absent origin %s', (raw) => {
  expect(resolveBackendConfig(raw)).toBeNull();
  expect(backendHostPermissions(resolveBackendConfig(raw))).toEqual([]);
});
