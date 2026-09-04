export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode POST requise.' });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Aucune image transmise.' });
    }

    // 1. CLÉS API GEMINI
    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    const availableKeys = [key1, key2].filter(Boolean);

    if (availableKeys.length === 0) {
      return res.status(500).json({ error: 'Aucune clé GEMINI configurée.' });
    }

    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    // 2. MODÈLES GEMINI
    // NB: "gemini-3.5-flash" n'existe pas dans l'offre Gemini actuelle, il a été
    // retiré. Vérifiez la liste des modèles disponibles sur
    // https://ai.google.dev/gemini-api/docs/models avant de déployer, ces noms
    // changent régulièrement.
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Analyse cette image de carte Pokémon. Renvoie UNIQUEMENT un objet JSON valide sans Markdown :
{"fr": "NomFrançais", "en": "NomAnglais", "num": "Numero", "set_name": "NomExtensionVisible"}`;

    let rawResultText = null;

    // 3. APPEL IA
    keyLoop: for (const apiKey of keysToTry) {
      for (const model of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

          const geminiRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: base64 } }
                ]
              }],
              generationConfig: {
                response_mime_type: 'application/json',
                temperature: 0.1,
                thinkingConfig: { thinkingBudget: 0 }
              }
            }),
            signal: AbortSignal.timeout(15000)
          });

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            rawResultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawResultText) break keyLoop;
          }
        } catch (err) {
          // Continue silencieusement, on tente la combinaison clé/modèle suivante
        }
      }
    }

    if (!rawResultText) {
      return res.status(502).json({ error: 'L\'IA n\'a pas pu analyser l\'image.' });
    }

    // 4. PARSING RÉPONSE IA
    let cardData = {};
    try {
      const cleanJson = rawResultText.replace(/```json/g, '').replace(/```/g, '').trim();
      cardData = JSON.parse(cleanJson);
    } catch (err) {
      return res.status(502).json({ error: 'Réponse IA illisible, réessayez avec une photo plus nette.' });
    }

    const detectedName = cardData.fr || cardData.en || 'Inconnu';
    const detectedNameEn = cardData.en || cardData.fr || '';
    const detectedSet = cardData.set_name || '';
    const detectedNum = cardData.num || '';

    // 5. RECHERCHE DES CANDIDATS SUR TCGDEX
    // Doc: https://tcgdex.dev/rest/filtering-sorting-pagination
    // "name=<valeur>" fait une recherche "contient" (non sensible à la casse).
    let candidates = [];
    try {
      candidates = await searchTcgdexCandidates(detectedName, detectedNameEn, detectedNum);
    } catch (err) {
      // On ne bloque pas le scan si TCGdex est indisponible : on retombe sur
      // le mode "carte non trouvée" plus bas côté front.
      candidates = [];
    }

    return res.status(200).json({
      candidates,
      detectedName,
      detectedSet,
      detectedNum
    });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur inattendue : ' + err.message });
  }
}

// --- Recherche de cartes correspondantes sur TCGdex (API publique, sans clé) ---
async function searchTcgdexCandidates(nameFr, nameEn, num) {
  const controller = AbortSignal.timeout(10000);
  const results = new Map();

  for (const [lang, name] of [['fr', nameFr], ['en', nameEn]]) {
    if (!name) continue;
    const url = `https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(name)}`;
    const r = await fetch(url, { signal: controller });
    if (!r.ok) continue;
    const list = await r.json();
    for (const item of list) {
      if (!results.has(item.id)) results.set(item.id, item);
    }
  }

  let briefs = Array.from(results.values());

  // Si un numéro a été détecté, on privilégie les cartes qui le partagent.
  if (num) {
    const matching = briefs.filter(c => String(c.localId) === String(num));
    if (matching.length > 0) briefs = matching;
  }

  // On limite le nombre de cartes détaillées à récupérer pour rester rapide.
  briefs = briefs.slice(0, 6);

  const detailed = await Promise.all(
    briefs.map(async (brief) => {
      try {
        const r = await fetch(`https://api.tcgdex.net/v2/fr/cards/${brief.id}`, { signal: controller });
        if (!r.ok) throw new Error('detail fetch failed');
        const full = await r.json();
        const price = full.pricing?.cardmarket?.avg ?? full.pricing?.cardmarket?.trend ?? 0;
        return {
          id: full.id,
          cardName: full.name,
          setName: full.set?.name || 'Extension inconnue',
          number: full.localId,
          price: Number(price) || 0,
          imageUrl: full.image ? `${full.image}/high.webp` : ''
        };
      } catch (err) {
        // Détails indisponibles : on garde une entrée minimale à partir du brief.
        return {
          id: brief.id,
          cardName: brief.name,
          setName: 'Extension inconnue',
          number: brief.localId,
          price: 0,
          imageUrl: brief.image ? `${brief.image}/high.webp` : ''
        };
      }
    })
  );

  return detailed;
}
