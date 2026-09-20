import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { getKeysRoundRobinOrder, isQuotaOrRateLimitError } from '../../lib/geminiKeyPool';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `Tu es un expert en cartes à collectionner Pokémon (JCC).
On te donne la photo d'une carte Pokémon. Identifie-la aussi précisément que possible.

Réponds STRICTEMENT en JSON valide, sans texte autour, avec ce format exact :
{
  "name": "nom du Pokémon ou de la carte (ex: Dracaufeu, Dresseur Ptéra...)",
  "setName": "nom de l'extension si visible, sinon null",
  "cardNumber": "numéro de la carte tel qu'affiché, ex: 4/102, sinon null",
  "rarity": "rareté si tu peux la déduire (Commune, Peu Commune, Rare, Rare Holo, Ultra Rare...), sinon null",
  "confidence": "high, medium ou low selon ta certitude"
}

Si l'image ne contient clairement pas de carte Pokémon, réponds avec name: null pour tous les champs et confidence: "low".
Ne mets jamais de commentaires ni de texte hors du JSON.`;

export async function POST(req: NextRequest) {
  const keys = getKeysRoundRobinOrder();

  if (keys.length === 0) {
    return NextResponse.json(
      {
        error:
          'Aucune clé Gemini configurée sur le serveur. Ajoutez GEMINI_API_KEYS (ou GEMINI_API_KEY_1 / GEMINI_API_KEY_2) dans les variables d’environnement.',
      },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { imageBase64, mimeType } = body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    return NextResponse.json({ error: 'Aucune image reçue.' }, { status: 400 });
  }

  let lastError: any = null;

  // Essaie chaque clé du pool tour à tour. Si une clé est à quota (429)
  // ou refusée (403), on bascule automatiquement sur la suivante.
  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const result = await model.generateContent([
        SYSTEM_PROMPT,
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || 'image/jpeg',
          },
        },
      ]);

      const text = result.response.text().trim();

      // Le modèle peut parfois entourer le JSON de ```json ... ```
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        return NextResponse.json(
          { error: 'Réponse IA illisible, réessayez avec une photo plus nette.', raw: text },
          { status: 502 }
        );
      }

      return NextResponse.json({
        result: parsed,
        ...(process.env.NODE_ENV !== 'production' ? { debugKeyIndex: i } : {}),
      });
    } catch (err: any) {
      lastError = err;
      if (isQuotaOrRateLimitError(err) && i < keys.length - 1) {
        console.warn(`Clé Gemini #${i + 1} en limite de quota, bascule sur la suivante.`);
        continue; // essaie la clé suivante du pool
      }
      // Erreur non liée au quota (ou plus aucune clé à essayer) : on arrête.
      break;
    }
  }

  console.error('Erreur identification Gemini (toutes clés épuisées) :', lastError);
  const quotaExhausted = isQuotaOrRateLimitError(lastError);
  return NextResponse.json(
    {
      error: quotaExhausted
        ? 'Toutes les clés Gemini configurées ont atteint leur quota gratuit. Réessayez plus tard ou ajoutez une clé supplémentaire.'
        : lastError?.message || 'Erreur serveur lors de l’identification.',
    },
    { status: quotaExhausted ? 429 : 500 }
  );
}
