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

    // 2. MODÈLES GEMINI ORIGINAUX
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.5-flash'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Analyse cette image de carte Pokémon. Renvoie UNIQUEMENT un objet JSON valide sans Markdown, sous cette forme :
{"fr": "NomFrançais", "en": "NomAnglais", "num": "Numero"}`;

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
          // Continue au modèle/clé suivant
        }
      }
    }

    if (!rawResultText) {
      return res.status(502).json({ error: 'L\'IA n\'a pas pu analyser l\'image.' });
    }

    // 4. PARSING DE LA RÉPONSE IA
    let cardData = {};
    try {
      const cleanJson = rawResultText.replace(/```json/g, '').replace(/```/g, '').trim();
      cardData = JSON.parse(cleanJson);
    } catch (e) {
      return res.status(500).json({ error: 'Erreur lors du décodage de la réponse IA.' });
    }

    const nomEn = (cardData.en || '').trim();
    const nomFr = (cardData.fr || nomEn).trim();
    const numRaw = (cardData.num || '').split('/')[0].trim();
    const numClean = numRaw.replace(/^0+/, '').trim();

    if (!nomEn) {
      return res.status(400).json({ error: 'Nom de carte illisible. Prenez une photo plus nette.' });
    }

    // 5. RECHERCHE TCG (SYNTAXE STRICTE TCG API)
    // On nettoie le nom pour garder uniquement les lettres et espaces
    const searchName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();

    // Construction des requêtes dans l'ordre de précision
    let queries = [];
    if (numClean) {
      queries.push(`name:${searchName} number:${numClean}`);
    }
    if (numRaw && numRaw !== numClean) {
      queries.push(`name:${searchName} number:${numRaw}`);
    }
    queries.push(`name:${searchName}`);

    let cardsFound = [];

    for (const q of queries) {
      try {
        const urlTCG = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}`;
        
        const tcgRes = await fetch(urlTCG, { 
          signal: AbortSignal.timeout(6000) 
        });

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const results = tcgData.data || [];

          // VERIFICATION : on s'assure que le résultat contient VRAIMENT le nom cherché
          const valid = results.filter(c => 
            c.name.toLowerCase().includes(searchName.toLowerCase())
          );

          if (valid.length > 0) {
            cardsFound = valid;
            break; // Succès !
          }
        }
      } catch (e) {
        console.warn('Erreur TCG:', e.message);
      }
    }

    if (cardsFound.length === 0) {
      return res.status(404).json({
        error: `Aucune carte TCG trouvée pour "${nomFr}" (${nomEn}) #${numRaw || 'inconnu'}.`
      });
    }

    // 6. FORMATAGE DES RÉSULTATS
    const candidates = cardsFound.slice(0, 8).map(c => {
      let price = 0;
      if (c.cardmarket?.prices) {
        const cm = c.cardmarket.prices;
        price = cm.trendPrice || cm.avg1 || cm.averageSellPrice || cm.lowPrice || 0;
      } else if (c.tcgplayer?.prices) {
        const tp = c.tcgplayer.prices;
        const variant = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || {};
        const usdPrice = variant.market || variant.mid || 0;
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
      detectedNum: numRaw || numClean,
      candidates: candidates
    });

  } catch (globalError) {
    return res.status(500).json({ error: 'Erreur serveur : ' + globalError.message });
  }
}
