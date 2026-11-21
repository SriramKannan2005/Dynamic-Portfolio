/**
 * Content manager: live edits on top of data/*.json, stored in siteContent/live.
 * Only fields that differ from the repo are saved, so "Reset" is exact and the
 * document stays small. The public site picks changes up on its next load.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../shared/Icon';
import { projects as baseProjects } from '../site/content';
import { DEFAULT_AVAILABILITY, LIMITS, safeUrl, type ProjectOverride, type SiteOverrides } from '../shared/siteContent';
import { getOverrides, saveOverrides, resetOverrides, logAction } from './api';
import { useConfirm, useToast } from './feedback';

interface Draft {
  availability: { open: boolean; text: string };
  announcement: { enabled: boolean; text: string; link: string };
  projects: Record<string, ProjectOverride>;
}
const toDraft = (o: SiteOverrides | null): Draft => ({
  availability: { open: o?.availability?.open ?? true, text: o?.availability?.text ?? '' },
  announcement: { enabled: !!o?.announcement?.enabled, text: o?.announcement?.text ?? '', link: o?.announcement?.link ?? '' },
  projects: JSON.parse(JSON.stringify(o?.projects ?? {})),
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
  return out;
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch-knob" /><span className="visually-hidden">{label}</span>
    </button>
  );
}

export function ContentTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [saved, setSaved] = useState<SiteOverrides | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getOverrides().then((o) => { setSaved(o); setDraft(toDraft(o)); })
      .catch((e) => { setSaved(null); setError((e as { code?: string }).code === 'permission-denied' ? 'Blocked by the Firestore rules currently deployed. Deploy the new firestore.rules to use the content manager.' : (e as Error).message); });
  }, []);

  const norm = useMemo(() => normalize(draft), [draft]);
  const savedNorm = useMemo(() => normalize(toDraft(saved ?? null)), [saved]);
  const dirty = JSON.stringify(norm) !== JSON.stringify(savedNorm);
  const badUrls = [
    ...(draft.announcement.link.trim() && !safeUrl(draft.announcement.link) ? ['announcement link'] : []),
    ...baseProjects.flatMap((p) => {
      const x = draft.projects[p.id] ?? {};
      return x.demo?.trim() && !safeUrl(x.demo) ? [`${p.title} demo`] : [];
    }),
  ];

  const setP = (id: string, patch: Partial<ProjectOverride>) => setDraft((d) => ({ ...d, projects: { ...d.projects, [id]: { ...d.projects[id], ...patch } } }));
  const resetP = (id: string) => setDraft((d) => { const n = { ...d.projects }; delete n[id]; return { ...d, projects: n }; });

  const save = async () => {
    if (badUrls.length) { toast('error', 'Fix the links first', `Use https:// or a site path (/…): ${badUrls.join(', ')}`); return; }
    setBusy(true);
    try {
      const res = await saveOverrides(norm);
      setSaved(res);
      setDraft(toDraft(res));
      const changed = Object.keys(norm.projects ?? {}).length;
      const parts = [norm.availability ? 'availability' : '', norm.announcement?.enabled ? 'announcement on' : '', changed ? `${changed} project${changed === 1 ? '' : 's'} customised` : ''].filter(Boolean);
      logAction('content.save', `Published site content: ${parts.join(', ') || 'defaults'}`);
      toast('success', 'Published', 'Visitors see the changes on their next page load.');
    } catch (e) { toast('error', 'Could not publish', (e as Error).message); }
    finally { setBusy(false); }
  };
  const resetAll = async (origin: HTMLElement) => {
    const ok = await confirm({ title: 'Reset all site content?', text: 'Every live edit is removed and the site goes back to exactly what is in the repository (data/*.json).', confirmLabel: 'Reset', danger: true, origin });
    if (!ok) return;
    setBusy(true);
    try { await resetOverrides(); setSaved(null); setDraft(toDraft(null)); logAction('content.reset', 'Reset site content to the repository defaults'); toast('success', 'Site content reset'); }
    catch (e) { toast('error', 'Reset failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  const shownCount = baseProjects.filter((p) => !draft.projects[p.id]?.hidden).length;
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
      {error && <p className="panel-error">{error}</p>}
      <p className="muted">
        {saved === undefined ? 'Loading…' : saved ? `Last published ${new Date(saved.updatedAt ?? '').toLocaleString()}.` : 'No live edits: the site shows the repository content.'}
        {dirty && <b className="unsaved"> Unpublished changes</b>}
      </p>

      <div className="chart-grid chart-grid-even">
        <div className="panel glass">
          <div className="panel-head"><h2>Availability</h2><Switch on={draft.availability.open} label="Open to opportunities" onChange={(v) => setDraft((d) => ({ ...d, availability: { ...d.availability, open: v } }))} /></div>
          <p className="muted">The line above your name in the hero. The pulsing dot shows while this is on.</p>
          <label className="text-field"><span>Text</span>
            <input value={draft.availability.text} maxLength={LIMITS.availability} placeholder={DEFAULT_AVAILABILITY}
              onChange={(e) => setDraft((d) => ({ ...d, availability: { ...d.availability, text: e.target.value } }))} />
          </label>
          <p className="preview-line mono">{draft.availability.open && <span className="pulse-dot" aria-hidden="true" />} {draft.availability.text.trim() || DEFAULT_AVAILABILITY}</p>
        </div>
        <div className="panel glass">
          <div className="panel-head"><h2>Announcement</h2><Switch on={draft.announcement.enabled} label="Show announcement" onChange={(v) => setDraft((d) => ({ ...d, announcement: { ...d.announcement, enabled: v } }))} /></div>
          <p className="muted">A small dismissible pill at the bottom of the site, e.g. a new project or "available from June".</p>
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

      <div className="panel glass">
        <div className="panel-head"><h2>Projects</h2><span className="muted">{shownCount} of {baseProjects.length} shown</span></div>
        <div className="table-scroll table-tall">
          <table className="data-table content-table">
            <thead><tr><th scope="col">Project</th><th scope="col">Visible</th><th scope="col">Featured</th><th scope="col">Order</th><th scope="col">Badge</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {baseProjects.map((p) => {
                const x = draft.projects[p.id] ?? {};
                const featured = x.featured ?? !!p.featured;
                const custom = !!normalize({ ...draft, projects: { [p.id]: x } }).projects;
                return (
                  <FragmentRow key={p.id} expanded={open === p.id}
                    row={(
                      <tr className={x.hidden ? 'is-hidden-row' : ''}>
                        <td><b>{p.title}</b>{custom && <span className="badge-custom">edited</span>}</td>
                        <td><Switch on={!x.hidden} label={`Show ${p.title}`} onChange={(v) => setP(p.id, { hidden: !v })} /></td>
                        <td><Switch on={featured} label={`Feature ${p.title}`} onChange={(v) => setP(p.id, { featured: v })} /></td>
                        <td><input className="num-input" type="number" min={0} max={999} value={x.order ?? p.order ?? 99} aria-label={`Order of ${p.title}`}
                          onChange={(e) => setP(p.id, { order: Number(e.target.value) })} /></td>
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
    </section>
  );
}

function FragmentRow({ row, detail, expanded }: { row: React.ReactNode; detail: React.ReactNode; expanded: boolean }) {
  return <>{row}{expanded && <tr className="detail-row"><td colSpan={6}>{detail}</td></tr>}</>;
}
