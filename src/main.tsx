import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Site from './site/Site';
import './shared/scrollbars.css';

// The admin panel (Firebase Auth, Chart.js, SheetJS) is a separate lazy chunk.
const AdminApp = lazy(() => import('./admin/AdminApp'));

createRoot(document.getElementById('root')!).render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/admin/*" element={<Suspense fallback={<div className="admin-boot" role="status">Loading admin…</div>}><AdminApp /></Suspense>} />
      <Route path="*" element={<Site />} />
    </Routes>
  </BrowserRouter>,
);
