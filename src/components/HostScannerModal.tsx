import React, { useState, useEffect, Suspense } from 'react';
import { Camera, X, Search } from 'lucide-react';
import { hostCheckinAttendee } from '../services/api';
import {
  normalizeTicketCode,
  isValidTicketCode,
  formatLiveTicketInput
} from '../lib/ticketCode';
import type { ScanFeedbackOutcome } from './QrScanner';

const LazyQrScanner = React.lazy(() => import('./QrScanner'));

interface HostScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  attendees: any[];
  combinedGuests: any[];
  onCheckinSuccess: () => void;
}

function mapServerCheckinError(err: any): string {
  const status = err?.status;
  if (status === 409) {
    return 'Check-in opens 3 hours before the event starts and closes 6 hours after it ends.';
  }
  if (status === 404) {
    return 'This ticket is not for this event.';
  }
  if (status === 403) {
    return 'Only the host can check people in.';
  }
  if (status === 503) {
    return 'Check-in is not configured on the server.';
  }
  if (!status) {
    return 'No connection — try again.';
  }
  return err?.message || 'This ticket is not for this event.';
}

function formatLocalTime(iso?: string): string {
  if (!iso) return 'earlier';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const HostScannerModal: React.FC<HostScannerModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  attendees,
  combinedGuests,
  onCheckinSuccess
}) => {
  const [manualTicketCode, setManualTicketCode] = useState('');
  const [scannerSearch, setScannerSearch] = useState('');
  const [scanResult, setScanResult] = useState<{
    type: 'success' | 'already' | 'error';
    name?: string;
    checkedInAt?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setScanResult(null);
      setManualTicketCode('');
    }
  }, [isOpen]);

  const handleCodeSubmit = async (rawInput: string): Promise<ScanFeedbackOutcome> => {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return 'retry';

    // Preserve KWG1:<eventId>:<code> prefix if present so the server can reject wrong-event QR payloads with 404
    const codePayload = /^kwg1:/i.test(trimmed)
      ? trimmed
      : normalizeTicketCode(trimmed);

    try {
      const res = await hostCheckinAttendee(eventId, { code: codePayload });
      const isAlready = res.status === 'already';
      setScanResult({
        type: isAlready ? 'already' : 'success',
        name: res.name,
        checkedInAt: res.checked_in_at
      });
      setManualTicketCode('');
      onCheckinSuccess();
      return isAlready ? 'already' : 'ok';
    } catch (err: any) {
      setScanResult({
        type: 'error',
        message: mapServerCheckinError(err)
      });
      return 'retry';
    }
  };

  const handleManualCheckin = async (kind: 'member' | 'guest', refId: string) => {
    try {
      const res = await hostCheckinAttendee(eventId, { kind, ref_id: refId });
      setScanResult({
        type: res.status === 'already' ? 'already' : 'success',
        name: res.name,
        checkedInAt: res.checked_in_at
      });
      onCheckinSuccess();
    } catch (err: any) {
      setScanResult({
        type: 'error',
        message: mapServerCheckinError(err)
      });
    }
  };

  if (!isOpen) return null;

  const allRegistrants = [
    ...attendees.map((m: any) => ({
      id: m.id,
      name: m.name || 'Member',
      kind: 'member' as const,
      checked_in_at: m.checked_in_at
    })),
    ...combinedGuests.map((g: any) => ({
      id: g.id,
      name: g.name || 'Guest',
      kind: 'guest' as const,
      checked_in_at: g.checked_in_at
    }))
  ];

  const totalCount = allRegistrants.length;
  const checkedInCount = allRegistrants.filter(r => Boolean(r.checked_in_at)).length;
  const normalizedManual = normalizeTicketCode(manualTicketCode);
  const isManualCodeValid = isValidTicketCode(normalizedManual);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4">
      <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40">
        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 gap-2">
          <div className="space-y-0.5">
            <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-2">
              <Camera className="w-4 h-4 text-[var(--gold-text)]" />
              <span>Check in guests — {eventTitle}</span>
            </h3>
            <p className="text-xs font-semibold text-[var(--gold-text)]" data-testid="checkin-live-counter">
              Checked in {checkedInCount} / {totalCount}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
            aria-label="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shared QR Scanner with Viewfinder */}
        <Suspense
          fallback={
            <div className="w-full max-w-[360px] mx-auto aspect-square rounded-2xl bg-[#070B12] border border-[var(--card-border)] grid place-items-center text-xs text-[var(--fg-muted)]">
              Starting camera…
            </div>
          }
        >
          <LazyQrScanner onDetect={handleCodeSubmit} />
        </Suspense>

        {/* Large & Clear Scan / Check-in Result Card */}
        {scanResult && (
          <div
            role="status"
            data-testid="scanner-result-card"
            className={`p-4 rounded-xl border text-sm font-bold flex items-center gap-3 ${
              scanResult.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : scanResult.type === 'already'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-rose-500/20 border-rose-500/50 text-rose-300'
            }`}
          >
            <span>
              {scanResult.type === 'success'
                ? `✓ Checked in — ${scanResult.name}`
                : scanResult.type === 'already'
                ? `Already checked in at ${formatLocalTime(scanResult.checkedInAt)}`
                : scanResult.message || 'This ticket is not for this event.'}
            </span>
          </div>
        )}

        {/* Manual Ticket Code Entry */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!isManualCodeValid) return;
            handleCodeSubmit(manualTicketCode);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={manualTicketCode}
            onChange={e => setManualTicketCode(formatLiveTicketInput(e.target.value))}
            placeholder="ABCDE-FGHIJ"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={14}
            aria-label="Ticket code"
            className="kw-input text-xs font-mono tracking-wider uppercase flex-1"
          />
          <button
            type="submit"
            disabled={!isManualCodeValid}
            className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Check in
          </button>
        </form>

        {/* Manual Attendee List with Search */}
        <div className="space-y-2 pt-2 border-t border-[var(--card-border)]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--fg-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={scannerSearch}
              onChange={e => setScannerSearch(e.target.value)}
              placeholder="Search registered members or guests..."
              className="kw-input text-xs pl-9 py-1.5 w-full"
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {allRegistrants
              .filter(
                r =>
                  !scannerSearch.trim() ||
                  r.name.toLowerCase().includes(scannerSearch.trim().toLowerCase())
              )
              .map(r => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-[var(--fg)]">{r.name}</span>
                  {r.checked_in_at ? (
                    <span className="text-emerald-400 font-bold">
                      ✓ Checked in ({formatLocalTime(r.checked_in_at)})
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleManualCheckin(r.kind, r.id)}
                      className="kw-btn kw-btn-gold text-[11px] py-1 px-2.5 rounded font-bold cursor-pointer"
                    >
                      Check in
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostScannerModal;
