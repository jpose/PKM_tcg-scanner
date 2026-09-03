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

    // 1. VÉRIFICATION DES CLÉS GEMINI
    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    const availableKeys = [key1, key2].filter(Boolean);

    if (availableKeys.length === 0) {
      return res.status(500).json({ 
        error: 'Aucune clé GEMINI_API_KEY_1 ou GEMINI_API_KEY_2 configurée dans Vercel.' 
      });
    }

    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    // 2. MODÈLES GEMINI OFFICIELS ET ACTIFS
    const modelsToTry = [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Tu es un expert Pokémon TCG. Analyse cette image et renvoie UNIQUEMENT un objet JSON valide (sans aucun texte autour) avec :
- "fr": Nom du Pokémon en français.
- "en": Nom exact du Pokémon en anglais (ex: "Rattata", "Pikachu").
- "num": Numéro de la carte (ex: "19" ou "019" ou "SWSH039"). Exclus le total après le slash.`;

    let rawText = null;
    let lastError = null;

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
              }]
            }),
            signal: AbortSignal.timeout(15000)
          });

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) break keyLoop;
          } else {
            const errText = await geminiRes.text();
            lastError = `Modèle ${model} (HTTP ${geminiRes.status}): ${errText.slice(0, 80)}`;
          }
        } catch (err) {
          lastError = err.message;
        }
      }
    }

    if (!rawText) {
      return res.status(502).json({ error: `Erreur d'analyse IA : ${lastError || 'Aucune réponse.'}` });
    }

    // 4. NETTOYAGE ET PARSING DU JSON
    let cardData = {};
    try {
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      cardData = JSON.parse(cleanJson);
    } catch (e) {
      return res.status(500).json({ error: 'Format JSON renvoyé par l\'IA invalide.' });
    }

    const nomEn = (cardData.en || '').trim();
    const nomFr = (cardData.fr || nomEn).trim();
    const numRaw = (cardData.num || '').split('/')[0].trim();
    const numClean = numRaw.replace(/^0+/, '').trim();

    if (!nomEn) {
      return res.status(400).json({ error: 'Nom de carte illisible sur la photo. Essayez d\'avoir une meilleure luminosité.' });
    }

    // 5. RECHERCHE SUR L'API POKÉMON TCG
    const cleanSearchName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    let cardsFound = [];

    // Priorités de recherche
    let queries = [];
    if (numRaw) queries.push(`name:"*${cleanSearchName}*" number:"${numRaw}"`);
    if (numClean && numClean !== numRaw) queries.push(`name:"*${cleanSearchName}*" number:"${numClean}"`);
    queries.push(`name:"*${cleanSearchName}*"`);

    for (const q of queries) {
      try {
        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=15`,
          { signal: AbortSignal.timeout(6000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const results = tcgData.data || [];

          // VERROU ANTI-DRACAUFEU :
          // Filtre strict pour s'assurer que les cartes renvoyées contiennent bien le nom détecté.
          const searchLower = cleanSearchName.toLowerCase();
          const isSearchingCharizard = searchLower.includes('charizard') || nomFr.toLowerCase().includes('dracaufeu');

          const filtered = results.filter(c => {
            const cardNameLower = c.name.toLowerCase();
            const matchesName = cardNameLower.includes(searchLower);

            if (!isSearchingCharizard) {
              return matchesName && !cardNameLower.includes('charizard');
            }
            return matchesName;
          });

          if (filtered.length > 0) {
            cardsFound = filtered;
            break;
          }
        }
      } catch (e) {
        console.warn('Erreur lors du fetch TCG:', e.message);
      }
    }

    if (cardsFound.length === 0) {
      return res.status(404).json({
        error: `Carte détectée : "${nomFr}" (N°${numRaw || '?'}), mais aucune correspondance n'a été trouvée dans la base TCG.`
      });
    }

    // 6. FORMATAGE DES CANDIDATS DE LA GRILLE
    const candidates = cardsFound.slice(0, 8).map(c => {
      let price = 0;
      if (c.cardmarket?.prices) {
        const cm = c.cardmarket.prices;
        price = cm.trendPrice || cm.avg1 || cm.avg7 || cm.averageSellPrice || cm.lowPrice || 0;
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
