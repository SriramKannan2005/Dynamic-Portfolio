/**
 * Content manager: live edits on top of data/*.json, stored in siteContent/live.
 * Only what differs from the repo is saved, so "Reset all" is exact and the
 * document stays small. The public site loads changes on its next page load
 * (or when a visitor comes back to the tab).
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../shared/Icon';
import { projects as baseProjects } from '../site/content';
import { DEFAULT_AVAILABILITY, LIMITS, SECTION_KEYS, safeUrl, type ProjectOverride, type SectionKey, type SiteOverrides } from '../shared/siteContent';
import { getOverrides, saveOverrides, resetOverrides, logAction } from './api';
import { useConfirm, useToast } from './feedback';
import { SECTION_META, SectionEditor, normalizeSections, sectionEdited, type SectionDraft } from './ContentSections';

interface Draft {
  availability: { open: boolean; text: string };
  announcement: { enabled: boolean; text: string; link: string };
  projects: Record<string, ProjectOverride>;
  sections: SectionDraft;
}
const toDraft = (o: SiteOverrides | null): Draft => ({
  availability: { open: o?.availability?.open ?? true, text: o?.availability?.text ?? '' },
  announcement: { enabled: !!o?.announcement?.enabled, text: o?.announcement?.text ?? '', link: o?.announcement?.link ?? '' },
  projects: JSON.parse(JSON.stringify(o?.projects ?? {})),
  sections: JSON.parse(JSON.stringify(o?.sections ?? {})),
});

/** Keep only what differs from the repo content. */
function normalize(d: Draft): Omit<SiteOverrides, 'updatedAt' | 'updatedBy'> {
  const projects: Record<string, ProjectOverride> = {};
  for (const p of baseProjects) {
    const x = d.projects[p.id];
    if (!x) continue;
    const o: ProjectOverride = {};
    if (x.hidden) o.hidden = true;
    if (typeof x.featured === 'boolean' && x.featured !== !!p.featured) o.featured = x.featured;
    if (typeof x.order === 'number' && Number.isFinite(x.order) && x.order !== (p.order ?? 99)) o.order = x.order;
    if (typeof x.badge === 'string' && x.badge.trim() !== (p.badge ?? '')) o.badge = x.badge.trim().slice(0, LIMITS.badge);
    if (x.hook?.trim() && x.hook.trim() !== p.hook) o.hook = x.hook.trim().slice(0, LIMITS.hook);
    if (x.description?.trim() && x.description.trim() !== p.description) o.description = x.description.trim().slice(0, LIMITS.description);
    if (x.demo?.trim() && x.demo.trim() !== (p.links?.demo ?? '')) o.demo = x.demo.trim();
    if (Object.keys(o).length) projects[p.id] = o;
  }
  const out: Omit<SiteOverrides, 'updatedAt' | 'updatedBy'> = {};
  const av = { open: d.availability.open, text: d.availability.text.trim().slice(0, LIMITS.availability) };
  if (!av.open || av.text) out.availability = av;
  const an = d.announcement;
  if (an.enabled || an.text.trim()) out.announcement = { enabled: an.enabled && !!an.text.trim(), text: an.text.trim().slice(0, LIMITS.announcement), link: an.link.trim() };
  if (Object.keys(projects).length) out.projects = projects;
  const sections = normalizeSections(d.sections);
  if (sections) out.sections = sections;
  return out;
}

/** Firestore errors in plain words. */
function explain(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return 'Firestore refused the change. Publish the latest firestore.rules from the repo (Firebase console > Firestore > Rules) and make sure you are signed in with the admin account.';
  if (code === 'unauthenticated') return 'Your session has expired. Sign out and sign in again.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Could not reach Firestore. Check the connection and try again.';
  if (code === 'invalid-argument') return `Firestore rejected the data: ${(e as Error).message}`;
  return (e as Error)?.message || 'Unknown error';
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch-knob" /><span className="visually-hidden">{label}</span>
    </button>
  );
}

