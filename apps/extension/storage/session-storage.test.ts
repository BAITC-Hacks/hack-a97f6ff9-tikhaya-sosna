import { describe, expect, test, vi } from 'vitest';
import { createSessionStore, sessionStorageKey, SessionUnavailableError, type SessionArea } from './session-storage';
import type { SessionScope } from '../contracts/session';

const origin = 'https://nursultan.ekt.kz';
const scope: SessionScope = { tab_id: 0, origin };
const ids = [
  '35bc8d96-6c74-4f72-9760-0cd617ba3a83',
  '35bc8d96-6c74-4f72-9760-0cd617ba3a84',
  '35bc8d96-6c74-4f72-9760-0cd617ba3a85',
  '35bc8d96-6c74-4f72-9760-0cd617ba3a86',
] as const;

function fakeArea() {
  const data = new Map<string, unknown>();
  const get = vi.fn(async (key: string) => ({ [key]: data.get(key) }));
  const set = vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) data.set(key, value);
  });
  return { data, get, set };
}

function idFactory() {
  let index = 0;
  return vi.fn(() => ids[index++] ?? ids[3]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('browser-session scoped storage', () => {
  test('read-only lookup does not create, rotate or repair a missing session', async () => {
    const area = fakeArea();
    const store = createSessionStore(area, idFactory());
    expect(await store.getExisting(scope)).toBeNull();
    expect(area.set).not.toHaveBeenCalled();
    const first = await store.getOrCreate(scope);
    expect(await store.getExisting(scope)).toEqual(first);
    area.data.set(sessionStorageKey(scope), { invalid: true });
    expect(await store.getExisting(scope)).toBeNull();
    expect(area.set).toHaveBeenCalledTimes(1);
  });
  test('creates exactly four fields, reuses without write, survives worker recreation and storage clear', async () => {
    const area = fakeArea();
    const makeId = idFactory();
    const store = createSessionStore(area, makeId);
    expect(area.get).not.toHaveBeenCalled();
    const first = await store.getOrCreate(scope);
    const key = sessionStorageKey(scope);
    expect(key).toContain('0');
    expect(area.get).toHaveBeenCalledExactlyOnceWith(key);
    expect(area.set).toHaveBeenCalledExactlyOnceWith({ [key]: {
      schema_version: 1, session_id: ids[0], origin, tab_id: 0,
    } });
    expect(Object.keys(area.data.get(key) as object).sort()).toEqual(['origin', 'schema_version', 'session_id', 'tab_id']);
    expect(first).toEqual({ session_id: ids[0], origin });
    expect(await store.getOrCreate(scope)).toEqual(first);
    expect(await createSessionStore(area, makeId).getOrCreate(scope)).toEqual(first);
    expect(area.set).toHaveBeenCalledTimes(1);
    area.data.clear();
    expect(await createSessionStore(area, makeId).getOrCreate(scope)).toEqual({ session_id: ids[1], origin });
  });

  test('separates tabs and origins; RESET replaces one exact key', async () => {
    const area = fakeArea();
    const store = createSessionStore(area, idFactory());
    const otherTab = { ...scope, tab_id: 1 };
    const otherOrigin = { ...scope, origin: 'https://ekt.kz' };
    expect((await store.getOrCreate(scope)).session_id).toBe(ids[0]);
    expect((await store.getOrCreate(otherTab)).session_id).toBe(ids[1]);
    expect((await store.getOrCreate(otherOrigin)).session_id).toBe(ids[2]);
    expect((await store.reset(scope)).session_id).toBe(ids[3]);
    expect((await store.getOrCreate(scope)).session_id).toBe(ids[3]);
    expect((await store.getOrCreate(otherTab)).session_id).toBe(ids[1]);
    expect((await store.getOrCreate(otherOrigin)).session_id).toBe(ids[2]);
    expect(area.data.size).toBe(3);
    expect(sessionStorageKey(scope)).not.toBe(sessionStorageKey(otherTab));
    expect(sessionStorageKey(scope)).not.toBe(sessionStorageKey(otherOrigin));
  });

  test('repairs malformed, versioned, extra-key and scope-mismatched records', async () => {
    const bad: unknown[] = [null, 'text', { schema_version: 2, session_id: ids[0], origin, tab_id: 0 },
      { schema_version: 1, session_id: 'bad', origin, tab_id: 0 },
      { schema_version: 1, session_id: ids[0], origin, tab_id: 1 },
      { schema_version: 1, session_id: ids[0], origin: 'https://ekt.kz', tab_id: 0 },
      { schema_version: 1, session_id: ids[0], origin, tab_id: 0, message: 'must not persist' }];
    for (const value of bad) {
      const area = fakeArea();
      const key = sessionStorageKey(scope);
      area.data.set(key, value);
      expect(await createSessionStore(area, () => ids[1]).getOrCreate(scope)).toEqual({ session_id: ids[1], origin });
      expect(area.data.get(key)).toEqual({ schema_version: 1, session_id: ids[1], origin, tab_id: 0 });
      expect(area.set).toHaveBeenCalledTimes(1);
    }
  });

  test('concurrent first GETs converge and queued GET/RESET/GET preserve order', async () => {
    const area = fakeArea();
    const gate = deferred<Record<string, unknown>>();
    area.get.mockImplementationOnce(() => gate.promise);
    const store = createSessionStore(area, idFactory());
    const first = store.getOrCreate(scope);
    const second = store.getOrCreate(scope);
    await Promise.resolve();
    expect(area.get).toHaveBeenCalledTimes(1);
    gate.resolve({});
    expect((await first).session_id).toBe(ids[0]);
    expect((await second).session_id).toBe(ids[0]);
    expect(area.set).toHaveBeenCalledTimes(1);
    const before = store.getOrCreate(scope);
    const reset = store.reset(scope);
    const after = store.getOrCreate(scope);
    expect((await before).session_id).toBe(ids[0]);
    expect((await reset).session_id).toBe(ids[1]);
    expect((await after).session_id).toBe(ids[1]);
  });

  test('another key can finish while one key is blocked', async () => {
    const area = fakeArea();
    const gate = deferred<Record<string, unknown>>();
    area.get.mockImplementationOnce(() => gate.promise);
    const store = createSessionStore(area, idFactory());
    const waiting = store.getOrCreate(scope);
    await Promise.resolve();
    const independent = store.getOrCreate({ ...scope, tab_id: 2 });
    expect((await independent).origin).toBe(origin);
    gate.resolve({});
    await waiting;
    expect(area.get).toHaveBeenCalledTimes(2);
  });

  test('waits for write acknowledgment and recovers queue after failures', async () => {
    const area = fakeArea();
    const gate = deferred<void>();
    area.set.mockImplementationOnce(() => gate.promise);
    const store = createSessionStore(area, idFactory());
    let settled = false;
    const first = store.getOrCreate(scope).then((value) => { settled = true; return value; });
    await vi.waitFor(() => expect(area.set).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    gate.resolve();
    expect((await first).session_id).toBe(ids[0]);
    area.get.mockRejectedValueOnce(new Error('raw private data'));
    await expect(store.reset(scope)).rejects.toBeInstanceOf(SessionUnavailableError);
    expect((await store.getOrCreate(scope)).session_id).toBe(ids[1]);
    area.set.mockRejectedValueOnce(new Error('quota private data'));
    await expect(store.reset(scope)).rejects.toBeInstanceOf(SessionUnavailableError);
    expect((await store.getOrCreate(scope)).session_id).toBe(ids[1]);
  });

  test('fails safely for missing storage, invalid scope and ID-generation failures', async () => {
    await expect(createSessionStore().getOrCreate(scope)).rejects.toBeInstanceOf(SessionUnavailableError);
    await expect(createSessionStore().reset(scope)).rejects.toBeInstanceOf(SessionUnavailableError);
    const area = fakeArea();
    await expect(createSessionStore(area).getOrCreate({ ...scope, tab_id: Number.MAX_SAFE_INTEGER + 1 }))
      .rejects.toBeInstanceOf(SessionUnavailableError);
    expect(area.get).not.toHaveBeenCalled();
    await expect(createSessionStore(area, () => 'invalid').getOrCreate(scope))
      .rejects.toBeInstanceOf(SessionUnavailableError);
    await expect(createSessionStore(area, () => { throw new Error('private value'); }).getOrCreate(scope))
      .rejects.toBeInstanceOf(SessionUnavailableError);
    expect(area.set).not.toHaveBeenCalled();
  });
});
