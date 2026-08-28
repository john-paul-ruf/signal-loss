import * as React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { useCurrentRoute } from "./route-registry";

/**
 * Root component. Delegates to whichever route the registry resolves for the
 * current hash — the boot fallback if nothing else is registered yet.
 */
function App(): React.ReactElement {
  const route = useCurrentRoute();
  return route.render();
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Top-level error boundary. NFR-8 forbids sending anything off-device, so
 * errors render in-product as a static diagnostic.
 */
class ErrorBoundary extends React.Component<
  { readonly children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { readonly children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): React.ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return (
        <main className="fatal-error" role="alert">
          <h1 className="fatal-error__title">SIGNAL LOSS · SYSTEM FAULT</h1>
          <p className="fatal-error__message">{error.message}</p>
          <p className="fatal-error__hint">
            No data has been sent anywhere. Reload the tab to reset the shell.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}

function mount(): void {
  const container = document.getElementById("app-root");
  if (container === null) {
    throw new Error("Missing #app-root; index.html was not served correctly.");
  }
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

mount();
