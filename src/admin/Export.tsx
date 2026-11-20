import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../shared/Icon';
import { callFunction, fetchMessages, getSyncState, saveSyncState, toRows, msgDate, logAction, type Message, type SyncState } from './api';
import { useInbox } from './inbox';
import { useToast } from './feedback';

const AUTO_EVERY_MS = 10 * 60 * 1000;

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const stamp = () => new Date().toISOString().slice(0, 10);
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
// Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell)
const safeCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** CSV with a BOM (so Excel reads UTF-8) and formula-escaped cells. */
export function messagesCsv(list: Message[]): string {
  const rows = toRows(list).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])));
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const BOM = String.fromCharCode(0xfeff);
  return BOM + [head.join(','), ...rows.map((r) => head.map((h) => csvCell(String(r[h]))).join(','))].join(String.fromCharCode(13, 10));
}

export async function syncNow(list?: Message[]) {
  const messages = list ?? await fetchMessages();
  const res = await callFunction<{ count: number; syncedAt: string }>('sheets-sync', {
    body: { messages: messages.map((m) => ({ name: m.name, email: m.email, subject: m.subject, message: m.message, category: m.category, date: msgDate(m)?.toLocaleString() ?? '', read: !!m.read, replied: !!m.replied })) },
  });
  await saveSyncState({ lastSync: res.syncedAt, lastCount: res.count });
  logAction('sheets.sync', `Synced ${res.count} rows to Google Sheets`);
  return res;
}

/** Runs while the dashboard is open: auto-sync every 10 minutes when enabled. */
export function useAutoSync() {
  useEffect(() => {
    let timer = 0;
    const tick = async () => {
      try {
        const s = await getSyncState();
        if (s.autoSync && (!s.lastSync || Date.now() - Date.parse(s.lastSync) > AUTO_EVERY_MS)) {
          await syncNow();
          window.dispatchEvent(new Event('sk-synced'));
        }
      } catch { /* surfaced in the Export tab */ }
    };
    tick();
    timer = window.setInterval(tick, AUTO_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
}

export function ExportTab() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [sync, setSync] = useState<SyncState>({});
  const [config, setConfig] = useState<{ configured: boolean; viewUrl: string | null } | null>(null);
  const [configError, setConfigError] = useState('');
  const { list: live } = useInbox();
  const [withArchived, setWithArchived] = useState(true);

  const refreshState = useCallback(() => { getSyncState().then(setSync).catch(() => {}); }, []);
  useEffect(() => {
    refreshState();
    callFunction<{ configured: boolean; viewUrl: string | null }>('sheets-sync', { method: 'GET' })
      .then(setConfig).catch((e) => setConfigError((e as Error).message));
    window.addEventListener('sk-synced', refreshState);
    return () => window.removeEventListener('sk-synced', refreshState);
  }, [refreshState]);

  const exportAs = async (kind: 'xlsx' | 'csv' | 'json') => {
    setBusy(kind);
    try {
      const all = live ?? await fetchMessages();
      const list = withArchived ? all : all.filter((m) => !m.archived);
      if (!list.length) { toast('info', 'No messages to export'); return; }
      const rows = toRows(list).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, kind === 'json' ? v : safeCell(v)])));
      if (kind === 'json') {
        const out = list.map((m) => ({
          id: m.id, date: msgDate(m)?.toISOString() ?? '', name: m.name, email: m.email, subject: m.subject ?? '',
          message: m.message, category: m.category ?? 'General', read: !!m.read, replied: !!m.replied,
          starred: !!m.starred, archived: !!m.archived, note: m.note ?? '',
        }));
        download(`messages-${stamp()}.json`, JSON.stringify(out, null, 2), 'application/json');
      } else if (kind === 'csv') {
        download(`messages-${stamp()}.csv`, messagesCsv(list), 'text/csv;charset=utf-8');
      } else {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 24 }, { wch: 18 }, { wch: 60 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Messages');
        XLSX.writeFile(wb, `messages-${stamp()}.xlsx`);
      }
      toast('success', `Exported ${list.length} messages`, kind.toUpperCase());
      logAction('messages.export', `Exported ${list.length} messages as ${kind.toUpperCase()}`);
    } catch (e) { toast('error', 'Export failed', (e as Error).message); }
    finally { setBusy(''); }
  };

  const doSync = async () => {
    setBusy('sync');
    try { const r = await syncNow(); toast('success', 'Synced to Google Sheets', `${r.count} rows`); refreshState(); }
    catch (e) { toast('error', 'Sync failed', (e as Error).message); }
    finally { setBusy(''); }
  };
  const toggleAuto = async () => {
    const next = !sync.autoSync;
    try { await saveSyncState({ autoSync: next }); setSync((s) => ({ ...s, autoSync: next })); toast('info', `Auto-sync ${next ? 'on' : 'off'}`, next ? 'Runs every 10 minutes while the admin is open.' : undefined); }
    catch (e) { toast('error', 'Could not save setting', (e as Error).message); }
  };

  return (
    <section aria-labelledby="exTitle">
      <div className="admin-head"><h1 id="exTitle">Export</h1></div>
      <div className="chart-grid">
        <div className="panel glass">
          <h2>Download messages</h2>
          <p className="muted">Messages newest first, including read, replied, starred, archived and note columns. Cells that start with = + - @ are escaped so spreadsheets don't run them as formulas.</p>
          <label className="check-row"><input type="checkbox" checked={withArchived} onChange={(e) => setWithArchived(e.target.checked)} /> Include archived messages</label>
          <div className="export-btns">
            <button type="button" className="btn btn-primary" onClick={() => exportAs('xlsx')} disabled={!!busy}><Icon id="download" /><span>{busy === 'xlsx' ? 'Preparing…' : 'Excel (.xlsx)'}</span></button>
            <button type="button" className="btn btn-ghost" onClick={() => exportAs('csv')} disabled={!!busy}><Icon id="download" /><span>CSV</span></button>
            <button type="button" className="btn btn-ghost" onClick={() => exportAs('json')} disabled={!!busy}><Icon id="download" /><span>JSON</span></button>
          </div>
        </div>
        <div className="panel glass">
          <h2>Google Sheets sync</h2>
          {configError ? <p className="muted">Sync service unavailable: {configError}</p>
            : config && !config.configured ? <p className="muted">Sheets sync isn't configured on the server yet (see the README's environment variables).</p> : null}
          <dl className="sync-meta">
            <div><dt>Last sync</dt><dd>{sync.lastSync ? `${new Date(sync.lastSync).toLocaleString()}${sync.lastCount != null ? ` · ${sync.lastCount} rows` : ''}` : 'Never'}</dd></div>
            <div><dt>Auto-sync</dt><dd>
              <button type="button" role="switch" aria-checked={!!sync.autoSync} className={`switch${sync.autoSync ? ' is-on' : ''}`} onClick={toggleAuto}>
                <span className="switch-knob" /><span className="visually-hidden">Auto-sync every 10 minutes</span>
              </button>
              <span className="muted">every 10 min while open</span>
            </dd></div>
          </dl>
          <div className="export-btns">
            <button type="button" className="btn btn-primary" onClick={doSync} disabled={!!busy || config?.configured === false}><Icon id="refresh" /><span>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</span></button>
            {config?.viewUrl && <a className="btn btn-ghost" href={config.viewUrl} target="_blank" rel="noopener"><Icon id="ext" /><span>View spreadsheet</span></a>}
          </div>
        </div>
      </div>
    </section>
  );
}
