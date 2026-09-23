import { browser } from 'wxt/browser';
import { registerRuntimeListener } from '../services/runtime-listener';
import { createRuntimeRouter } from '../services/runtime-router';
import { createSessionStore } from '../storage/session-storage';
import { createBackendClient } from '../services/backend-client';
import { resolveBackendConfig } from '../config/backend';

export default defineBackground(() => {
  const sessions = createSessionStore(browser.storage?.session);
  const backend = createBackendClient({ config: resolveBackendConfig(import.meta.env.WXT_BACKEND_BASE_URL) });
  registerRuntimeListener(browser.runtime.onMessage, browser.runtime.id, createRuntimeRouter({ sessions, backend }));
});
