/**
 * Ctrl/Cmd + K command palette. Rendered inside the shared modal (focus trap, Esc,
 * inert background). Modal content renders above the inbox provider, so the caller
 * passes a snapshot of the messages in.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Icon } from '../shared/Icon';
import type { Message } from './api';

export interface Command { id: string; label: string; hint?: string; icon: string; group: string; run: () => void; keywords?: string }

export function CommandPalette({ commands, messages, onSearch, onReply }: {
  commands: Command[];
  messages: Message[];
  onSearch: (q: string) => void;
  onReply: (m: Message) => void;
}) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const needle = q.trim().toLowerCase();

  const items = useMemo<Command[]>(() => {
    const score = (c: Command) => {
      const hay = `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
      if (!needle) return 1;
      if (c.label.toLowerCase().startsWith(needle)) return 3;
      if (hay.includes(needle)) return 2;
      // loose subsequence match ("sts" -> "Settings")
      let i = 0;
      for (const ch of hay) if (ch === needle[i]) i++;
      return i === needle.length ? 1 : 0;
    };
    const out = commands.map((c) => [c, score(c)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    if (needle) {
      messages
        .filter((m) => [m.name, m.email, m.subject].some((v) => (v ?? '').toLowerCase().includes(needle)))
        .slice(0, 5)
        .forEach((m) => out.push({ id: `m-${m.id}`, group: 'Messages', icon: 'reply', label: `Reply to ${m.name}`, hint: m.subject || m.email, run: () => onReply(m) }));
      out.push({ id: 'search', group: 'Messages', icon: 'search', label: `Search messages for “${q.trim()}”`, run: () => onSearch(q.trim()) });
    }
    return out;
  }, [commands, messages, needle, q, onReply, onSearch]);

  const sel = Math.min(idx, Math.max(0, items.length - 1));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((sel + 1) % Math.max(1, items.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((sel - 1 + items.length) % Math.max(1, items.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
  };

  let lastGroup = '';
  return (
    <div className="palette">
      <label className="palette-input">
        <Icon id="search" />
        <span className="visually-hidden">Type a command or search</span>
        <input autoFocus value={q} placeholder="Type a command, page or person…" role="combobox" aria-expanded="true" aria-controls="paletteList"
          aria-activedescendant={items[sel] ? `pc-${items[sel].id}` : undefined}
          onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} />
        <kbd>Esc</kbd>
      </label>
      <ul className="palette-list" id="paletteList" role="listbox" aria-label="Commands">
        {items.map((c, i) => {
          const head = c.group !== lastGroup ? c.group : '';
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {head && <p className="palette-group" aria-hidden="true">{head}</p>}
              <div id={`pc-${c.id}`} role="option" aria-selected={i === sel} className={`palette-item${i === sel ? ' is-active' : ''}`}
                onMouseMove={() => i !== sel && setIdx(i)} onClick={() => c.run()}>
                <Icon id={c.icon} /><span className="palette-label">{c.label}</span>{c.hint && <span className="palette-hint">{c.hint}</span>}
              </div>
            </li>
          );
        })}
        {items.length === 0 && <li className="palette-empty">No matching commands.</li>}
      </ul>
      <p className="palette-foot mono"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> run</p>
    </div>
  );
}