/** Number box you can clear while typing (an empty box keeps the repo order). */
function OrderInput({ value, fallback, onChange, label }: { value?: number; fallback: number; onChange: (v: number | undefined) => void; label: string }) {
  const [text, setText] = useState(String(value ?? fallback));
  useEffect(() => { if (text !== '' && Number(text) !== (value ?? fallback)) setText(String(value ?? fallback)); /* outside reset */ }, [value, fallback]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="num-input" type="number" min={0} max={999} value={text} aria-label={label}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? undefined : Math.max(0, Math.min(999, Math.round(Number(e.target.value))))); }}
      onBlur={() => { if (text === '') setText(String(fallback)); }} />
  );
}

type View = 'live' | 'projects' | SectionKey;

export function ContentTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [saved, setSaved] = useState<SiteOverrides | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [view, setView] = useState<View>('live');
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    getOverrides().then((o) => { setSaved(o); setDraft(toDraft(o)); })
      .catch((e) => { setSaved(null); setError(`Could not load the current content. ${explain(e)}`); });
  };
  useEffect(load, []);

  const norm = useMemo(() => normalize(draft), [draft]);
  const savedNorm = useMemo(() => normalize(toDraft(saved ?? null)), [saved]);
  const dirty = JSON.stringify(norm) !== JSON.stringify(savedNorm);

  // Warn before closing the tab with unpublished edits
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const badUrls = [
    ...(draft.announcement.link.trim() && !safeUrl(draft.announcement.link) ? ['announcement link'] : []),
    ...baseProjects.flatMap((p) => {
      const x = draft.projects[p.id] ?? {};
      return x.demo?.trim() && !safeUrl(x.demo) ? [`${p.title} demo`] : [];
    }),
  ];

  const setP = (id: string, patch: Partial<ProjectOverride>) => setDraft((d) => ({ ...d, projects: { ...d.projects, [id]: { ...d.projects[id], ...patch } } }));
  const resetP = (id: string) => setDraft((d) => { const n = { ...d.projects }; delete n[id]; return { ...d, projects: n }; });
  const setS = (k: SectionKey, v: unknown) => setDraft((d) => ({ ...d, sections: { ...d.sections, [k]: v } }));
  const resetS = (k: SectionKey) => setDraft((d) => { const n = { ...d.sections }; delete n[k]; return { ...d, sections: n }; });

  const save = async () => {
    if (badUrls.length) { toast('error', 'Fix the links first', `Use https:// or a site path (/…): ${badUrls.join(', ')}`); return; }
    setBusy(true);
    try {
      const res = await saveOverrides(norm);
      setSaved(res);
      setDraft(toDraft(res));
      const changed = Object.keys(norm.projects ?? {}).length;
      const secs = Object.keys(norm.sections ?? {}).map((k) => SECTION_META[k as SectionKey].label.toLowerCase());
      const parts = [norm.availability ? 'availability' : '', norm.announcement?.enabled ? 'announcement on' : '', changed ? `${changed} project${changed === 1 ? '' : 's'} customised` : '', ...secs].filter(Boolean);
      logAction('content.save', `Published site content: ${parts.join(', ') || 'defaults'}`);
      toast('success', 'Published', 'Reload the site (or switch back to its tab) to see the changes.');
    } catch (e) { toast('error', 'Could not publish', explain(e)); }
    finally { setBusy(false); }
  };
  const resetAll = async (origin: HTMLElement) => {
    const ok = await confirm({ title: 'Reset all site content?', text: 'Every live edit is removed and the site goes back to exactly what is in the repository (data/*.json).', confirmLabel: 'Reset', danger: true, origin });
    if (!ok) return;
    setBusy(true);
    try { await resetOverrides(); setSaved(null); setDraft(toDraft(null)); logAction('content.reset', 'Reset site content to the repository defaults'); toast('success', 'Site content reset'); }
    catch (e) { toast('error', 'Reset failed', explain(e)); }
    finally { setBusy(false); }
  };

  const shownCount = baseProjects.filter((p) => !draft.projects[p.id]?.hidden).length;
  const liveEdited = !!(norm.availability || norm.announcement);
  const projEdited = !!norm.projects;
  const views: { id: View; label: string; edited: boolean }[] = [
    { id: 'live', label: 'Status & banner', edited: liveEdited },
    { id: 'projects', label: 'Projects', edited: projEdited },
    ...SECTION_KEYS.map((k) => ({ id: k as View, label: SECTION_META[k].label, edited: sectionEdited(k, draft.sections[k]) })),
  ];

  return (
    <section aria-labelledby="ctTitle">
      <div className="admin-head">
        <h1 id="ctTitle">Site content</h1>
        <div className="admin-head-actions">
          <a className="btn btn-ghost" href="/" target="_blank" rel="noopener"><Icon id="eye" /><span>View site</span></a>
          <button type="button" className="btn btn-ghost" onClick={(e) => resetAll(e.currentTarget)} disabled={busy || !saved}><Icon id="refresh" /><span>Reset all</span></button>
          <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(saved ?? null))} disabled={busy || !dirty}>Discard</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty || saved === undefined}><Icon id="check" /><span>{busy ? 'Publishing…' : 'Publish'}</span></button>
        </div>
      </div>
      {error && <p className="panel-error">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Try again</button></p>}
      <p className="muted">
        {saved === undefined ? 'Loading…' : saved ? `Last published ${new Date(saved.updatedAt ?? '').toLocaleString()}.` : 'No live edits: the site shows the repository content.'}
        {dirty && <b className="unsaved"> Unpublished changes</b>}
      </p>

      <nav className="ct-nav" aria-label="Content sections">
        {views.map((v) => (
          <button key={v.id} type="button" className={`ct-nav-btn${view === v.id ? ' is-active' : ''}`} aria-current={view === v.id ? 'page' : undefined} onClick={() => setView(v.id)}>
            {v.label}{v.edited && <span className="ct-dot" aria-label="(edited)" />}
          </button>
        ))}
      </nav>

      {view === 'live' && (
        <div className="chart-grid chart-grid-even">
          <div className="panel glass">
            <div className="panel-head"><h2><Icon id="pin" /> Availability</h2><Switch on={draft.availability.open} label="Open to opportunities" onChange={(v) => setDraft((d) => ({ ...d, availability: { ...d.availability, open: v } }))} /></div>
            <p className="muted">The line above your name in the hero. The pulsing dot shows while this is on.</p>
            <label className="text-field"><span>Text</span>
              <input value={draft.availability.text} maxLength={LIMITS.availability} placeholder={DEFAULT_AVAILABILITY}
                onChange={(e) => setDraft((d) => ({ ...d, availability: { ...d.availability, text: e.target.value } }))} />
            </label>
            <p className="preview-line mono">{draft.availability.open && <span className="pulse-dot" aria-hidden="true" />} {draft.availability.text.trim() || DEFAULT_AVAILABILITY}</p>
          </div>
          <div className="panel glass">
            <div className="panel-head"><h2><Icon id="bell" /> Announcement</h2><Switch on={draft.announcement.enabled} label="Show announcement" onChange={(v) => setDraft((d) => ({ ...d, announcement: { ...d.announcement, enabled: v } }))} /></div>
            <p className="muted">A small dismissible pill at the bottom-left of the site, e.g. a new project or "available from June". Needs text to show.</p>
            <label className="text-field"><span>Text ({draft.announcement.text.length}/{LIMITS.announcement})</span>
              <input value={draft.announcement.text} maxLength={LIMITS.announcement} placeholder="Just shipped: ForensiX AI v2"
                onChange={(e) => setDraft((d) => ({ ...d, announcement: { ...d.announcement, text: e.target.value } }))} />
            </label>
            <label className="text-field"><span>Link (optional)</span>
              <input value={draft.announcement.link} maxLength={LIMITS.url} placeholder="https://… or /#projects" aria-invalid={!!draft.announcement.link.trim() && !safeUrl(draft.announcement.link)}
                onChange={(e) => setDraft((d) => ({ ...d, announcement: { ...d.announcement, link: e.target.value } }))} />
            </label>
          </div>
        </div>
      )}

      {view === 'projects' && (
        <div className="panel glass">
          <div className="panel-head"><h2><Icon id="grid" /> Projects</h2><span className="muted">{shownCount} of {baseProjects.length} shown</span></div>
          <div className="table-scroll table-tall">
            <table className="data-table content-table">
              <thead><tr><th scope="col">Project</th><th scope="col">Visible</th><th scope="col">Featured</th><th scope="col">Order</th><th scope="col">Badge</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {baseProjects.map((p) => {
                  const x = draft.projects[p.id] ?? {};
                  const featured = x.featured ?? !!p.featured;
                  const custom = !!normalize({ ...draft, sections: {}, projects: { [p.id]: x } }).projects;
                  return (
                    <FragmentRow key={p.id} expanded={open === p.id}
                      row={(
                        <tr className={x.hidden ? 'is-hidden-row' : ''}>
                          <td><b>{p.title}</b>{custom && <span className="badge-custom">edited</span>}</td>
                          <td><Switch on={!x.hidden} label={`Show ${p.title}`} onChange={(v) => setP(p.id, { hidden: !v })} /></td>
                          <td><Switch on={featured} label={`Feature ${p.title}`} onChange={(v) => setP(p.id, { featured: v })} /></td>
                          <td><OrderInput value={x.order} fallback={p.order ?? 99} label={`Order of ${p.title}`} onChange={(v) => setP(p.id, { order: v })} /></td>
                          <td><input className="badge-input" maxLength={LIMITS.badge} value={x.badge ?? p.badge ?? ''} placeholder="none" aria-label={`Badge for ${p.title}`}
                            onChange={(e) => setP(p.id, { badge: e.target.value })} /></td>
                          <td className="row-actions">
                            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? '' : p.id)}><Icon id="edit" /><span>Text</span></button>
                            {custom && <button type="button" className="btn btn-ghost btn-sm" onClick={() => resetP(p.id)} aria-label={`Reset ${p.title}`}><Icon id="refresh" /></button>}
                          </td>
                        </tr>
                      )}
                      detail={(
                        <div className="proj-edit">
                          <label className="text-field"><span>Hook</span>
                            <input value={x.hook ?? ''} maxLength={LIMITS.hook} placeholder={p.hook} onChange={(e) => setP(p.id, { hook: e.target.value })} /></label>
                          <label className="text-field"><span>Description</span>
                            <textarea rows={3} value={x.description ?? ''} maxLength={LIMITS.description} placeholder={p.description} onChange={(e) => setP(p.id, { description: e.target.value })} /></label>
                          <label className="text-field"><span>Live demo link</span>
                            <input value={x.demo ?? ''} maxLength={LIMITS.url} placeholder={p.links?.demo || 'https://…'} aria-invalid={!!x.demo?.trim() && !safeUrl(x.demo)} onChange={(e) => setP(p.id, { demo: e.target.value })} /></label>
                          <p className="muted">Leave a field empty to keep the text from data/projects.json (shown greyed out).</p>
                        </div>
                      )} />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view !== 'live' && view !== 'projects' && (
        <SectionEditor key={view} k={view} value={draft.sections[view]} onChange={(v) => setS(view, v)} onReset={() => resetS(view)} />
      )}
    </section>
  );
}

function FragmentRow({ row, detail, expanded }: { row: React.ReactNode; detail: React.ReactNode; expanded: boolean }) {
  return <>{row}{expanded && <tr className="detail-row"><td colSpan={6}>{detail}</td></tr>}</>;
}
