import { createRoot } from 'react-dom/client';
import App from '../components/App';

export interface WidgetMount {
  unmount: () => void;
}

export function mountWidget(container: HTMLElement): WidgetMount {
  const wrapper = container.ownerDocument.createElement('div');
  wrapper.id = 'ekt-ai-assistant-react-root';
  container.append(wrapper);
  const root = createRoot(wrapper);
  root.render(<App />);
  let mounted = true;

  return {
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
      wrapper.remove();
    },
  };
}
