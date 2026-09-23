import { defineConfig } from 'wxt';
import { backendHostPermissions, resolveBackendConfig } from './config/backend';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: () => ({
    name: 'EKT AI Assistant',
    description: 'AI assistant for the EKT product catalog',
    permissions: ['storage'],
    host_permissions: backendHostPermissions(resolveBackendConfig(process.env.WXT_BACKEND_BASE_URL)),
  }),
});
