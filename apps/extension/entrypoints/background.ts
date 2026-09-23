import { browser } from 'wxt/browser';
import { registerRuntimeListener } from '../services/runtime-listener';

export default defineBackground(() => {
  registerRuntimeListener(browser.runtime.onMessage, browser.runtime.id);
});
