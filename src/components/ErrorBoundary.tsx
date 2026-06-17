// src/components/ErrorBoundary.tsx
// Class-based React ErrorBoundary: catches render-phase exceptions in the
// component tree, renders a recovery UI, and logs to console.error.
// It deliberately does NOT touch the drawing store (layers/camera) to avoid
// destroying unsaved project state on recovery.
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
      errorStack: "",
      componentStack: "",
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? (error.stack ?? "") : "";
    return { hasError: true, errorMessage, errorStack };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const componentStack = info.componentStack ?? "";
    console.error(
      "[ErrorBoundary] Uncaught render error:",
      error,
      componentStack,
    );
    this.setState({ componentStack });
  }

  private handleCopyDetails = () => {
    const { errorMessage, errorStack, componentStack } = this.state;
    const text = [errorMessage, errorStack, componentStack]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard?.writeText(text).catch(() => {
      // Clipboard API may be unavailable in some contexts (e.g. insecure http).
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-neutral-950 text-neutral-100 font-mono p-8">
        <div className="max-w-lg w-full border border-red-800 bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-red-950 border-b border-red-800 px-6 py-4">
            <h1 className="text-red-400 font-bold text-sm uppercase tracking-widest">
              Render Error — Application Crashed
            </h1>
          </div>

          <div className="px-6 py-4 flex flex-col gap-4">
            <p className="text-neutral-300 text-xs leading-relaxed">
              An unexpected error occurred in the UI. Your unsaved project data
              is still in memory — reloading the page will restore the app to its
              initial state, but may lose in-progress work.
            </p>

            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-red-300 text-[11px] break-all">
                {this.state.errorMessage || "Unknown error"}
              </p>
              {this.state.errorStack && (
                <pre className="text-neutral-500 text-[10px] mt-2 whitespace-pre-wrap">
                  {this.state.errorStack}
                </pre>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={this.handleCopyDetails}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors cursor-pointer"
              >
                Copy Details
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-700 hover:bg-red-600 text-white transition-colors cursor-pointer"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
