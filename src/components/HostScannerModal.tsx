import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Search } from 'lucide-react';
import { hostCheckinAttendee } from '../services/api';

interface HostScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  attendees: any[];
  combinedGuests: any[];
  onCheckinSuccess: () => void;
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCodeSubmit = async (code: string) => {
    if (!code.trim()) return;
    let cleanCode = code.trim();
    if (cleanCode.startsWith('KWG1:')) {
      const parts = cleanCode.split(':');
      if (parts.length >= 3) {
        cleanCode = parts[2];
      }
    }
    try {
      const res = await hostCheckinAttendee(eventId, { code: cleanCode });
      setScanResult({
        type: res.status === 'already' ? 'already' : 'success',
        name: res.name,
        checkedInAt: res.checked_in_at
      });
      setManualTicketCode('');
      onCheckinSuccess();
    } catch (err: any) {
      setScanResult({
        type: 'error',
        message: err.message || 'Invalid or unassigned ticket'
      });
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
        message: err.message || 'Check-in failed'
      });
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let stream: MediaStream | null = null;
    let active = true;
    let animId: number | null = null;
    let lastScanned = '';

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ['qr_code'] }) : null;

        let jsQRFn: any = null;
        if (!detector) {
          try {
            const mod = await import('jsqr');
            jsQRFn = mod.default || mod;
          } catch {}
        }

        const tick = async () => {
          if (!active) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              if (detector) {
                const codes = await detector.detect(video);
                if (codes && codes.length > 0 && codes[0].rawValue) {
                  const val = String(codes[0].rawValue);
                  if (val !== lastScanned) {
                    lastScanned = val;
                    await handleCodeSubmit(val);
                  }
                }
              } else if (canvasRef.current && jsQRFn) {
                const canvas = canvasRef.current;
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 240;
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, w, h);
                  const imgData = ctx.getImageData(0, 0, w, h);
                  const qr = jsQRFn(imgData.data, w, h);
                  if (qr && qr.data && qr.data !== lastScanned) {
                    lastScanned = qr.data;
                    await handleCodeSubmit(qr.data);
                  }
                }
              }
            } catch {}
          }
          if (active) {
            animId = window.setTimeout(tick, 400) as unknown as number;
          }
        };

        tick();
      } catch (e) {
        console.warn('Camera stream error:', e);
      }
    };

    startCamera();

    return () => {
      active = false;
      if (animId !== null) clearTimeout(animId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [isOpen, eventId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4">
      <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40">
        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
          <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-2">
            <Camera className="w-4 h-4 text-[var(--gold-text)]" />
            <span>Check in guests — {eventTitle}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-[var(--card-border)] grid place-items-center">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Scan / Check-in Feedback Banner */}
        {scanResult && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold flex items-center gap-2.5 ${
              scanResult.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : scanResult.type === 'already'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-rose-500/20 border-rose-500/50 text-rose-300'
            }`}
          >
            {scanResult.type === 'success' && <span className="text-lg">✓</span>}
            <span>
              {scanResult.type === 'success'
                ? `✓ ${scanResult.name}`
                : scanResult.type === 'already'
                ? `Already checked in at ${scanResult.checkedInAt}`
                : scanResult.message || 'Not a ticket for this event'}
            </span>
          </div>
        )}

        {/* Manual Ticket Code Entry */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleCodeSubmit(manualTicketCode);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={manualTicketCode}
            onChange={e => setManualTicketCode(e.target.value)}
            placeholder="Enter ticket code or KWG1 payload..."
            className="kw-input text-xs flex-1"
          />
          <button
            type="submit"
            className="kw-btn kw-btn-gold text-xs py-2 px-3.5 font-bold rounded-lg cursor-pointer"
          >
            Verify Ticket
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
              className="kw-input text-xs pl-8 py-1.5 w-full"
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {[
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
            ]
              .filter(r => !scannerSearch.trim() || r.name.toLowerCase().includes(scannerSearch.trim().toLowerCase()))
              .map(r => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-[var(--fg)]">{r.name}</span>
                  {r.checked_in_at ? (
                    <span className="text-emerald-400 font-bold">
                      ✓ Checked in ({new Date(r.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
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
