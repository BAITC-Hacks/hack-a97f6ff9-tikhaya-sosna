import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatTurn } from '../../state/chat-reducer';
import ProductCard from '../ProductCard/ProductCard';

export default function MessageList({ turns, followToken }: { turns: ChatTurn[]; followToken: string | null }) {
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const previousFollow = useRef<string | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (nearBottom.current || (followToken !== null && followToken !== previousFollow.current)) {
      list.scrollTop = list.scrollHeight;
      nearBottom.current = true;
      setShowLatest(false);
    } else {
      setShowLatest(list.scrollHeight > list.clientHeight);
    }
    previousFollow.current = followToken;
  }, [turns, followToken]);

  return <div className="ekt-ai-log-wrap">
    <div className="ekt-ai-log" role="log" aria-label="Сообщения чата" aria-live="off" ref={listRef}
      onScroll={(event) => {
        const node = event.currentTarget;
        nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        setShowLatest(!nearBottom.current);
      }}>
      {turns.length === 0 && <div className="ekt-ai-empty"><h3>Чем помочь?</h3><p>Спросите о товарах каталога.</p></div>}
      {turns.map((turn) => <div key={turn.id} className={`ekt-ai-turn ekt-ai-turn-${turn.role}`}>
        <p className="ekt-ai-turn-label">{turn.role === 'user' ? 'Вы' : 'Помощник'}</p>
        <p className="ekt-ai-message-text">{turn.text}</p>
        {turn.role === 'user' && turn.status === 'failed' && <p className="ekt-ai-turn-error">Нет подтверждённого ответа. {turn.error}</p>}
        {turn.role === 'assistant' && <>
          {turn.reply.products.map((product) => <ProductCard key={product.id} product={product} />)}
          {turn.reply.cart_proposal_received && <p>Добавление в корзину здесь пока недоступно.</p>}
        </>}
      </div>)}
    </div>
    {showLatest && <button type="button" className="ekt-ai-latest" onClick={() => {
      const list = listRef.current;
      if (list) { list.scrollTop = list.scrollHeight; nearBottom.current = true; setShowLatest(false); }
    }}>К последним сообщениям</button>}
  </div>;
}
