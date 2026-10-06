import React, { useState, useEffect } from 'react';
import { Sparkles, Database, Check, AlertCircle, RefreshCw, UserMinus, UserPlus, LogOut, ShieldCheck, Cpu } from 'lucide-react';
import { callGemma, GEMMA_MODEL_ID, db, APP_NAME } from '../services/api';

interface SetupViewProps {
  onSignOut: () => void;
  onRefreshData: () => void;
  onToast: (msg: string) => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  onSignOut,
  onRefreshData,
  onToast
}) => {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [serverConfig, setServerConfig] = useState<{ model?: string; hasServerApiKey?: boolean; storage?: string } | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(setServerConfig)
      .catch(console.error);
  }, []);

  const handleTestGemma = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await callGemma(
        'Confirm you are Gemma 4 running in open-weight mode for Kwegatta at Hack Day Kampala x MUBS. Answer in one crisp sentence.',
        { temperature: 0.2 }
      );
      setTestResult(`Success: ${response}`);
      onToast('Gemma 4 responded successfully');
    } catch (err: any) {
      setTestResult(`Error calling Gemma 4: ${err.message}. (App falls back to keyword heuristic matching)`);
      onToast('Test failed: ' + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSeedDemo = async () => {
    try {
      const count = await db.seedDemo();
      onToast(`8 demo members loaded. Total members: ${count}`);
      onRefreshData();
    } catch (err) {
      onToast('Failed to seed demo members');
    }
  };

  const handleClearDemo = async () => {
    try {
      const count = await db.clearDemo();
      onToast(`Demo members cleared. Remaining members: ${count}`);
      onRefreshData();
    } catch (err) {
      onToast('Failed to clear demo members');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">System Setup & Diagnostics</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Verify open-weight AI connectivity, manage demo members, and inspect configuration.
        </p>
      </div>

      {/* Model & Architecture Guardrails Card */}
      <div className="primer-box p-4 space-y-3 bg-[var(--subtle)]">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Cpu className="w-4 h-4 text-[var(--done)]" />
          <span>Open-Weight AI Model Verification</span>
        </div>

        <div className="p-3 bg-[var(--bg)] rounded border border-[var(--border)] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">Designated Model:</span>
            <span className="font-mono font-semibold text-[var(--accent)]">{GEMMA_MODEL_ID}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">Licence:</span>
            <a
              href="https://ai.google.dev/gemma/docs/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              Apache 2.0 (Open-Weight Model)
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">API Key Placement:</span>
            <span className="font-semibold text-[var(--success)] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Server-side only (never exposed in browser)</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">Server API Key Configured:</span>
            <span className={serverConfig?.hasServerApiKey ? 'text-[var(--success)]' : 'text-[var(--attention)]'}>
              {serverConfig?.hasServerApiKey ? 'Yes (active on server)' : 'Fallback mode (keyword ranking)'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">Persistence Engine:</span>
            <span className="font-mono font-semibold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className={serverConfig?.storage === 'firestore' ? 'text-[var(--success)]' : 'text-[var(--accent)]'}>
                {serverConfig?.storage === 'firestore' ? 'Cloud Firestore (Native Mode, us-west1)' : 'Local Disk (.kwegatta_store.json)'}
              </span>
            </span>
          </div>
        </div>

        {/* Test Gemma Button */}
        <div>
          <button
            onClick={handleTestGemma}
            disabled={isTesting}
            className="primer-btn primer-btn-primary text-xs py-1.5 px-3"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isTesting ? 'Calling Gemma 4...' : 'Test Gemma 4'}</span>
          </button>

          {testResult && (
            <div
              className={`mt-3 p-3 rounded text-xs font-mono border leading-relaxed ${
                testResult.startsWith('Success')
                  ? 'bg-[var(--success-subtle)] border-[var(--success)] text-[var(--fg)]'
                  : 'bg-[var(--attention-subtle)] border-[var(--attention)] text-[var(--fg)]'
              }`}
            >
              {testResult}
            </div>
          )}
        </div>
      </div>

      {/* Demo Cohort Management Card */}
      <div className="primer-box p-4 space-y-3 bg-[var(--subtle)]">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Database className="w-4 h-4 text-[var(--accent)]" />
          <span>Hack Day Demo Members</span>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Quickly populate or reset 8 realistic MUBS business students and creators to simulate full matchmaking and peer learning.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleSeedDemo}
            className="primer-btn text-xs py-1.5 px-3"
          >
            <UserPlus className="w-3.5 h-3.5 text-[var(--success)]" />
            <span>Add 8 demo members</span>
          </button>
          <button
            onClick={handleClearDemo}
            className="primer-btn text-xs py-1.5 px-3"
          >
            <UserMinus className="w-3.5 h-3.5 text-[var(--danger)]" />
            <span>Remove demo members</span>
          </button>
        </div>
      </div>

      {/* Session Management */}
      <div className="primer-box p-4 bg-[var(--subtle)] flex items-center justify-between">
        <div>
          <div className="font-semibold text-xs text-[var(--fg)]">Device Session</div>
          <div className="text-[11px] text-[var(--muted)]">
            Sign out of your local profile on this browser to onboard a new member.
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="primer-btn text-xs py-1 px-3 text-[var(--danger)] hover:bg-[var(--danger)]/10"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
};
