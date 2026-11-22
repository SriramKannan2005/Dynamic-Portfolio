import { useRef, useState, type FormEvent } from 'react';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { firebaseConfigured } from '../shared/firebase';
import { content } from './content';
import { prefersReduced } from './lib/ui.js';
import { ResumeButton } from './Resume';
import { classifyMessage } from '../shared/categories';

// No topic picker: the category is derived from the subject and message keywords on send.
type Fields = { name: string; email: string; subject: string; message: string };
type Errors = Partial<Record<keyof Fields, string>>;
const EMPTY: Fields = { name: '', email: '', subject: '', message: '' };

function validate(f: Fields): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Please enter a valid email address.';
  if (f.subject.length > 150) e.subject = 'Keep the subject under 150 characters.';
  if (f.message.trim().length < 10) e.message = 'Your message should be at least 10 characters.';
  else if (f.message.length > 5000) e.message = 'Please keep it under 5000 characters.';
  return e;
}

function mailUrls(to: string, f: Fields) {
  const subject = f.subject.trim() || `Portfolio enquiry from ${f.name.trim()}`;
  const body = `${f.message.trim()}\n\n${f.name.trim()}\n${f.email.trim()}`;
  const e = encodeURIComponent;
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}&su=${e(subject)}&body=${e(body)}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`,
    mailto: `mailto:${to}?subject=${e(subject)}&body=${e(body)}`,
  };
}

function openMail(url: string, via: string) {
  if (via === 'mailto') { window.location.href = url; return; }
  // No 'noopener' feature: with it window.open always returns null.
  const w = window.open(url, '_blank');
  if (w) { try { w.opener = null; } catch { /* cross-origin */ } } else window.location.href = url;
}

const MAIL_OPTS = [
  { via: 'gmail', title: 'Gmail', note: 'Opens Gmail compose in a new tab' },
  { via: 'outlook', title: 'Outlook', note: 'Opens Outlook on the web in a new tab' },
  { via: 'mailto', title: 'Default mail app', note: 'Uses your device’s mail application' },
] as const;

export function Contact() {
  const [f, setF] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<'form' | 'sending' | 'done'>('form');
  const [delivered, setDelivered] = useState(false);
  const [sent, setSent] = useState<Fields | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const sendBtn = useRef<HTMLButtonElement>(null);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), subject: useRef<HTMLInputElement>(null), message: useRef<HTMLTextAreaElement>(null) };
  const modal = useModal();
  const to = content.profile.email;

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = { ...f, [k]: e.target.value } as Fields;
    setF(next);
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: validate(next)[k] }));
  };
  const blur = (k: keyof Fields) => () => { if (f[k]) setErrors((prev) => ({ ...prev, [k]: validate(f)[k] })); };

  const finish = (wasDelivered: boolean, data: Fields) => {
    setDelivered(wasDelivered);
    setSent(data);
    setPhase('done');
    requestAnimationFrame(() => successRef.current?.focus());
  };

  const chooser = (data: Fields, origin: HTMLElement | null, fallback: boolean) => {
    const urls = mailUrls(to, data);
    modal.open(
      <div className="chooser">
        <h2 id="modalTitle">Send with…</h2>
        <p>{fallback ? 'The message could not be delivered from the site, so pick a mail app to send it yourself.' : 'Your message is ready. Pick where to open it; you’ll press send there.'}</p>
        <div className="chooser-list">
          {MAIL_OPTS.map((o, i) => (
            <button key={o.via} type="button" className="chooser-opt" {...(i === 0 ? { autoFocus: true } : {})}
              onClick={() => { openMail(urls[o.via], o.via); modal.close(); if (fallback) finish(false, data); }}>
              <Icon id="mail" /><span><b>{o.title}</b><small>{o.note}</small></span>
            </button>
          ))}
        </div>
      </div>,
      { origin, narrow: true },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    const firstBad = (Object.keys(refs) as (keyof typeof refs)[]).find((k) => errs[k]);
    if (firstBad) { refs[firstBad].current?.focus(); return; }
    const data = { ...f, name: f.name.trim(), email: f.email.trim(), subject: f.subject.trim(), message: f.message.trim() };

    if (!firebaseConfigured) { chooser(data, sendBtn.current, true); return; }
    setPhase('sending');
    const minAnim = new Promise((r) => setTimeout(r, prefersReduced() ? 0 : 2300));
    try {
      const { saveMessage } = await import('./tracking');
      await Promise.race([saveMessage({ ...data, category: classifyMessage(data.subject, data.message) }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))]);
      await minAnim;
      finish(true, data);
    } catch {
      await minAnim;
      setPhase('form');
      chooser(data, sendBtn.current, true);
    }
  };

  const reset = () => { setF(EMPTY); setErrors({}); setSent(null); setPhase('form'); requestAnimationFrame(() => refs.name.current?.focus()); };

  const field = (k: 'name' | 'email' | 'subject', label: string, type = 'text', auto?: string) => (
    <div className={`field${errors[k] ? ' is-invalid' : ''}`}>
      <input id={`cf-${k}`} ref={refs[k]} name={k} type={type} autoComplete={auto} placeholder=" " value={f[k]}
        onChange={set(k)} onBlur={blur(k)} aria-invalid={!!errors[k]} aria-describedby={`cf-${k}-err`} />
      <label htmlFor={`cf-${k}`}>{label}</label>
      <p className="field-err" id={`cf-${k}-err`} role="alert">{errors[k]}</p>
    </div>
  );

  return (
    <section className="section" id="contact" aria-labelledby="contactTitle">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="kicker mono">07 · Contact</p>
          <h2 id="contactTitle">Let's build something.</h2>
          <p className="section-sub">Internships, full-time roles, collaborations or a question about a project. Your message lands straight in my inbox.</p>
        </header>
        <div className="contact-grid">
          <div className={`contact-card glass${phase === 'sending' ? ' is-sending' : ''}`} data-reveal>
            {phase !== 'done' && (
              <form className="contact-form" noValidate onSubmit={submit} aria-busy={phase === 'sending'}>
                {field('name', 'Your name', 'text', 'name')}
                {field('email', 'Your email', 'email', 'email')}
                {field('subject', 'Subject (optional)')}
                <div className={`field${errors.message ? ' is-invalid' : ''}`}>
                  <textarea id="cf-message" ref={refs.message} name="message" rows={5} placeholder=" " value={f.message}
                    onChange={set('message')} onBlur={blur('message')} aria-invalid={!!errors.message} aria-describedby="cf-message-err" />
                  <label htmlFor="cf-message">Message</label>
                  <p className="field-err" id="cf-message-err" role="alert">{errors.message}</p>
                </div>
                <button ref={sendBtn} className="btn btn-primary magnetic btn-send" type="submit" disabled={phase === 'sending'}>
                  <span>{phase === 'sending' ? 'Sending…' : 'Send message'}</span><Icon id="arrow" />
                </button>
              </form>
            )}
            <div className="envelope-stage" aria-hidden="true">
              <div className="envelope">
                <div className="env-back" /><div className="env-letter"><span /><span /><span /></div><div className="env-front" /><div className="env-flap" />
              </div>
            </div>
            {phase === 'done' && sent && (
              <div className="contact-success" ref={successRef} tabIndex={-1} role="status">
                <span className="success-icon"><Icon id="check" /></span>
                <h3>{delivered ? 'Message delivered' : 'Your draft is ready'}</h3>
                <p>{delivered
                  ? 'Thanks! It’s in my inbox and I’ll reply to your email soon. Want a copy in your own mail app too?'
                  : 'Your mail app should now be open with the message filled in. Press send there and I’ll reply soon.'}</p>
                {delivered && (
                  <div className="success-actions">
                    {MAIL_OPTS.map((o) => (
                      <button key={o.via} type="button" className="btn btn-ghost" onClick={() => openMail(mailUrls(to, sent)[o.via], o.via)}>
                        <Icon id="mail" /><span>{o.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn btn-ghost" type="button" onClick={reset}>Write another message</button>
              </div>
            )}
          </div>
          <aside className="contact-aside" data-reveal aria-label="Direct contact">
            <a className="contact-line glass" href={`mailto:${to}`}><Icon id="mail" /><span><small className="mono">Email</small>{to}</span></a>
            <a className="contact-line glass" href={content.profile.links.linkedin} target="_blank" rel="noopener"><Icon id="linkedin" /><span><small className="mono">LinkedIn</small>in/sriramkannan-ai</span></a>
            <a className="contact-line glass" href={content.profile.links.github} target="_blank" rel="noopener"><Icon id="github" /><span><small className="mono">GitHub</small>SriramKannan2005</span></a>
            <ResumeButton className="contact-line glass"><Icon id="download" /><span><small className="mono">Resume</small>Choose a version</span></ResumeButton>
            <p className="contact-line glass static"><Icon id="pin" /><span><small className="mono">Based in</small>{content.profile.location}, India</span></p>
          </aside>
        </div>
      </div>
    </section>
  );
}
