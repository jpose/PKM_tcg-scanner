import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, accessToken, checkLoginAttempt, safeEqual } from '../../lib/guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const required = process.env.ACCESS_CODE;
  if (!required) return NextResponse.json({ ok: true }); // pas de verrou configuré

  const attempt = await checkLoginAttempt(req);
  if (!attempt.ok) {
    return NextResponse.json(
      { error: attempt.error },
      {
        status: attempt.status,
        headers: attempt.retryAfter ? { 'Retry-After': String(attempt.retryAfter) } : undefined,
      }
    );
  }

  let given = '';
  try {
    given = String((await req.json())?.code ?? '').trim();
  } catch {}

  if (!given || !safeEqual(given, required)) {
    return NextResponse.json({ error: 'Code incorrect.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, accessToken(required), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 jours
  });
  return res;
}
