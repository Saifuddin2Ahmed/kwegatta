import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, CameraOff, SwitchCamera } from 'lucide-react';

export type ScanFeedbackOutcome = 'ok' | 'already' | 'retry';

export interface QrScannerProps {
  onDetect: (text: string) => Promise<ScanFeedbackOutcome> | ScanFeedbackOutcome;
  paused?: boolean;
}

type CameraStatus = 'starting' | 'active' | 'denied' | 'unavailable';
type FlashColor = 'green' | 'amber' | 'red' | null;

let sharedAudioCtx: AudioContext | null = null;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctor) {
        sharedAudioCtx = new Ctor();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playScanBeep(outcome: ScanFeedbackOutcome) {
  try {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = outcome === 'ok' ? 880 : outcome === 'already' ? 660 : 320;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Ignore audio errors
  }
}

export const QrScanner: React.FC<QrScannerProps> = ({ onDetect, paused = false }) => {
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState<number>(0);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);
  const [flashColor, setFlashColor] = useState<FlashColor>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const jsQrRef = useRef<any>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const postDetectPauseUntilRef = useRef<number>(0);
  const cooldownMapRef = useRef<Map<string, number>>(new Map());

  // Unlock Web Audio on first user interaction
  useEffect(() => {
    const unlock = () => {
      ensureAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Preload jsQR immediately when scanner opens
  useEffect(() => {
    let mounted = true;
    import('jsqr')
      .then(mod => {
        if (mounted) {
          jsQrRef.current = mod.default || mod;
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try {
          t.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let rafId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let lastTickMs = 0;

    const startCameraAndLoop = async () => {
      stopStream();

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (active) setStatus('unavailable');
        return;
      }

      if (active) setStatus('starting');

      let mediaStream: MediaStream | null = null;
      try {
        const chosenDevice = videoDevices[deviceIndex];
        const videoConstraints: MediaTrackConstraints = chosenDevice?.deviceId
          ? {
              deviceId: { exact: chosenDevice.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            };

        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false
          });
        } catch (err: any) {
          const errName = err?.name || '';
          if (
            errName === 'OverconstrainedError' ||
            errName === 'NotFoundError' ||
            errName === 'ConstraintNotSatisfiedError'
          ) {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false
            });
          } else {
            throw err;
          }
        }
      } catch (err: any) {
        if (!active) return;
        const errName = err?.name || '';
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError'
        ) {
          setStatus('denied');
        } else {
          setStatus('unavailable');
        }
        return;
      }

      if (!active) {
        mediaStream?.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = mediaStream;

      // Continuous autofocus if supported
      try {
        const [track] = mediaStream.getVideoTracks();
        if (track && typeof track.getCapabilities === 'function') {
          const caps: any = track.getCapabilities();
          if (Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as any]
            });
          }
        }
      } catch {
        // Ignore constraint errors
      }

      // Enumerate videoinput devices for camera switcher
      try {
        if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
          const allDevs = await navigator.mediaDevices.enumerateDevices();
          if (active) {
            const cams = allDevs.filter(d => d.kind === 'videoinput');
            setVideoDevices(cams);
          }
        }
      } catch {}

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch {}
      }

      if (!active) return;
      setStatus('active');

      // Setup BarcodeDetector if supported
      let detector: any = null;
      try {
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          const BD: any = (window as any).BarcodeDetector;
          let supported = true;
          if (typeof BD.getSupportedFormats === 'function') {
            const formats = await BD.getSupportedFormats();
            supported = Array.isArray(formats) && formats.includes('qr_code');
          }
          if (supported) {
            detector = new BD({ formats: ['qr_code'] });
          }
        }
      } catch {
        detector = null;
      }

      const handleDetectedText = async (rawText: string) => {
        const text = String(rawText || '').trim();
        if (!text) return;

        const now = Date.now();
        // Clean expired cooldowns (> 3000ms)
        for (const [k, ts] of cooldownMapRef.current.entries()) {
          if (now - ts >= 3000) {
            cooldownMapRef.current.delete(k);
          }
        }

        const prevTs = cooldownMapRef.current.get(text);
        if (prevTs !== undefined && now - prevTs < 3000) {
          return;
        }

        cooldownMapRef.current.set(text, now);
        postDetectPauseUntilRef.current = now + 1500;

        try {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(120);
          }
        } catch {}

        let outcome: ScanFeedbackOutcome = 'retry';
        try {
          outcome = await onDetectRef.current(text);
        } catch {
          outcome = 'retry';
        }

        playScanBeep(outcome);
        if (active) {
          setFlashColor(outcome === 'ok' ? 'green' : outcome === 'already' ? 'amber' : 'red');
          timerId = setTimeout(() => {
            if (active) setFlashColor(null);
          }, 1500);
        }
      };

      const scanStep = async () => {
        if (!active) return;
        const now = Date.now();

        if (
          !busy &&
          !pausedRef.current &&
          now >= postDetectPauseUntilRef.current &&
          now - lastTickMs >= 120
        ) {
          lastTickMs = now;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            busy = true;
            try {
              if (detector) {
                const barcodes = await detector.detect(video);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  await handleDetectedText(String(barcodes[0].rawValue));
                }
              } else if (jsQrRef.current) {
                if (!offscreenCanvasRef.current) {
                  offscreenCanvasRef.current = document.createElement('canvas');
                }
                const canvas = offscreenCanvasRef.current;
                const vw = video.videoWidth || 480;
                const vh = video.videoHeight || 480;
                // Centre square crop (~70% viewfinder region)
                const minDim = Math.min(vw, vh);
                const cropSize = Math.max(1, Math.floor(minDim * 0.7));
                const sx = Math.floor((vw - cropSize) / 2);
                const sy = Math.floor((vh - cropSize) / 2);
                const targetSize = Math.min(480, cropSize);

                if (canvas.width !== targetSize || canvas.height !== targetSize) {
                  canvas.width = targetSize;
                  canvas.height = targetSize;
                }

                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);
                  const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
                  const qr = jsQrRef.current(imgData.data, targetSize, targetSize, {
                    inversionAttempts: 'dontInvert'
                  });
                  if (qr && qr.data) {
                    await handleDetectedText(String(qr.data));
                  }
                }
              }
            } catch {
              // Ignore single-frame decode errors
            } finally {
              busy = false;
            }
          }
        }

        if (active) {
          rafId = window.requestAnimationFrame(scanStep);
        }
      };

      rafId = window.requestAnimationFrame(scanStep);
    };

    const handleVisibilityChange = () => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        stopStream();
      } else if (document.visibilityState === 'visible') {
        startCameraAndLoop();
      }
    };

    startCameraAndLoop();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      stopStream();
    };
  }, [deviceIndex, retryTrigger, stopStream]);

  const bracketBorderColor =
    flashColor === 'green'
      ? 'border-emerald-400'
      : flashColor === 'amber'
      ? 'border-amber-400'
      : flashColor === 'red'
      ? 'border-rose-400'
      : 'border-[var(--gold)]';

  const frameGlowClass =
    flashColor === 'green'
      ? 'ring-4 ring-emerald-500/40 bg-emerald-500/10'
      : flashColor === 'amber'
      ? 'ring-4 ring-amber-500/40 bg-amber-500/10'
      : flashColor === 'red'
      ? 'ring-4 ring-rose-500/40 bg-rose-500/10'
      : '';

  return (
    <div className="space-y-2">
      <div className="relative w-full max-w-[360px] mx-auto aspect-square rounded-2xl overflow-hidden bg-[#070B12] border border-[var(--card-border)] grid place-items-center">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover ${status === 'active' ? 'block' : 'hidden'}`}
        />

        {status === 'starting' && (
          <div className="flex flex-col items-center justify-center gap-2.5 p-6 text-center text-xs text-[var(--fg-muted)]">
            <RefreshCw className="w-6 h-6 text-[var(--gold-text)] animate-spin" />
            <span className="font-medium">Starting camera…</span>
          </div>
        )}

        {status === 'denied' && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <CameraOff className="w-7 h-7 text-rose-400" />
            <p className="text-xs text-[var(--fg)] leading-relaxed">
              Camera access is blocked. Allow camera for kwegatta.ai.studio in your browser settings, then tap Try again.
            </p>
            <button
              type="button"
              onClick={() => setRetryTrigger(c => c + 1)}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold rounded-lg cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'unavailable' && (
          <div className="flex flex-col items-center justify-center gap-2.5 p-6 text-center">
            <CameraOff className="w-7 h-7 text-[var(--fg-muted)]" />
            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              No camera available — use the ticket code below.
            </p>
          </div>
        )}

        {status === 'active' && (
          <>
            {/* Dimmed outer mask + centered 70% square viewfinder */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`relative w-[70%] h-[70%] rounded-2xl transition-all duration-150 ${frameGlowClass}`}
                style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)' }}
              >
                {/* Four rounded gold corner brackets */}
                <span
                  className={`absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 rounded-tl-xl transition-colors ${bracketBorderColor}`}
                />
                <span
                  className={`absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 rounded-tr-xl transition-colors ${bracketBorderColor}`}
                />
                <span
                  className={`absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 rounded-bl-xl transition-colors ${bracketBorderColor}`}
                />
                <span
                  className={`absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 rounded-br-xl transition-colors ${bracketBorderColor}`}
                />

                {/* Animated scan line inside the frame (respects prefers-reduced-motion) */}
                <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-80 motion-safe:animate-pulse" />
              </div>
            </div>

            {/* Switch camera button when multiple cameras exist */}
            {videoDevices.length > 1 && (
              <button
                type="button"
                onClick={() => setDeviceIndex(i => (i + 1) % videoDevices.length)}
                className="absolute bottom-3 right-3 kw-btn py-1.5 px-2.5 text-[11px] font-semibold rounded-lg bg-black/70 text-white border border-white/20 hover:bg-black/90 flex items-center gap-1.5 cursor-pointer"
              >
                <SwitchCamera className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                <span>Switch camera</span>
              </button>
            )}
          </>
        )}
      </div>

      <p className="text-center text-xs text-[var(--fg-muted)]">
        Point the camera at the ticket QR
      </p>
    </div>
  );
};

export default QrScanner;
