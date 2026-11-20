import type { ReactNode } from 'react';
import { Icon } from '../shared/Icon';
import { useModal } from '../shared/Modal';
import { content } from './content';

const track = (id: string) => { import('./tracking').then((t) => t.trackResumeDownload(id)).catch(() => {}); };

function ResumeChooser() {
  return (
    <div className="chooser">
      <h2 id="modalTitle">Download a resume</h2>
      <p>Pick the version that fits the role.</p>
      <div className="chooser-list">
        {content.resumes.map((r, i) => (
          <a
            key={r.id} className="chooser-opt" href={r.file} download={r.filename ?? true}
            onClick={() => track(r.id)} {...(i === 0 ? { autoFocus: true } : {})}
          >
            <Icon id="download" />
            <span><b>{r.label}</b><small>{r.description}{r.updated ? ` · updated ${r.updated}` : ''}</small></span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Any "Resume" button: opens the chooser (falls back to the first PDF without JS). */
export function ResumeButton({ className, children }: { className: string; children: ReactNode }) {
  const modal = useModal();
  const first = content.resumes[0];
  return (
    <a
      className={className}
      href={first?.file ?? '#'}
      download={first?.filename ?? true}
      aria-haspopup="dialog"
      onClick={(e) => {
        e.preventDefault();
        modal.open(<ResumeChooser />, { origin: e.currentTarget, narrow: true });
      }}
    >
      {children}
    </a>
  );
}
