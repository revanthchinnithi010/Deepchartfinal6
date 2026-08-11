import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level render-error safety net.
 *
 * Without this, an uncaught error thrown during render *anywhere* in the
 * component tree unmounts the entire React root (React 18/19 behavior) and
 * leaves `#root` empty — a blank page with nothing in the DOM and nothing
 * on screen, even though the error is logged to the console. In production,
 * nobody has DevTools open, so this looks like "the app just didn't load."
 *
 * This boundary catches those errors, logs them clearly, and renders a
 * visible fallback with a reload action instead of silence.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught render error — app root was about to go blank:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#0b0b0f",
          color: "#f4f4f5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          zIndex: 999999,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong.</div>
        <div style={{ fontSize: 13, color: "#a1a1aa", maxWidth: 560 }}>
          The app hit an unexpected error while loading and couldn&apos;t continue.
          Reloading usually fixes this. If it keeps happening, please report it.
        </div>
        <pre
          style={{
            maxWidth: 640,
            maxHeight: 200,
            overflow: "auto",
            textAlign: "left",
            fontSize: 12,
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: 12,
            color: "#fca5a5",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <button
          onClick={this.handleReload}
          style={{
            marginTop: 4,
            padding: "8px 18px",
            borderRadius: 8,
            border: "1px solid #3f3f46",
            background: "#27272a",
            color: "#f4f4f5",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
