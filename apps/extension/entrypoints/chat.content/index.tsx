import { mountWidget } from '../../services/widget-mount';
import './style.css';

export default defineContentScript({
  matches: ['https://ekt.kz/*', 'https://*.ekt.kz/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ekt-ai-assistant-shadow-root',
      position: 'inline',
      anchor: 'body',
      isolateEvents: true,
      onMount: mountWidget,
      onRemove(widget) {
        widget?.unmount();
      },
    });

    ui.mount();
  },
});
