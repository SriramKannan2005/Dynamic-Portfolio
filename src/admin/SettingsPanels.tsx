/** Settings panels: blocked senders, full backup, system status. */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon';
import { getAuthInstance, useEmulators } from '../shared/firebase';
import { blockSender, callFunction, fetchAudit, fetchBackup, fetchBlocked, logAction, unblockSender, type Blocked } from './api';
import { useToast } from './feedback';
import { download, stamp } from './Export';

const denied = (e: unknown) => (e as { code?: string })?.code === 'permission-denied';

export function BlockedPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<Blocked[] | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const load = useCallback(() => {
    fetchBlocked().then((r) => { setRows(r); setError(''); })
      .catch((e) => { setRows([]); setError(denied(e) ? 'Blocked by the Firestore rules currently deployed. Deploy the latest firestore.rules to use blocking.' : (e as Error).message); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { toast('error', 'Enter a valid email address'); return; }
    try { await blockSender(v, 'Added in Settings'); setEmail(''); toast('success', 'Blocked', v); load(); }
    catch (e) { toast('error', 'Could not block', denied(e) ? 'Deploy the latest firestore.rules first.' : (e as Error).message); }
  };
  const remove = async (b: Blocked) => {
    try { await unblockSender(b.id); toast('success', 'Unblocked', b.id); load(); }
    catch (e) { toast('error', 'Could not unblock', (e as Error).message); }
  };
  return (
    <div className="panel glass" id="blocked">
      <div className="panel-head"><h2><Icon id="ban" /> Blocked senders</h2><span className="muted">{rows ? rows.length : '…'}</span></div>
      <p className="muted">The database itself refuses new messages from these addresses (enforced in firestore.rules, not just hidden).</p>
      {error && <p className="panel-error">{error}</p>}
      <div className="block-add">
        <label className="visually-hidden" htmlFor="block-email">Email to block</label>
        <input id="block-email" type="email" placeholder="spammer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={add}><Icon id="ban" /><span>Block</span></button>
      </div>
      {rows && rows.length > 0 && (
        <ul className="block-list">
          {rows.map((b) => (
            <li key={b.id}>
              <span className="mono">{b.id}</span>
              <span className="muted">{b.reason || ''}{b.at ? ` · ${new Date(b.at).toLocaleDateString()}` : ''}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(b)}>Unblock</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BackupPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const data = await fetchBackup();
      const n = (data.messages ?? []).length;
      download(`portfolio-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
      logAction('backup.download', `Downloaded a full backup (${n} messages)`);
      toast('success', 'Backup downloaded', `${n} messages, replies, templates, site content, block list and activity log`);
    } catch (e) { toast('error', 'Backup failed', (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="panel glass">
      <h2><Icon id="database" /> Backup</h2>
      <p className="muted">One JSON file with every message (including Trash and Spam), replies, reply templates, live site content, blocked senders, Sheets sync state and the activity log. Keep it private: it contains visitors&apos; email addresses.</p>
      <div className="export-btns"><button type="button" className="btn btn-primary" onClick={run} disabled={busy}><Icon id="download" /><span>{busy ? 'Preparing…' : 'Download full backup'}</span></button></div>
    </div>
  );
}

type Check = { label: string; state: 'ok' | 'warn' | 'bad'; detail: string };
interface StatusResponse { configured: Record<string, boolean>; geminiModel: string | null; adminUidCount: number; runtime: string }

export function StatusPanel() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    const out: Check[] = [];
    const push = (c: Check) => { out.push(c); setChecks([...out]); };
    setChecks([]);
    try {
      const u = (await getAuthInstance()).currentUser;
      const admin = (await u?.getIdTokenResult())?.claims.admin === true;
      push({ label: 'Admin claim', state: admin ? 'ok' : 'bad', detail: admin ? 'This account carries admin == true' : 'Missing: run npm run admin:claim' });
    } catch { push({ label: 'Admin claim', state: 'warn', detail: 'Could not read the token' }); }
    // Probe collections that only the latest rules allow
    const probe = async (label: string, p: Promise<unknown>, okText: string) => {
      try { await p; push({ label, state: 'ok', detail: okText }); }
      catch (e) { push({ label, state: denied(e) ? 'bad' : 'warn', detail: denied(e) ? 'Refused: deploy the latest firestore.rules' : (e as Error).message }); }
    };
    await probe('Rules: activity log', fetchAudit(1), 'Readable (current rules)');
    await probe('Rules: blocked senders', fetchBlocked(), 'Readable (current rules)');
    try {
      const st = await callFunction<StatusResponse>('status', { method: 'GET' });
      const c = st.configured;
      push({ label: 'Functions', state: 'ok', detail: `Reachable · Node ${st.runtime} · ${st.adminUidCount} admin UID${st.adminUidCount === 1 ? '' : 's'}` });
      push({ label: 'AI drafts (Gemini)', state: c.ai ? 'ok' : 'bad', detail: c.ai ? `Key set · model ${st.geminiModel ?? 'default (flash-latest chain)'}` : 'Gemini key not set on the server (see README)' });
      push({ label: 'Send email', state: c.email ? 'ok' : 'warn', detail: c.email ? 'Apps Script URL set' : 'Email web app not set on the server ("Open in Gmail" still works)' });
      push({ label: 'Sheets sync', state: c.sheets ? 'ok' : 'warn', detail: c.sheets ? `Set${c.sheetsView ? ' · view link set' : ''}` : 'Sheets web app not set on the server' });
    } catch (e) {
      push({ label: 'Functions', state: 'bad', detail: (e as Error).message });
    }
    const appCheck = !!import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    push({ label: 'App Check', state: !useEmulators && appCheck ? 'ok' : 'warn', detail: useEmulators ? 'Off in emulator mode' : appCheck ? 'reCAPTCHA v3 site key configured' : 'VITE_RECAPTCHA_SITE_KEY not set' });
    setBusy(false);
  }, []);
  useEffect(() => { run(); }, [run]);
  return (
    <div className="panel glass">
      <div className="panel-head"><h2><Icon id="shield" /> System status</h2><button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={busy}><Icon id="refresh" /><span>{busy ? 'Checking…' : 'Re-check'}</span></button></div>
      <ul className="status-list">
        {checks.map((c) => (
          <li key={c.label} className={`is-${c.state}`}>
            <span className="status-dot" aria-hidden="true" />
            <b>{c.label}</b>
            <span className="muted">{c.detail}</span>
            <span className="visually-hidden">{c.state === 'ok' ? 'OK' : c.state === 'warn' ? 'Warning' : 'Problem'}</span>
          </li>
        ))}
        {busy && <li className="is-wait"><span className="status-dot" aria-hidden="true" /><span className="muted">Checking…</span></li>}
      </ul>
    </div>
  );
}
