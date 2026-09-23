import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'EKT AI Assistant',
    description: 'AI assistant for the EKT product catalog',
  },
});
