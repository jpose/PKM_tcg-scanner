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

    // 1. CLÉS GEMINI
    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    const availableKeys = [key1, key2].filter(Boolean);

    if (availableKeys.length === 0) {
      return res.status(500).json({ error: 'Clé API Gemini introuvable dans Vercel.' });
    }

    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    // 2. MODÈLES A TESTER
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.5-flash'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Analyse cette image de carte Pokémon. Renvoie STRICTEMENT un JSON valide avec :
    "fr": Le nom du Pokémon en français.
    "en": Le nom du Pokémon en anglais.
    "num": Le numéro exact de la carte (ex: "19" ou "019" ou "SWSH039").`;

    let rawResultText = null;
    let lastError = null;

    // 3. ANALYSE IA
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
          lastError = err;
        }
      }
    }

    if (!rawResultText) {
      return res.status(502).json({ error: 'L\'IA n\'a pas pu analyser l\'image.' });
    }

    // 4. NETTOYAGE STRICT DES DONNÉES DE SOTIE
    let cardData = {};
    try {
      cardData = JSON.parse(rawResultText);
    } catch (e) {
      return res.status(500).json({ error: 'Erreur parsing JSON IA' });
    }

    // Extraction et nettoyage du nom anglais
    let nomEn = (cardData.en || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    let nomFr = (cardData.fr || nomEn).trim();
    
    // Nettoyage du numéro
    let num = (cardData.num || '').split('/')[0].replace(/^0+/, '').trim();

    // Si l'IA n'a pas réussi à lire de nom, ON ARRÊTE TOUT pour ne pas sortir Dracaufeu
    if (!nomEn || nomEn.toLowerCase() === 'pokemon' || nomEn.toLowerCase() === 'card') {
      return res.status(400).json({
        error: "Impossible de lire le nom du Pokémon. Veuillez reprendre une photo plus nette et centrée."
      });
    }

    // 5. APPEL POKÉMON TCG STRICT
    let cardsFound = [];

    // On prépare des requêtes très spécifiques
    let queriesToTry = [];
    
    if (nomEn && num) {
      queriesToTry.push(`name:"${nomEn}" number:"${num}"`);
      queriesToTry.push(`name:"*${nomEn}*" number:"${num}"`);
    }
    if (nomEn) {
      queriesToTry.push(`name:"${nomEn}"`);
      queriesToTry.push(`name:"*${nomEn}*"`);
    }

    for (const q of queriesToTry) {
      try {
        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=10`,
          { signal: AbortSignal.timeout(5000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          if (tcgData.data && tcgData.data.length > 0) {
            cardsFound = tcgData.data;
            break; // On a trouvé nos cartes, on sort de la boucle
          }
        }
      } catch (e) {
        console.warn('Erreur TCG fetch:', e);
      }
    }

    if (cardsFound.length === 0) {
      return res.status(404).json({
        error: `Aucune carte trouvée pour "${nomFr}" (${nomEn}) avec le N°${num || 'inconnu'}.`
      });
    }

    // 6. MISE EN FORME DES CARTES TROUVÉES
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
      detectedNum: num,
      candidates: candidates
    });

  } catch (globalError) {
    return res.status(500).json({ error: 'Erreur serveur : ' + globalError.message });
  }
}
