import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import ChatComposer from '../ChatComposer/ChatComposer';
import ChatLauncher from '../ChatLauncher/ChatLauncher';
import MessageList from '../MessageList/MessageList';
import { chatReducer, initialChatState } from '../../state/chat-reducer';
import { createChatService, type ChatService } from '../../services/chat-service';

const PANEL_ID = 'ekt-ai-chat-panel';

function errorCopy(code: string): string {
  switch (code) {
    case 'BACKEND_NOT_CONFIGURED': return 'Backend не настроен. Укажите адрес сервера и пересоберите расширение.';
    case 'BACKEND_TIMEOUT': return 'Ответ не получен вовремя. Сервер мог обработать запрос. Повторная отправка — только вручную.';
    case 'BACKEND_INVALID_RESPONSE': case 'INVALID_RESPONSE': return 'Сервер вернул неподдерживаемый ответ. Текст сохранён в поле ввода.';
    case 'BACKEND_ACCESS_DENIED': return 'Сервер отклонил доступ. Проверьте настройку backend.';
    case 'CHAT_SESSION_MISMATCH': case 'PAGE_CONTEXT_CHANGED': case 'PAGE_CONTEXT_UNAVAILABLE':
      return 'Контекст диалога изменился. Отправьте сообщение ещё раз.';
    default: return 'Не удалось связаться с сервером. Текст сохранён в поле ввода.';
  }
}

export default function ChatWidget({ service }: { service?: ChatService }) {
  const actualService = useMemo(() => service ?? createChatService(), [service]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [status, setStatus] = useState('');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const [followToken, setFollowToken] = useState<string | null>(null);

  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => { if (open) textareaRef.current?.focus(); }, [open]);

  function close() {
    composing.current = false;
    setOpen(false);
    launcherRef.current?.focus();
  }

  function submit(text: string) {
    if (busy.current) return;
    busy.current = true;
    const currentGeneration = generation.current;
    const token = crypto.randomUUID();
    dispatch({ type: 'SUBMIT', token, id: crypto.randomUUID(), text });
    setFollowToken(token);
    setStatus('Ожидаем ответ…');
    void actualService.sendMessage(text, (sessionId) => {
      if (generation.current === currentGeneration) dispatch({ type: 'PREPARED', token, sessionId });
    }).then((result) => {
      if (generation.current !== currentGeneration) return;
      if (result.ok) {
        dispatch({ type: 'SUCCEEDED', token, id: crypto.randomUUID(), reply: result.data });
        setDraft((current) => current === text ? '' : current);
        setStatus('');
      } else {
        const copy = errorCopy(result.error.code);
        dispatch({ type: 'FAILED', token, error: copy });
        setStatus(copy);
      }
    }, () => {
      if (generation.current !== currentGeneration) return;
      const copy = errorCopy('RUNTIME_UNAVAILABLE');
      dispatch({ type: 'FAILED', token, error: copy });
      setStatus(copy);
    }).finally(() => { if (generation.current === currentGeneration) busy.current = false; });
  }

  return (
    <div className="ekt-ai-widget" lang="ru"
      onCompositionStartCapture={() => { composing.current = true; }}
      onCompositionEndCapture={() => { composing.current = false; }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape' && !event.defaultPrevented &&
          !event.nativeEvent.isComposing && !composing.current) {
          event.preventDefault(); event.stopPropagation(); close();
        }
      }}>
      {open && <section id={PANEL_ID} className="ekt-ai-panel" role="dialog" aria-modal="false" aria-labelledby="ekt-ai-chat-title">
        <header className="ekt-ai-header"><div><h2 id="ekt-ai-chat-title">EKT AI Assistant</h2>
          <p className="ekt-ai-subtitle">Помощник по каталогу</p></div>
          <button type="button" className="ekt-ai-close" aria-label="Закрыть окно чата" onClick={close}>
            <span aria-hidden="true">×</span></button></header>
        {state.sessionNotice && <p className="ekt-ai-session-notice">{state.sessionNotice}</p>}
        <MessageList turns={state.turns} followToken={followToken} />
        <p className="ekt-ai-status" role="status" aria-live="polite">{status}</p>
        <ChatComposer draft={draft} pending={state.activeToken !== null} textareaRef={textareaRef}
          onDraftChange={(value) => { setDraft(value); if (!busy.current) setStatus(''); }} onSubmit={submit} />
      </section>}
      <ChatLauncher expanded={open} panelId={PANEL_ID} buttonRef={launcherRef}
        onToggle={() => { if (open) close(); else setOpen(true); }} />
    </div>
  );
}
