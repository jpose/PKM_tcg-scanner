'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onCapture: (base64: string, mimeType: string) => void;
  isBusy: boolean;
}

export default function CameraCapture({ onCapture, isBusy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
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
      } catch (err) {
        console.error(err);
        setError(
          "Impossible d'accéder à la caméra. Vérifiez les autorisations, ou utilisez un fichier ci-dessous."
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 800;
    canvas.height = Math.round((800 * video.videoHeight) / video.videoWidth);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.split(',')[1];
    onCapture(base64, 'image/jpeg');
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      onCapture(base64, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-black card-shadow">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
            Activation de la caméra…
          </div>
        )}
        {isBusy && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
            <div className="relative w-4/5 h-2/3 border-2 border-poke-yellow/70 rounded-lg overflow-hidden">
              <div className="scan-line absolute left-0 right-0 h-0.5 bg-poke-yellow shadow-[0_0_10px_2px_rgba(255,203,5,0.8)]" />
            </div>
            <p className="text-white text-sm font-medium">Analyse de la carte…</p>
          </div>
        )}
        {/* Cadre guide */}
        {ready && !isBusy && (
          <div className="absolute inset-6 border-2 border-white/50 rounded-xl pointer-events-none" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="mt-4 flex flex-col items-center gap-3">
        <button
          onClick={handleCapture}
          disabled={!ready || isBusy}
          className="w-16 h-16 rounded-full bg-poke-red border-4 border-white ring-2 ring-poke-red disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
          aria-label="Prendre la photo"
        />
        <label className="text-sm text-poke-blue underline cursor-pointer">
          ou importer une photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isBusy}
          />
        </label>
      </div>
    </div>
  );
}
