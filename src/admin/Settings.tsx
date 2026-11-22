/** Session, notifications, reply templates, activity log and shortcut reference. */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../shared/Icon';
import { Select } from '../shared/Select';
import { DEFAULT_TEMPLATES, fetchAudit, getTemplates, logAction, saveTemplates, type AuditEntry, type Template } from './api';
import { useConfirm, useToast } from './feedback';
import { chime, usePrefs, type Prefs } from './prefs';
import { SHORTCUTS } from './Messages';
import { actionLabel } from './Overview';
import { BackupPanel, BlockedPanel, StatusPanel } from './SettingsPanels';

function TemplatesPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Template[] | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTemplates().then((t) => { setItems(t); setSavedJson(JSON.stringify(t)); }).catch(() => { setItems(DEFAULT_TEMPLATES); setSavedJson(JSON.stringify(DEFAULT_TEMPLATES)); });
  }, []);
  const dirty = items !== null && JSON.stringify(items) !== savedJson;
  const set = (id: string, patch: Partial<Template>) => setItems((l) => l?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? l);

  const save = async () => {
    if (!items) return;
    setBusy(true);
    try { await saveTemplates(items); setSavedJson(JSON.stringify(items)); toast('success', 'Templates saved'); logAction('templates.save', `Saved ${items.length} reply templates`); }
    catch (e) { toast('error', 'Could not save templates', (e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (t: Template, origin: HTMLElement) => {
    if (await confirm({ title: `Delete “${t.name}”?`, text: 'The template is removed when you save.', confirmLabel: 'Delete', danger: true, origin })) {
      setItems((l) => l?.filter((x) => x.id !== t.id) ?? l);
    }
  };

  return (
    <div className="panel glass">
      <div className="panel-head">
        <h2><Icon id="copy" /> Reply templates</h2>
        <div className="admin-head-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems((l) => [...(l ?? []), { id: `t${Date.now().toString(36)}`, name: 'New template', body: 'Hi {firstName},\n\n\n\nBest regards,\nSriram Kannan' }])}><Icon id="plus" /><span>Add</span></button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save templates'}</button>
        </div>
      </div>
      <p className="muted">Insert them from the AI Reply dialog. Placeholders: <code>{'{firstName}'}</code>, <code>{'{name}'}</code>, <code>{'{email}'}</code>.</p>
      {!items ? <p className="muted">Loading…</p> : (
        <ul className="tpl-list">
          {items.map((t) => (
            <li key={t.id} className="tpl-item">
              <div className="tpl-item-head">
                <label className="visually-hidden" htmlFor={`tn-${t.id}`}>Template name</label>
                <input id={`tn-${t.id}`} className="tpl-title" value={t.name} maxLength={80} onChange={(e) => set(t.id, { name: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={`Delete ${t.name}`} onClick={(e) => remove(t, e.currentTarget)}><Icon id="trash" /></button>
              </div>
              <label className="visually-hidden" htmlFor={`tb-${t.id}`}>Template text</label>
              <textarea id={`tb-${t.id}`} rows={5} maxLength={5000} value={t.body} onChange={(e) => set(t.id, { body: e.target.value })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityPanel() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [n, setN] = useState(50);
  const [error, setError] = useState('');
  const load = useCallback((count: number) => {
    fetchAudit(count).then((r) => { setRows(r); setError(''); })
      .catch((e) => setError((e as { code?: string }).code === 'permission-denied' ? 'Blocked by the Firestore rules currently deployed. Deploy the new firestore.rules to record and read the activity log.' : (e as Error).message));
  }, []);
  useEffect(() => { load(n); }, [load, n]);
  return (
    <div className="panel glass" id="activity">
      <div className="panel-head"><h2><Icon id="activity" /> Activity log</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => load(n)}><Icon id="refresh" /><span>Refresh</span></button></div>
      <p className="muted">Append-only: entries can't be edited or deleted, even by an admin (enforced by the Firestore rules).</p>
      {error && <p className="panel-error">{error}</p>}
      <div className="table-scroll table-tall">
        <table className="data-table audit-table">
          <thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Details</th><th scope="col">By</th></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.at?.toDate?.().toLocaleString() ?? '…'}</td>
                <td><span className="chip">{actionLabel(r.action)}</span></td>
                <td>{r.detail}</td>
                <td className="mono">{r.email ?? r.by.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <p className="muted">No activity recorded yet.</p>}
      </div>
      {rows && rows.length >= n && <div className="load-more"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setN((x) => x + 50)}>Load older entries</button></div>}
    </div>
  );
}

export function Settings() {
  const toast = useToast();
  const [prefs, update] = usePrefs();
  const { hash } = useLocation();
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  useEffect(() => {
    if (hash) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [hash]);

  const toggleDesktop = async () => {
    if (prefs.desktopNotify) { update({ desktopNotify: false }); return; }
    if (!('Notification' in window)) { toast('error', 'This browser does not support notifications'); return; }
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setPerm(p);
    if (p === 'granted') { update({ desktopNotify: true }); toast('success', 'Desktop notifications on', 'You will be notified of new messages while this tab is in the background.'); }
    else toast('error', 'Notifications are blocked', 'Allow them for this site in the browser’s site settings.');
  };

  return (
    <section aria-labelledby="stTitle">
      <div className="admin-head"><h1 id="stTitle">Settings</h1></div>
      <div className="chart-grid chart-grid-even">
        <div className="panel glass">
          <h2><Icon id="shield" /> Session</h2>
          <Select<Prefs['idleMinutes']> label="Sign out automatically after inactivity" value={prefs.idleMinutes} className="dd-wide"
            onChange={(v) => update({ idleMinutes: v })}
            options={[{ value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes', hint: 'default' }, { value: 60, label: '1 hour' }, { value: 0, label: 'Never' }]} />
          <p className="muted">You get a warning a minute before. Closing the tab always ends the session (session-only login).</p>
        </div>
        <div className="panel glass">
          <h2><Icon id="bell" /> New-message alerts</h2>
          <dl className="sync-meta">
            <div><dt>Desktop notification when the tab is in the background{perm === 'denied' ? ' (blocked by the browser)' : ''}</dt><dd>
              <button type="button" role="switch" aria-checked={prefs.desktopNotify} className={`switch${prefs.desktopNotify ? ' is-on' : ''}`} onClick={toggleDesktop}><span className="switch-knob" /><span className="visually-hidden">Desktop notifications</span></button>
            </dd></div>
            <div><dt>Play a chime</dt><dd>
              <button type="button" className="btn btn-ghost btn-sm" onClick={chime}>Test</button>
              <button type="button" role="switch" aria-checked={prefs.sound} className={`switch${prefs.sound ? ' is-on' : ''}`} onClick={() => update({ sound: !prefs.sound })}><span className="switch-knob" /><span className="visually-hidden">Chime</span></button>
            </dd></div>
          </dl>
          <p className="muted">An in-page toast and the unread count in the tab title are always on.</p>
        </div>
      </div>
      <StatusPanel />
      <TemplatesPanel />
      <div className="chart-grid chart-grid-even">
        <BlockedPanel />
        <BackupPanel />
      </div>
      <ActivityPanel />
      <div className="panel glass">
        <h2><Icon id="keyboard" /> Keyboard shortcuts</h2>
        <dl className="kbd-list kbd-cols">
          {SHORTCUTS.map(([k, v]) => <div key={k}><dt>{k.split(' / ').map((x, i) => <span key={x}>{i > 0 && ' / '}<kbd>{x}</kbd></span>)}</dt><dd>{v}</dd></div>)}
        </dl>
      </div>
    </section>
  );
}
