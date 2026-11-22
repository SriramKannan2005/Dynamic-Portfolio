import { useEffect, useState } from 'react';
import { Icon } from '../shared/Icon';
import { Select } from '../shared/Select';
import { useModal } from '../shared/Modal';
import { callFunction, fetchReplies, recordReply, msgDate, logAction, getTemplates, saveTemplates, fillTemplate, type Message, type Reply, type Template } from './api';
import { useToast } from './feedback';

/** On-device Gemini Nano via Chrome's Prompt API (new `LanguageModel` or legacy `window.ai`). */
async function nanoDraft(prompt: string): Promise<string | null> {
  const g = globalThis as unknown as {
    LanguageModel?: { availability(): Promise<string>; create(): Promise<{ prompt(p: string): Promise<string>; destroy?(): void }> };
    ai?: { languageModel?: { capabilities(): Promise<{ available: string }>; create(): Promise<{ prompt(p: string): Promise<string>; destroy?(): void }> } };
  };
  try {
    if (g.LanguageModel?.availability && (await g.LanguageModel.availability()) === 'available') {
      const s = await g.LanguageModel.create();
      try { return (await s.prompt(prompt)).trim() || null; } finally { s.destroy?.(); }
    }
    const legacy = g.ai?.languageModel;
    if (legacy && (await legacy.capabilities()).available === 'readily') {
      const s = await legacy.create();
      try { return (await s.prompt(prompt)).trim() || null; } finally { s.destroy?.(); }
    }
  } catch { /* fall through to the server */ }
  return null;
}

