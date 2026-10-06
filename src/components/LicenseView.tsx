import React from 'react';
import { ArrowLeft, Scale, Github, ExternalLink } from 'lucide-react';

interface LicenseViewProps {
  onBack: () => void;
}

export const LicenseView: React.FC<LicenseViewProps> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 space-y-6 animate-in fade-in">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="kw-btn kw-btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <span className="text-xs text-[var(--fg-muted)]">Open Source License</span>
      </div>

      {/* Header */}
      <div className="space-y-3 border-b border-[var(--card-border)] pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] text-xs font-semibold">
          <Scale className="w-3.5 h-3.5" />
          <span>OSI-Approved Open Source</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-[var(--fg)] tracking-tight">
          MIT License
        </h1>
        <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
          Kwegatta is fully open-source software licensed under the permissive MIT License. You are free to use, modify, study, distribute, and contribute.
        </p>
      </div>

      {/* License Body */}
      <div className="kw-card p-6 sm:p-8 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl font-mono text-xs text-[var(--fg)] leading-relaxed shadow-sm space-y-4">
        <p className="font-bold text-sm text-[var(--gold)]">
          Copyright (c) 2026 The Kwegatta Team
        </p>
        <p>
          Permission is hereby granted, free of charge, to any person obtaining a copy
          of this software and associated documentation files (the &quot;Software&quot;), to deal
          in the Software without restriction, including without limitation the rights
          to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
          copies of the Software, and to permit persons to whom the Software is
          furnished to do so, subject to the following conditions:
        </p>
        <p>
          The above copyright notice and this permission notice shall be included in all
          copies or substantial portions of the Software.
        </p>
        <p className="text-[var(--fg-muted)] uppercase text-[11px] tracking-wide">
          THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
          AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
          LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
          OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
          SOFTWARE.
        </p>
      </div>

      {/* GitHub Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]">
        <span className="text-xs text-[var(--fg-muted)]">
          View official source repository and license file:
        </span>
        <a
          href="https://github.com/Saifuddin2Ahmed/kwegatta/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          className="kw-btn kw-btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
        >
          <Github className="w-3.5 h-3.5" />
          <span>View LICENSE on GitHub</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </a>
      </div>
    </div>
  );
};
