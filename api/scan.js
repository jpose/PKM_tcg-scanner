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
      return res.status(500).json({ 
        error: 'Aucune clé API configurée dans Vercel.' 
      });
    }

    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    // 2. MODÈLES
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.5-flash'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Tu es un scanner de cartes Pokémon. Regarde cette photo de carte et renvoie EXCLUSIVEMENT un objet JSON avec ces clés :
    - "fr": Nom du Pokémon en Français (ex: "Rattata", "Pikachu").
    - "en": Nom du Pokémon en Anglais (ex: "Rattata", "Pikachu").
    - "num": Le numéro de la carte inscrit en bas à droite ou à gauche (ex: "19", "066", "SWSH039"). Ne mets PAS le total (pas de /185). Si aucun numéro visible, mets "".`;

    let rawResultText = null;
    let lastError = null;

    // 3. APPEL GEMINI
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

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            throw new Error(`HTTP ${geminiRes.status} (${model}): ${errText.slice(0, 100)}`);
          }

          const geminiData = await geminiRes.json();
          rawResultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

          if (rawResultText) {
            break keyLoop;
          }
        } catch (err) {
          lastError = err;
        }
      }
    }

    if (!rawResultText) {
      return res.status(502).json({ 
        error: `Erreur d'analyse IA : ${lastError?.message || 'Pas de réponse.'}` 
      });
    }

    // 4. PARSING DU JSON
    let cardData = {};
    try {
      cardData = JSON.parse(rawResultText);
    } catch (e) {
      return res.status(500).json({ error: 'Lecture JSON impossible.' });
    }

    const nomEn = (cardData.en || '').trim();
    const nomFr = (cardData.fr || nomEn).trim();
    let num = (cardData.num || '').trim();

    if (num.includes('/')) {
      num = num.split('/')[0].trim();
    }
    const cleanNum = num.replace(/^0+/, '');

    // 5. RECHERCHE EN CASCADE SUR POKÉMON TCG
    let cardsFound = [];

    const fetchTcg = async (query) => {
      try {
        const res = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=12`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
          const data = await res.json();
          return data.data || [];
        }
      } catch (e) {
        console.warn('Erreur TCG Fetch:', e.message);
      }
      return [];
    };

    const cleanName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();

    // Étape A: Nom + Numéro
    if (cleanName && cleanNum) {
      cardsFound = await fetchTcg(`name:"${cleanName}" number:"${cleanNum}"`);
    }

    // Étape B: Nom seul si rien trouvé
    if (cardsFound.length === 0 && cleanName) {
      cardsFound = await fetchTcg(`name:"${cleanName}"`);
    }

    // Étape C: Numéro seul si toujours rien trouvé
    if (cardsFound.length === 0 && cleanNum) {
      cardsFound = await fetchTcg(`number:"${cleanNum}"`);
    }

    // Si vraiment rien n'est trouvé
    if (cardsFound.length === 0) {
      return res.status(200).json({
        detectedName: nomFr,
        detectedNum: cleanNum,
        candidates: []
      });
    }

    // 6. FORMATAGE DES RÉSULTATS
    const candidates = cardsFound.slice(0, 8).map(c => {
      let price = 0;
      if (c.cardmarket?.prices) {
        const cm = c.cardmarket.prices;
        price = cm.trendPrice || cm.avg1 || cm.avg7 || cm.averageSellPrice || cm.lowPrice || 0;
      } else if (c.tcgplayer?.prices) {
        const tp = c.tcgplayer.prices;
        const variant = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || {};
        const usdPrice = variant.market || variant.mid || variant.low || 0;
        price = usdPrice * 0.92;
      }

      return {
        id: c.id,
        cardName: `${nomFr} (${c.name})`,
        setName: `${c.set.name} — ${c.number}/${c.set.printedTotal}`,
        number: c.number,
        price: Number(price.toFixed(2)),
        imageUrl: c.images?.large || c.images?.small
      };
    });

    return res.status(200).json({
      detectedName: nomFr,
      detectedNum: cleanNum,
      candidates: candidates
    });

  } catch (globalError) {
    return res.status(500).json({ error: 'Erreur serveur : ' + globalError.message });
  }
}
