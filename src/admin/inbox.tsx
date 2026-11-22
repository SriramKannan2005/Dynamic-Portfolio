/**
 * Live inbox shared by every admin tab: one Firestore listener, the unread count
 * in the browser-tab title, and alerts (toast, optional desktop notification and
 * chime) when a message arrives while the dashboard is open.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subscribeMessages, type Message } from './api';
import { useToast } from './feedback';
import { chime, readPrefs } from './prefs';

interface InboxState { list: Message[] | null; error: string; unread: number }
const InboxCtx = createContext<InboxState>({ list: null, error: '', unread: 0 });
export const useInbox = () => useContext(InboxCtx);

const BASE_TITLE = 'Admin · Sriram Kannan';

export function InboxProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [list, setList] = useState<Message[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => subscribeMessages(
    (l) => { setList(l); setError(''); },
    (e) => setError((e as { code?: string }).code === 'permission-denied' ? 'Firestore refused access to messages. Check that this account has the admin claim.' : e.message),
    (added) => {
      const first = added[0];
      const title = added.length === 1 ? `New message from ${first.name}` : `${added.length} new messages`;
      const body = added.length === 1 ? (first.subject || first.message).slice(0, 120) : added.map((m) => m.name).join(', ');
      toast('info', title, body);
      const prefs = readPrefs();
      if (prefs.sound) chime();
      if (prefs.desktopNotify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, { body, icon: '/assets/images/icons/icon-192.png', tag: 'sk-admin-msg' });
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* some browsers only allow notifications from a service worker */ }
      }
    },
  ), [toast]);

  const unread = useMemo(() => (list ?? []).filter((m) => !m.read && !m.archived && !m.spam && !m.trashedAt).length, [list]);
  useEffect(() => {
    document.title = unread ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unread]);

  const value = useMemo(() => ({ list, error, unread }), [list, error, unread]);
  return <InboxCtx.Provider value={value}>{children}</InboxCtx.Provider>;
}
