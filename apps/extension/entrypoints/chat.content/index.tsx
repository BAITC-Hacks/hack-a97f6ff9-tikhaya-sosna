import { createRoot } from 'react-dom/client';
import App from '../../components/App';
import './style.css';

export default defineContentScript({
  matches: ['https://ekt.kz/*', 'https://*.ekt.kz/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ekt-ai-assistant-shadow-root',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const mountPoint = document.createElement('div');
        mountPoint.id = 'ekt-ai-assistant-react-root';
        container.append(mountPoint);

        const root = createRoot(mountPoint);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
