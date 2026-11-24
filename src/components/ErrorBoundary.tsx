import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(message) as { error?: string; operationType?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.includes('Quota exceeded')) {
          message = 'Daily Firestore quota exceeded. Please try again tomorrow.';
        } else {
          message = `Database sync error (${parsed.operationType ?? 'read'}): ${parsed.error}`;
        }
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#0F1117] border border-white/25 rounded-[4px] p-6 space-y-4 shadow-2xl">
            <div className="font-display text-2xl font-extrabold uppercase text-[#6EE7B7]">
              Downtown 3
            </div>
            <p className="text-sm text-[#E2E8F0] leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-mono text-xs font-extrabold uppercase tracking-wider cursor-pointer"
            >
              Reload Court
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
