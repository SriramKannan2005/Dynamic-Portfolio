/**
 * Section editors for /admin -> Content: hero roles, about, skills, experience,
 * education, achievements and certifications. Each section is either untouched
 * (the repo's data/content.json is shown and used) or replaced as a whole by the
 * edited list. cleanSection() is the single source of truth for what is valid,
 * so the editor, the publish and the public site always agree.
 */
import { useEffect, useState } from 'react';
import { Icon } from '../shared/Icon';
import { content as base } from '../site/content';
import { cleanSection, safeUrl, type SectionKey, type SectionOverrides } from '../shared/siteContent';

type Item = Record<string, unknown>;
type FieldKind = 'text' | 'textarea' | 'lines' | 'tags' | 'number';
interface Field { key: string; label: string; kind: FieldKind; placeholder?: string; wide?: boolean; hint?: string; url?: boolean; max?: number }
interface ListSpec {
  title: string; help: string; noun: string;
  fields: Field[];
  required: string[];
  blank: () => Item;
  summary: (x: Item) => string;
}

export const baseSection = (k: SectionKey): unknown => (k === 'roles' ? base.profile.roles : base[k]);

export const SECTION_META: Record<SectionKey, { label: string; where: string }> = {
  roles: { label: 'Hero roles', where: 'The rotating line under your name' },
  about: { label: 'About', where: 'Paragraphs in the About section' },
  skills: { label: 'Skills', where: 'Skill groups and the 3D sphere' },
  experience: { label: 'Experience', where: 'The experience timeline' },
  education: { label: 'Education', where: 'The education timeline' },
  achievements: { label: 'Achievements', where: 'Achievement tiles and the stats counters' },
  certifications: { label: 'Certifications', where: 'Pinned certificate cards' },
};

const KINDS = 'hackathon, grant, assessment, coding';
const ICONS = 'trophy, medal, spark, chart, code, star, cap, check';
const LISTS: Partial<Record<SectionKey, ListSpec>> = {
  skills: {
    title: 'Skill groups', noun: 'group', help: 'Each group is a filter chip, a card and a colour on the sphere.',
    fields: [
      { key: 'name', label: 'Group name', kind: 'text', placeholder: 'Machine learning', max: 40 },
      { key: 'items', label: 'Skills (comma separated)', kind: 'tags', placeholder: 'Python, PyTorch, scikit-learn', wide: true },
    ],
    required: ['name', 'items'], blank: () => ({ name: '', items: [] }),
    summary: (x) => `${x.name || 'Untitled group'} · ${(x.items as string[] | undefined)?.length ?? 0} skills`,
  },
  experience: {
    title: 'Experience', noun: 'role', help: 'Shown top to bottom in this order. "type: internship" is what the Internships counter counts.',
    fields: [
      { key: 'role', label: 'Role', kind: 'text', placeholder: 'AI Engineer Intern', max: 100 },
      { key: 'org', label: 'Organisation', kind: 'text', placeholder: 'Company, City', max: 120 },
      { key: 'period', label: 'Period', kind: 'text', placeholder: 'Jun 2025 – Aug 2025', max: 60 },
      { key: 'type', label: 'Type', kind: 'text', placeholder: 'internship', hint: 'internship, job, freelance…', max: 30 },
      { key: 'summary', label: 'Summary', kind: 'textarea', wide: true, max: 600 },
      { key: 'points', label: 'Highlights (one per line)', kind: 'lines', wide: true },
      { key: 'tags', label: 'Skills used (comma separated)', kind: 'tags', wide: true },
    ],
    required: ['role', 'org'], blank: () => ({ role: '', org: '', period: '', type: 'internship', summary: '', points: [], tags: [] }),
    summary: (x) => `${x.role || 'New role'}${x.org ? ` · ${x.org}` : ''}`,
  },
  education: {
    title: 'Education', noun: 'entry', help: 'Newest first. The site draws them oldest to newest; a period ending after this year shows "In progress".',
    fields: [
      { key: 'degree', label: 'Degree / course', kind: 'text', max: 120 },
      { key: 'school', label: 'School', kind: 'text', max: 120 },
      { key: 'period', label: 'Period', kind: 'text', placeholder: '2023 – 2027', max: 60 },
      { key: 'score', label: 'Score', kind: 'text', placeholder: 'CGPA 8.1 / 10', max: 60 },
      { key: 'note', label: 'Note', kind: 'text', wide: true, max: 160 },
    ],
    required: ['degree', 'school'], blank: () => ({ degree: '', school: '', period: '', score: '', note: '' }),
    summary: (x) => `${x.degree || 'New entry'}${x.period ? ` · ${x.period}` : ''}`,
  },
  achievements: {
    title: 'Achievements', noun: 'achievement', help: 'The first one is the large tile. Use "Prize · Event" in the title to split it over two lines.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', placeholder: '2nd Prize · HackSphere 2025', wide: true, max: 160 },
      { key: 'kind', label: 'Kind', kind: 'text', hint: KINDS, max: 30 },
      { key: 'level', label: 'Level', kind: 'text', hint: 'national, state, college…', max: 30 },
      { key: 'icon', label: 'Icon', kind: 'text', hint: ICONS, max: 30 },
      { key: 'link', label: 'Link (optional)', kind: 'text', placeholder: 'https://…', url: true, max: 400 },
      { key: 'detail', label: 'Detail', kind: 'textarea', wide: true, max: 400 },
      { key: 'metric.value', label: 'Number (optional)', kind: 'number', placeholder: '120' },
      { key: 'metric.suffix', label: 'Suffix', kind: 'text', placeholder: '+', max: 4 },
      { key: 'metric.label', label: 'Number label', kind: 'text', placeholder: 'teams competing', max: 60 },
      { key: 'metric.decimals', label: 'Decimals', kind: 'number', placeholder: '0' },
    ],
    required: ['title'], blank: () => ({ title: '', kind: 'hackathon', level: '', icon: 'trophy', detail: '' }),
    summary: (x) => String(x.title || 'New achievement'),
  },
  certifications: {
    title: 'Certifications', noun: 'certificate', help: 'The image is a site path (put the file in public/assets/images/certificates) or an https:// link.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', max: 120 },
      { key: 'issuer', label: 'Issuer', kind: 'text', max: 80 },
      { key: 'image', label: 'Image', kind: 'text', placeholder: '/assets/images/certificates/name.png', wide: true, url: true, max: 400 },
    ],
    required: ['title', 'image'], blank: () => ({ title: '', issuer: '', image: '' }),
    summary: (x) => `${x.title || 'New certificate'}${x.issuer ? ` · ${x.issuer}` : ''}`,
  },
};

