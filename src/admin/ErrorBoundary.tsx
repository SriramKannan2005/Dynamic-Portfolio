/** Catches render errors in the admin so a crash shows a way out instead of a blank page. */
import { Component, type ReactNode } from 'react';

export class AdminErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[admin] crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="admin-center">
        <div className="login-card glass" role="alert">
          <h1>Something went wrong</h1>
          <p className="muted">The admin hit an unexpected error. Reloading usually fixes it; your data is safe.</p>
          <p className="mono small-note">{this.state.error.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
