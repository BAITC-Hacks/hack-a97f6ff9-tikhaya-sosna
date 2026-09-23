import {
  sessionDescriptorSchema,
  sessionRecordSchema,
  sessionScopeSchema,
  type SessionDescriptor,
  type SessionScope,
} from '../contracts/session';

export interface SessionArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SessionStore {
  getOrCreate(scope: SessionScope): Promise<SessionDescriptor>;
  reset(scope: SessionScope): Promise<SessionDescriptor>;
}

export class SessionUnavailableError extends Error {
  constructor() { super('Extension session storage is unavailable.'); }
}

export function sessionStorageKey(scope: SessionScope): string {
  const checked = sessionScopeSchema.safeParse(scope);
  if (!checked.success) throw new SessionUnavailableError();
  return `ekt-ai:session:v1:${checked.data.tab_id}:${encodeURIComponent(checked.data.origin)}`;
}

export function createSessionStore(
  area?: SessionArea,
  createId: () => string = () => crypto.randomUUID(),
): SessionStore {
  const queues = new Map<string, Promise<void>>();

  function enqueue(key: string, work: () => Promise<SessionDescriptor>): Promise<SessionDescriptor> {
    const prior = queues.get(key) ?? Promise.resolve();
    const operation = prior.then(work);
    const settled = operation.then(() => undefined, () => undefined);
    queues.set(key, settled);
    void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
    return operation;
  }

  function operate(scope: SessionScope, rotate: boolean): Promise<SessionDescriptor> {
    let key: string;
    try { key = sessionStorageKey(scope); } catch { return Promise.reject(new SessionUnavailableError()); }

    return enqueue(key, async () => {
      try {
        if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
          throw new SessionUnavailableError();
        }
        const values = await area.get(key);
        const existing = sessionRecordSchema.safeParse(values?.[key]);
        if (!rotate && existing.success &&
          existing.data.tab_id === scope.tab_id && existing.data.origin === scope.origin) {
          return sessionDescriptorSchema.parse({
            session_id: existing.data.session_id, origin: existing.data.origin,
          });
        }
        const record = sessionRecordSchema.parse({
          schema_version: 1, session_id: createId(), origin: scope.origin, tab_id: scope.tab_id,
        });
        await area.set({ [key]: record });
        return { session_id: record.session_id, origin: record.origin };
      } catch {
        throw new SessionUnavailableError();
      }
    });
  }

  return {
    getOrCreate: (scope) => operate(scope, false),
    reset: (scope) => operate(scope, true),
  };
}
