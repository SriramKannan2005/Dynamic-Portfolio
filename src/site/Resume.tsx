import { lazy, Suspense, type ReactNode } from 'react';
import { useModal } from '../shared/Modal';
import { content } from './content';
import './resume.css';

// The viewer (and pdf.js inside it) is only downloaded when someone opens it.
const ResumeViewer = lazy(() => import('./ResumeViewer').then((m) => ({ default: m.ResumeViewer })));

export function openResumeViewer(modal: ReturnType<typeof useModal>, origin?: HTMLElement | null, initial = 0) {
  modal.open(
    <Suspense fallback={<div className="rv rv-boot" role="status"><span className="rv-spinner" aria-hidden="true" />Opening resumes…</div>}>
      <ResumeViewer resumes={content.resumes} initial={initial} />
    </Suspense>,
    { origin, label: 'Resume viewer' },
  );
}

/** Any "Resume" button: opens the viewer (without JS it still downloads the first PDF). */
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
        openResumeViewer(modal, e.currentTarget);
      }}
    >
      {children}
    </a>
  );
}
