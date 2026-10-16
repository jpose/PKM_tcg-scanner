import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Protège la route /api/identify (donc vos clés Gemini gratuites) :
 *  1. refuse les images trop lourdes et les appels venant d'un autre site ;
 *  2. exige un code d'accès si la variable ACCESS_CODE est définie ;
 *  3. limite le nombre de scans par appareil (minute / jour) ;
 *  4. plafonne le total de scans par jour pour toute l'application.
 *
 * Les compteurs sont partagés entre toutes les instances si Upstash Redis est
 * configuré (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Sinon ils sont
 * gardés en mémoire : efficace mais approximatif, car Vercel peut faire tourner
 * plusieurs instances. Le code d'accès, lui, protège dans tous les cas.
 */

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code?: string; retryAfter?: number };

const MAX_BODY_BYTES = 1_500_000;

export const ACCESS_COOKIE = 'pokescan_access';
// Valeur stockée dans le cookie : une empreinte du code, jamais le code lui-même.
// Changer ACCESS_CODE sur Vercel invalide donc toutes les sessions existantes.
export const accessToken = (code: string) =>
  createHash('sha256').update(`pokescan:${code}`).digest('hex');

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

// ---------- Compteurs (Upstash si disponible, sinon mémoire) ----------
const memory = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  if (memory.size < 5000) return;
  memory.forEach((v, k) => {
    if (v.resetAt <= now) memory.delete(k);
  });
}

async function increment(key: string, windowSec: number): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, windowSec * 2],
        ]),
      });
      if (res.ok) {
        const data = await res.json();
        const n = data?.[0]?.result;
        if (typeof n === 'number') return n;
      }
    } catch {
      /* Redis injoignable : on se rabat sur la mémoire */
    }
  }

  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    prune(now);
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function secondsUntilNextWindow(windowSec: number): number {
  return windowSec - (Math.floor(Date.now() / 1000) % windowSec);
}

function clientId(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'inconnu'
  );
}

export async function checkRequest(req: NextRequest): Promise<GuardResult> {
  // 1) Taille et origine
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Image trop lourde. Réessayez avec une photo plus petite.' };
  }
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return { ok: false, status: 403, error: 'Origine non autorisée.' };
      }
    } catch {
      return { ok: false, status: 403, error: 'Origine non autorisée.' };
    }
  }

  // 2) Code d'accès (actif seulement si ACCESS_CODE est défini).
  // Le middleware bloque déjà les visiteurs sans cookie ; on revérifie ici
  // par sécurité, car cette route est celle qui consomme le quota Gemini.
  const required = process.env.ACCESS_CODE;
  if (required) {
    const cookie = req.cookies.get(ACCESS_COOKIE)?.value ?? '';
    if (!cookie || !safeEqual(cookie, accessToken(required))) {
      return { ok: false, status: 401, error: 'Code d’accès requis.', code: 'ACCESS_CODE_REQUIRED' };
    }
  }

  // 3) Limites par appareil, puis 4) plafond global
  const id = clientId(req);
  const perMinute = num(process.env.RATE_LIMIT_PER_MINUTE, 8);
  const perDayIp = num(process.env.RATE_LIMIT_PER_IP_PER_DAY, 150);
  const perDayGlobal = num(process.env.MAX_SCANS_PER_DAY, 600);
  const now = Math.floor(Date.now() / 1000);

  const minuteCount = await increment(`rl:m:${id}:${Math.floor(now / 60)}`, 60);
  if (minuteCount > perMinute) {
    const wait = secondsUntilNextWindow(60);
    return { ok: false, status: 429, error: `Trop de scans d’affilée. Réessayez dans ${wait} s.`, retryAfter: wait };
  }

  const dayCount = await increment(`rl:d:${id}:${Math.floor(now / 86400)}`, 86400);
  if (dayCount > perDayIp) {
    return {
      ok: false,
      status: 429,
      error: 'Limite quotidienne de scans atteinte pour cet appareil. Revenez demain.',
      retryAfter: secondsUntilNextWindow(86400),
    };
  }

  const globalCount = await increment(`rl:g:${Math.floor(now / 86400)}`, 86400);
  if (globalCount > perDayGlobal) {
    return {
      ok: false,
      status: 429,
      error: 'Le quota quotidien de l’application est atteint. Revenez demain.',
      retryAfter: secondsUntilNextWindow(86400),
    };
  }

  return { ok: true };
}

/** Limite les essais de code (anti force brute) : 5 par minute, 40 par jour et par appareil. */
export async function checkLoginAttempt(req: NextRequest): Promise<GuardResult> {
  const id = clientId(req);
  const now = Math.floor(Date.now() / 1000);

  if ((await increment(`rl:login:m:${id}:${Math.floor(now / 60)}`, 60)) > 5) {
    const wait = secondsUntilNextWindow(60);
    return { ok: false, status: 429, error: `Trop d’essais. Réessayez dans ${wait} s.`, retryAfter: wait };
  }
  if ((await increment(`rl:login:d:${id}:${Math.floor(now / 86400)}`, 86400)) > 40) {
    return {
      ok: false,
      status: 429,
      error: 'Trop d’essais aujourd’hui. Revenez demain.',
      retryAfter: secondsUntilNextWindow(86400),
    };
  }
  return { ok: true };
}

export { safeEqual };
