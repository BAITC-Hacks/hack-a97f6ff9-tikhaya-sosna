import { useEffect, useRef, useState } from 'react';
import ChatComposer from '../ChatComposer/ChatComposer';
import ChatLauncher from '../ChatLauncher/ChatLauncher';

const PANEL_ID = 'ekt-ai-chat-panel';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  function close() {
    composing.current = false;
    setOpen(false);
    launcherRef.current?.focus();
  }

  return (
    <div
      className="ekt-ai-widget"
      lang="ru"
      onCompositionStartCapture={() => { composing.current = true; }}
      onCompositionEndCapture={() => { composing.current = false; }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape' && !event.defaultPrevented &&
          !event.nativeEvent.isComposing && !composing.current) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {open && (
        <section id={PANEL_ID} className="ekt-ai-panel" role="dialog" aria-modal="false" aria-labelledby="ekt-ai-chat-title">
          <header className="ekt-ai-header">
            <div>
              <h2 id="ekt-ai-chat-title">EKT AI Assistant</h2>
              <p className="ekt-ai-subtitle">Помощник по каталогу</p>
            </div>
            <button type="button" className="ekt-ai-close" aria-label="Закрыть окно чата" onClick={close}>
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <p className="ekt-ai-preview">Предпросмотр интерфейса. Отправка сообщений пока не подключена.</p>
          <div className="ekt-ai-middle">
            <h3>Чем помочь?</h3>
            <p>Здесь можно будет уточнить наличие, характеристики и условия покупки.</p>
            <p className="ekt-ai-notice" role="status" aria-live="polite">{notice}</p>
          </div>
          <ChatComposer
            draft={draft}
            textareaRef={textareaRef}
            onDraftChange={(value) => { setDraft(value); setNotice(''); }}
            onSubmit={() => { setNotice('Отправка пока не подключена. Текст остался в поле ввода.'); }}
          />
        </section>
      )}
      <ChatLauncher expanded={open} panelId={PANEL_ID} buttonRef={launcherRef} onToggle={() => { if (open) close(); else setOpen(true); }} />
    </div>
  );
}
