import { Component, type ErrorInfo, type ReactNode } from "react";

type WorkspaceErrorBoundaryProps = {
  children: ReactNode;
  workspace: string;
  anchorId: string;
  compact?: boolean;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class WorkspaceErrorBoundary extends Component<WorkspaceErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`The ${this.props.workspace} workspace failed to render.`, error, errorInfo);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section
        className={`workspace-error-state${this.props.compact ? " is-compact" : ""}`}
        id={this.props.anchorId}
        aria-labelledby={`${this.props.anchorId}-error-title`}
      >
        <p className="eyebrow">Temporarily unavailable</p>
        <h2 id={`${this.props.anchorId}-error-title`}>Something went wrong while loading {this.props.workspace}.</h2>
        <p>The rest of the Member Portal is still available. Retry this section or return to the dashboard.</p>
        <div className="workspace-error-actions">
          <button type="button" onClick={this.retry}>Retry</button>
          <a href="#overview">Return to Dashboard</a>
        </div>
      </section>
    );
  }
}

export class PortalRootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("The Member Portal encountered an unrecoverable render error.", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="portal-fatal-error" role="alert">
        <section>
          <p className="eyebrow">Member Portal</p>
          <h1>The Member Portal encountered an unexpected error.</h1>
          <p>Your data has not been changed. Reload the portal to start a fresh session.</p>
          <div className="workspace-error-actions">
            <button type="button" onClick={() => window.location.reload()}>Reload Portal</button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                window.location.hash = "overview";
                window.location.reload();
              }}
            >
              Return to Dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }
}
