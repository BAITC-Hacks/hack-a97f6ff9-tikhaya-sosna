import type { Ref } from 'react';

interface ChatLauncherProps {
  expanded: boolean;
  panelId: string;
  buttonRef: Ref<HTMLButtonElement>;
  onToggle: () => void;
}

export default function ChatLauncher({ expanded, panelId, buttonRef, onToggle }: ChatLauncherProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="ekt-ai-launcher"
      aria-label="Чат EKT AI Assistant"
      aria-expanded={expanded}
      aria-controls={expanded ? panelId : undefined}
      onClick={onToggle}
    >
      <svg aria-hidden="true" focusable="false" width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7 9h10M7 13h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
