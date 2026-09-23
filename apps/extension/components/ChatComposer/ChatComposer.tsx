import { useRef, type Ref } from 'react';
import { isValidChatMessage, MAX_CHAT_MESSAGE_UNITS } from '../../contracts/limits';

interface ChatComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSubmit: (draft: string) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  pending?: boolean;
}

export default function ChatComposer({ draft, onDraftChange, onSubmit, textareaRef, pending = false }: ChatComposerProps) {
  const composing = useRef(false);
  const tooLong = draft.length > MAX_CHAT_MESSAGE_UNITS;
  const canSubmit = !pending && isValidChatMessage(draft);

  return (
    <form
      className="ekt-ai-composer"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (canSubmit) onSubmit(draft);
      }}
    >
      <label htmlFor="ekt-ai-draft">Ваш вопрос</label>
      <textarea
        ref={textareaRef}
        id="ekt-ai-draft"
        rows={3}
        value={draft}
        readOnly={pending}
        placeholder="Например: есть ли кабель ВВГ 3×2,5?"
        aria-invalid={tooLong}
        aria-describedby={`ekt-ai-draft-hint ekt-ai-draft-count${tooLong ? ' ekt-ai-draft-error' : ''}`}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (
            event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
            event.defaultPrevented || event.nativeEvent.isComposing || composing.current
          ) return;
          event.preventDefault();
          // Native form submission gives Enter and the button one validation path.
          event.currentTarget.form?.requestSubmit();
        }}
      />
      <p id="ekt-ai-draft-hint" className="ekt-ai-hint">Enter — отправить, Shift+Enter — новая строка.</p>
      {tooLong && <p id="ekt-ai-draft-error" className="ekt-ai-error">Текст слишком длинный. Максимум — 8000.</p>}
      <div className="ekt-ai-composer-actions">
        <span id="ekt-ai-draft-count" className="ekt-ai-hint">{draft.length} / {MAX_CHAT_MESSAGE_UNITS}</span>
        <button type="submit" className="ekt-ai-submit" disabled={!canSubmit}>Отправить</button>
      </div>
    </form>
  );
}
