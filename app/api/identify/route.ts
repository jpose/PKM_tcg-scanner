import { NextRequest, NextResponse } from 'next/server';
import { getKeysRoundRobinOrder, isQuotaOrRateLimitError } from '../../lib/geminiKeyPool';

export const runtime = 'nodejs';
export const maxDuration = 30;
// Paris : rapproche la fonction de vos utilisateurs.
export const preferredRegion = 'cdg1';

// Modifiable sans toucher au code via la variable d'environnement GEMINI_MODEL
// (utile si Google retire encore un modèle).
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Prompt court = moins de tokens en entrée, réponse plus rapide.
const PROMPT =
  'Carte Pokémon (JCC). Lis le texte imprimé et réponds en JSON avec exactement ces clés : ' +
  '"name" (nom exact de la carte tel qu\'imprimé), "cardNumber" (ex "4/102", sinon null), ' +
  '"setName" (extension si lisible, sinon null), "rarity" (sinon null). ' +
  'Si l\'image n\'est pas une carte Pokémon : {"name": null}.';

function buildBody(imageBase64: string, mimeType: string, withThinkingConfig: boolean) {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 600,
      // Lire un nom de carte ne demande aucun raisonnement : c'était la
      // cause principale de la lenteur (thinking "medium" par défaut).
      ...(withThinkingConfig ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
    },
  };
}

async function callGemini(apiKey: string, body: unknown): Promise<Response> {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
}

function httpError(res: Response, detail: string) {
  const err: any = new Error(detail || `Erreur Gemini (${res.status})`);
  err.status = res.status;
  return err;
}

async function identifyWithKey(apiKey: string, imageBase64: string, mimeType: string) {
  let res = await callGemini(apiKey, buildBody(imageBase64, mimeType, true));

  // Filet de sécurité : si Google rejette le réglage "thinking", on réessaie sans.
  if (res.status === 400) {
    res = await callGemini(apiKey, buildBody(imageBase64, mimeType, false));
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {}
    throw httpError(res, detail);
  }

  const json = await res.json();
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(text);
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const keys = getKeysRoundRobinOrder();

  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'Aucune clé Gemini configurée sur le serveur (GEMINI_API_KEYS).' },
      { status: 500 }
    );
  }

  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  try {
    ({ imageBase64, mimeType } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!imageBase64) {
    return NextResponse.json({ error: 'Aucune image reçue.' }, { status: 400 });
  }

  let lastError: any = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      const result = await identifyWithKey(keys[i], imageBase64, mimeType || 'image/jpeg');
      return NextResponse.json({ result, ms: Date.now() - started });
    } catch (err: any) {
      lastError = err;
      if (err instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Réponse illisible, réessayez avec une photo plus nette.' },
          { status: 502 }
        );
      }
      if (isQuotaOrRateLimitError(err) && i < keys.length - 1) continue;
      break;
    }
  }

  console.error('Erreur identification Gemini :', lastError);
  const quota = isQuotaOrRateLimitError(lastError);
  return NextResponse.json(
    {
      error: quota
        ? 'Quota Gemini gratuit atteint sur toutes les clés. Réessayez plus tard ou ajoutez une clé.'
        : lastError?.message || 'Erreur lors de l’identification.',
    },
    { status: quota ? 429 : 500 }
  );
}
