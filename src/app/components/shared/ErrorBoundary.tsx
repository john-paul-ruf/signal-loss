import * as React from "react";

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * SectionErrorBoundary — a reusable class-based boundary suitable for
 * screen-level and panel-level protection. The root ErrorBoundary in
 * `main.tsx` catches truly fatal errors; this variant lets sub-sections
 * render a scoped fallback without evicting the rest of the app.
 *
 * Never sends anything off-device (NFR-8).
 */
export interface SectionErrorBoundaryProps {
  readonly title?: string;
  readonly fallback?: (error: Error, reset: () => void) => React.ReactNode;
  readonly children: React.ReactNode;
}

export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const title = this.props.title ?? "SECTION FAULT";
    if (this.props.fallback !== undefined) {
      return this.props.fallback(error, this.reset);
    }
    return (
      <section role="alert" className="sl-section-error">
        <h2 className="sl-section-error__title">{title}</h2>
        <p className="sl-section-error__message">{error.message}</p>
        <button
          type="button"
          className="sl-section-error__retry"
          onClick={this.reset}
        >
          RETRY
        </button>
      </section>
    );
  }
}
