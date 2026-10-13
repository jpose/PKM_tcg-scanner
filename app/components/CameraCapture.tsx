'use client';

import { useEffect, useRef, useState } from 'react';
import { CAPTURE_MAX_SIDE, CAPTURE_QUALITY, fileToResizedBase64 } from '../lib/imageResize';
import Pokeball from './Pokeball';

export type ScanPhase = 'idle' | 'reading' | 'searching';

interface Props {
  onCapture: (base64: string, mimeType: string) => void;
  phase: ScanPhase;
}

const PHASE_LABEL: Record<Exclude<ScanPhase, 'idle'>, string> = {
  reading: 'Lecture de la carte…',
  searching: 'Recherche dans le Pokédex…',
};

export default function CameraCapture({ onCapture, phase }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const busy = phase !== 'idle';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError('Caméra indisponible. Autorisez-la dans votre navigateur ou importez une photo.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleShutter() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    // Image réduite dès la capture : envoi et lecture IA beaucoup plus rapides.
    const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', CAPTURE_QUALITY).split(',')[1], 'image/jpeg');
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { base64, mimeType } = await fileToResizedBase64(file);
      onCapture(base64, mimeType);
    } catch {
      setError('Impossible de lire cette image. Essayez un autre fichier.');
    }
  }

  const corner = 'absolute h-7 w-7 border-white';

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Écran du Pokédex : il rétrécit sur les écrans courts pour que les boutons restent visibles */}
      <div
        className="mx-auto rounded-[28px] border-2 border-ink bg-[#C9D1DE] p-3 shadow-[0_5px_0_#1B2340]"
        style={{ width: 'max(12rem, min(100%, 24rem, calc((100svh - 360px) * 0.72)))' }}
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-[18px] border-2 border-ink bg-ink">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

          {/* Cadre au format carte (63 × 88) */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-[63/88] h-[86%] -translate-x-1/2 -translate-y-1/2">
            <span className={`${corner} left-0 top-0 rounded-tl-xl border-l-4 border-t-4`} />
            <span className={`${corner} right-0 top-0 rounded-tr-xl border-r-4 border-t-4`} />
            <span className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4`} />
            <span className={`${corner} bottom-0 right-0 rounded-br-xl border-b-4 border-r-4`} />
            {phase === 'reading' && (
              <span className="scanline absolute inset-x-1 h-0.5 bg-lens shadow-[0_0_12px_3px_rgba(58,160,255,0.9)]" />
            )}
          </div>

          {!ready && !error && (
            <p className="absolute inset-0 grid place-items-center text-sm font-bold text-white/80">
              Allumage de la caméra…
            </p>
          )}

          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/75 backdrop-blur-[2px]">
              <Pokeball size={72} className="wobble" />
              <p className="font-display text-base text-white" role="status">
                {PHASE_LABEL[phase as Exclude<ScanPhase, 'idle'>]}
              </p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border-2 border-dex bg-white px-3 py-2 text-center text-sm font-bold text-dex-deep">
          {error}
        </p>
      )}

      {/* Déclencheur */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={handleShutter}
          disabled={!ready || busy}
          aria-label="Scanner la carte avec la caméra"
          className="rounded-full bg-white p-1 shadow-[0_4px_0_#1B2340] ring-2 ring-ink transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50"
        >
          <Pokeball size={64} />
        </button>
      </div>

      {/* Import : bouton pleine largeur, toujours visible sous le déclencheur */}
      <label
        className={`btn-chunky mt-4 flex w-full cursor-pointer ${error ? 'bg-pika' : 'bg-white'} ${
          busy ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="m21 16-5-5-8 8" />
        </svg>
        Importer une photo
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={busy} />
      </label>
      <p className="mt-3 text-center text-xs font-semibold text-ink/65">
        Carte à plat, bien éclairée, sans reflet.
      </p>
    </div>
  );
}
