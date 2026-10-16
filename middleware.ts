import { NextRequest, NextResponse } from 'next/server';

// Verrou global : si la variable ACCESS_CODE est définie sur Vercel, rien n'est
// accessible (pages comme API) sans le cookie délivré par /acces.
// Sans ACCESS_CODE, l'application reste ouverte à tous.
const COOKIE = 'pokescan_access';

// Même empreinte que app/lib/guard.ts (ici avec l'API Web Crypto, compatible Edge).
async function tokenFor(code: string): Promise<string> {
  const data = new TextEncoder().encode(`pokescan:${code}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === '/acces' || pathname === '/api/access') return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await tokenFor(code))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Code d’accès requis.', code: 'ACCESS_CODE_REQUIRED' },
      { status: 401 }
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/acces';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
};
