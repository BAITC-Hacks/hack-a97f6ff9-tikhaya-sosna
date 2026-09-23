import { browser } from 'wxt/browser';
import { registerRuntimeListener } from '../services/runtime-listener';
import { routeRuntimeMessage } from '../services/runtime-router';
import { createSessionStore } from '../storage/session-storage';

export default defineBackground(() => {
  const sessions = createSessionStore(browser.storage?.session);
  registerRuntimeListener(browser.runtime.onMessage, browser.runtime.id,
    (message, sender, runtimeId) => routeRuntimeMessage(message, sender, runtimeId, sessions));
});