/* ---------- nested get/set for "metric.value" style keys ---------- */
const getPath = (o: Item, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Item)[k] : undefined), o);
function setPath(o: Item, path: string, value: unknown): Item {
  const [k, ...rest] = path.split('.');
  if (!rest.length) return { ...o, [k]: value };
  const child = (o[k] && typeof o[k] === 'object' ? o[k] : {}) as Item;
  return { ...o, [k]: setPath(child, rest.join('.'), value) };
}
const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

/** Text box for a list value: keeps what you type (trailing commas, blank lines) and reports the parsed list. */
function ListText({ value, sep, multiline, onChange, placeholder, label }: { value: string[]; sep: 'comma' | 'line'; multiline?: boolean; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const join = (v: string[]) => v.join(sep === 'comma' ? ', ' : '\n');
  const parse = (t: string) => t.split(sep === 'comma' ? ',' : '\n').map((s) => s.trim()).filter(Boolean);
  const [text, setText] = useState(() => join(value ?? []));
  useEffect(() => {
    // An outside change (reset, discard, move) that the text doesn't already describe
    if (JSON.stringify(parse(text)) !== JSON.stringify(value ?? [])) setText(join(value ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const change = (t: string) => { setText(t); onChange(parse(t)); };
  return multiline
    ? <textarea rows={Math.min(8, Math.max(3, text.split('\n').length + 1))} value={text} placeholder={placeholder} aria-label={label} onChange={(e) => change(e.target.value)} />
    : <input value={text} placeholder={placeholder} aria-label={label} onChange={(e) => change(e.target.value)} />;
}

function FieldInput({ f, item, onChange }: { f: Field; item: Item; onChange: (v: unknown) => void }) {
  const v = getPath(item, f.key);
  const bad = f.url && typeof v === 'string' && v.trim() && !safeUrl(v);
  let input: React.ReactNode;
  if (f.kind === 'lines' || f.kind === 'tags') {
    input = <ListText value={(v as string[]) ?? []} sep={f.kind === 'tags' ? 'comma' : 'line'} multiline={f.kind === 'lines'} placeholder={f.placeholder} label={f.label} onChange={onChange} />;
  } else if (f.kind === 'textarea') {
    input = <textarea rows={3} value={(v as string) ?? ''} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.kind === 'number') {
    input = <input type="number" inputMode="decimal" step="any" min={0} value={typeof v === 'number' ? v : ''} placeholder={f.placeholder}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  } else {
    input = <input value={(v as string) ?? ''} maxLength={f.max} placeholder={f.placeholder} aria-invalid={!!bad} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label className={`text-field${f.wide ? ' is-wide' : ''}`}>
      <span>{f.label}{f.hint && <small className="field-hint"> · {f.hint}</small>}</span>
      {input}
      {bad && <small className="field-error">Use https://… or a site path starting with /</small>}
    </label>
  );
}

function ItemList({ spec, items, onChange }: { spec: ListSpec; items: Item[]; onChange: (v: Item[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const update = (i: number, next: Item) => onChange(items.map((x, j) => (j === i ? next : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen((o) => (o === i ? j : o === j ? i : o));
  };
  const remove = (i: number) => { onChange(items.filter((_, j) => j !== i)); setOpen(null); };
  const add = () => { onChange([...items, spec.blank()]); setOpen(items.length); };

  return (
    <div className="sec-list">
      {items.map((x, i) => {
        const missing = spec.required.filter((k) => isEmpty(getPath(x, k)));
        const isOpen = open === i;
        return (
          <div key={i} className={`sec-item${isOpen ? ' is-open' : ''}${missing.length ? ' is-incomplete' : ''}`}>
            <div className="sec-item-head">
              <button type="button" className="sec-item-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                <span className="sec-item-num mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="sec-item-title">{spec.summary(x)}</span>
                {!!missing.length && <span className="sec-warn" title="Incomplete items are not published">Needs {missing.map((k) => spec.fields.find((f) => f.key === k)?.label.toLowerCase() ?? k).join(' & ')}</span>}
                <Icon id="chev" />
              </button>
              <div className="sec-item-actions">
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${spec.noun} ${i + 1} up`}><span aria-hidden="true">↑</span></button>
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${spec.noun} ${i + 1} down`}><span aria-hidden="true">↓</span></button>
                <button type="button" className="icon-btn icon-btn-sm is-danger" onClick={() => remove(i)} aria-label={`Remove ${spec.noun} ${i + 1}`}><Icon id="trash" /></button>
              </div>
            </div>
            {isOpen && (
              <div className="sec-fields">
                {spec.fields.map((f) => <FieldInput key={f.key} f={f} item={x} onChange={(v) => update(i, setPath(x, f.key, v))} />)}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost sec-add" onClick={add}><Icon id="plus" /><span>Add {spec.noun}</span></button>
    </div>
  );
}

function StringList({ items, onChange, multiline, noun, max }: { items: string[]; onChange: (v: string[]) => void; multiline?: boolean; noun: string; max: number }) {
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="sec-list">
      {items.map((t, i) => (
        <div key={i} className="sec-row">
          <span className="sec-item-num mono">{String(i + 1).padStart(2, '0')}</span>
          {multiline
            ? <textarea rows={4} value={t} maxLength={max} aria-label={`${noun} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            : <input value={t} maxLength={max} aria-label={`${noun} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />}
          <div className="sec-item-actions">
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${noun} ${i + 1} up`}><span aria-hidden="true">↑</span></button>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${noun} ${i + 1} down`}><span aria-hidden="true">↓</span></button>
            <button type="button" className="icon-btn icon-btn-sm is-danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${noun} ${i + 1}`}><Icon id="trash" /></button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost sec-add" onClick={() => onChange([...items, ''])}><Icon id="plus" /><span>Add {noun}</span></button>
    </div>
  );
}

/** Is this section's draft different from the repo (i.e. would it be published)? */
export function sectionEdited(k: SectionKey, v: unknown): boolean {
  if (v === undefined) return false;
  const a = cleanSection(k, v);
  return !!a && (a as unknown[]).length > 0 && JSON.stringify(a) !== JSON.stringify(cleanSection(k, baseSection(k)));
}

export function SectionEditor({ k, value, onChange, onReset }: { k: SectionKey; value: unknown; onChange: (v: unknown) => void; onReset: () => void }) {
  const current = (value ?? JSON.parse(JSON.stringify(baseSection(k)))) as unknown[];
  const edited = sectionEdited(k, value);
  const empty = value !== undefined && !(cleanSection(k, value) as unknown[] | null)?.length;
  const meta = SECTION_META[k];
  const spec = LISTS[k];
  return (
    <div className="panel glass sec-panel">
      <div className="panel-head">
        <div>
          <h2>{meta.label}{edited && <span className="badge-custom">edited</span>}</h2>
          <p className="muted">{meta.where}. {spec?.help ?? (k === 'roles' ? 'They rotate every few seconds; the first one shows while the page loads.' : 'One box per paragraph.')}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset} disabled={value === undefined}><Icon id="refresh" /><span>Use repo version</span></button>
      </div>
      {empty && <p className="panel-error">Nothing valid left in this section, so the site keeps the repo version. Add at least one complete item.</p>}
      {spec
        ? <ItemList spec={spec} items={current as Item[]} onChange={onChange} />
        : <StringList items={current as string[]} onChange={onChange} multiline={k === 'about'} noun={k === 'about' ? 'paragraph' : 'role'} max={k === 'about' ? 1200 : 60} />}
    </div>
  );
}

export type SectionDraft = Partial<Record<SectionKey, unknown>>;
/** What gets published: only sections that differ from the repo, already cleaned. */
export function normalizeSections(d: SectionDraft): SectionOverrides | undefined {
  const out: SectionOverrides = {};
  for (const k of Object.keys(d) as SectionKey[]) {
    if (!sectionEdited(k, d[k])) continue;
    (out as Record<string, unknown>)[k] = cleanSection(k, d[k]);
  }
  return Object.keys(out).length ? out : undefined;
}
