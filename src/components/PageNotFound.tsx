import React from 'react';
import { ArrowLeft, Home } from 'lucide-react';

interface PageNotFoundProps {
  message?: string;
  onGoHome: () => void;
}

export const PageNotFound: React.FC<PageNotFoundProps> = ({
  message = 'The requested page does not exist.',
  onGoHome
}) => {
  const handleBack = () => {
    // Opened directly (no history in this tab): "Back" behaves like "Go home"
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      onGoHome();
    }
  };

  return (
    <div className="kw-card p-12 text-center space-y-4 max-w-md mx-auto" data-testid="page-not-found">
      <h3 className="font-bold text-base text-[var(--fg)]">Page not found</h3>
      <p className="text-xs text-[var(--fg-muted)]">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleBack}
          className="kw-btn kw-btn-ghost text-xs py-2 px-4 border border-[var(--card-border)] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <button
          type="button"
          onClick={onGoHome}
          className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold inline-flex items-center gap-1.5"
        >
          <Home className="w-3.5 h-3.5" />
          Go home
        </button>
      </div>
    </div>
  );
};