function nanoPrompt(m: Message, prev: Reply[]) {
  return [
    'Draft a concise, warm, professional email reply (80-160 words) from Sriram Kannan, an AI/ML developer and final-year AI & DS student.',
    'Plain text, no subject line, no invented facts or commitments. Sign off as "Sriram Kannan".',
    `From: ${m.name} <${m.email}>`, `Category: ${m.category ?? 'General'}`, m.subject ? `Subject: ${m.subject}` : '',
    'Message:', m.message.slice(0, 4000),
    prev.length ? `Already replied:\n${prev.map((r) => r.replyContent.slice(0, 800)).join('\n---\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function ReplyModal({ message, onReplied }: { message: Message; onReplied: () => void }) {
  const toast = useToast();
  const modal = useModal();
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [subject, setSubject] = useState(`Re: ${message.subject || 'Your message on my portfolio'}`);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState<'' | 'draft' | 'send'>('');
  const [gmailOpened, setGmailOpened] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [naming, setNaming] = useState<string | null>(null);

  useEffect(() => {
    fetchReplies(message.id).then(setReplies).catch(() => setReplies([]));
    getTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [message.id]);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setDraft(fillTemplate(t.body, message));
    setSource(`template “${t.name}”`);
  };
  const saveAsTemplate = async () => {
    const name = (naming ?? '').trim();
    if (!name) { toast('error', 'Give the template a name'); return; }
    // Store the generic form: put the placeholder back where the sender's first name was
    const first = (message.name ?? '').trim().split(/\s+/)[0];
    const body = first ? draft.split(first).join('{firstName}') : draft;
    const next = [...templates, { id: `t${Date.now().toString(36)}`, name, body }];
    try {
      await saveTemplates(next);
      setTemplates(next);
      setNaming(null);
      toast('success', 'Template saved', `“${name}” is available for every reply.`);
      logAction('templates.save', `Added reply template “${name}”`);
    } catch (e) { toast('error', 'Could not save the template', (e as Error).message); }
  };

  const generate = async () => {
    setBusy('draft');
    try {
      const local = await nanoDraft(nanoPrompt(message, replies ?? []));
      if (local) { setDraft(local); setSource('Gemini Nano (on-device)'); return; }
      const res = await callFunction<{ draft: string; model: string }>('ai-draft', {
        body: {
          message: { name: message.name, email: message.email, subject: message.subject, message: message.message, category: message.category },
          previousReplies: (replies ?? []).map((r) => r.replyContent),
        },
      });
      setDraft(res.draft);
      setSource(`Gemini API (${res.model})`);
    } catch (e) {
      toast('error', 'Could not generate a draft', (e as Error).message);
    } finally { setBusy(''); }
  };

  const send = async () => {
    if (draft.trim().length < 2) { toast('error', 'Write a reply first'); return; }
    setBusy('send');
    try {
      await callFunction('send-reply', { body: { to: message.email, subject, body: draft } });
      await recordReply(message, subject, draft, 'apps-script');
      logAction('reply.send', `Replied to ${message.name} <${message.email}>: ${subject}`);
      toast('success', 'Reply sent', `Delivered to ${message.email}`);
      onReplied();
      modal.close();
    } catch (e) {
      toast('error', 'Send failed', `${(e as Error).message} Try “Open in Gmail” instead.`);
    } finally { setBusy(''); }
  };

  const openGmail = () => {
    const e = encodeURIComponent;
    const w = window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${e(message.email)}&su=${e(subject)}&body=${e(draft)}`, '_blank');
    if (w) { try { w.opener = null; } catch { /* ignore */ } }
    setGmailOpened(true);
  };
  const confirmGmail = async () => {
    try {
      await recordReply(message, subject, draft, 'gmail');
      logAction('reply.gmail', `Replied via Gmail to ${message.name} <${message.email}>: ${subject}`);
      toast('success', 'Marked as replied');
      onReplied();
      modal.close();
    } catch (e) { toast('error', 'Could not save the reply', (e as Error).message); }
  };

  return (
    <div className="reply">
      <h2 id="modalTitle">Reply to {message.name}</h2>
      <section className="reply-original" aria-label="Original message">
        <p className="reply-meta mono">{message.email} · {message.category ?? 'General'} · {msgDate(message)?.toLocaleString() ?? ''}</p>
        {message.subject && <p className="reply-subj"><b>{message.subject}</b></p>}
        <p className="reply-text">{message.message}</p>
      </section>
      <section aria-label="Previous replies">
        <h3 className="reply-h">Previous replies</h3>
        {replies === null ? <p className="muted">Loading…</p> : replies.length === 0 ? <p className="muted">None yet.</p> : (
          <ol className="reply-history">
            {replies.map((r) => (
              <li key={r.id}><p className="reply-meta mono">{new Date(r.sentAt).toLocaleString()} · via {r.via ?? 'email'}</p><p className="reply-text">{r.replyContent}</p></li>
            ))}
          </ol>
        )}
      </section>
      <div className="field">
        <input id="rp-subject" placeholder=" " value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        <label htmlFor="rp-subject">Subject</label>
      </div>
      <div className="tpl-row">
        <Select label="Insert template" value={null} onChange={applyTemplate} className="dd-wide"
          placeholder={templates.length ? 'Choose a template…' : 'No templates'} disabled={!templates.length}
          options={templates.map((t) => ({ value: t.id, label: t.name }))} />
        {naming === null ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={!draft.trim()} onClick={() => setNaming('')}><Icon id="plus" /><span>Save as template</span></button>
        ) : (
          <span className="tpl-name">
            <label className="visually-hidden" htmlFor="tpl-name">Template name</label>
            <input id="tpl-name" autoFocus maxLength={80} placeholder="Template name" value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveAsTemplate(); } if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); } }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveAsTemplate}>Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(null)}>Cancel</button>
          </span>
        )}
      </div>
      <div className="field">
        <textarea id="rp-body" placeholder=" " rows={9} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={10000} />
        <label htmlFor="rp-body">Reply</label>
      </div>
      {source && <p className="muted reply-source">Draft from {source}. Review before sending.</p>}
      <div className="reply-actions">
        <button type="button" className="btn btn-ghost" onClick={generate} disabled={!!busy}><Icon id="spark" /><span>{busy === 'draft' ? 'Generating…' : draft ? 'Regenerate draft' : 'Generate draft'}</span></button>
        <button type="button" className="btn btn-ghost" onClick={openGmail} disabled={!!busy || !draft.trim()}><Icon id="ext" /><span>Open in Gmail</span></button>
        <button type="button" className="btn btn-primary" onClick={send} disabled={!!busy || !draft.trim()}><Icon id="mail" /><span>{busy === 'send' ? 'Sending…' : 'Send'}</span></button>
      </div>
      {gmailOpened && (
        <p className="reply-gmail">Sent it from Gmail? <button type="button" className="btn btn-ghost" onClick={confirmGmail}>Mark as replied</button></p>
      )}
    </div>
  );
}
