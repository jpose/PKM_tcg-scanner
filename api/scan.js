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
        error: 'Aucune clé GEMINI_API_KEY_1 ou GEMINI_API_KEY_2 configurée dans Vercel.' 
      });
    }

    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    // 2. MODÈLES GEMINI
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.5-flash'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Tu es un expert Pokémon. Analyse cette carte et renvoie UNIQUEMENT un objet JSON valide avec ces 3 clés :
    - "fr": Le nom de la carte en français.
    - "en": Le nom de la carte en anglais (très important).
    - "num": Le numéro de la carte (ex: "25" si "025/185"). S'il n'y a pas de numéro, mets "".`;

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
          console.warn(`Échec (${model}): ${err.message}`);
        }
      }
    }

    if (!rawResultText) {
      return res.status(502).json({ 
        error: `Erreur Gemini : ${lastError?.message || 'Aucune réponse reçue.'}` 
      });
    }

    // 4. PARSING JSON
    let cardData = {};
    try {
      cardData = JSON.parse(rawResultText);
    } catch (e) {
      return res.status(500).json({ error: 'Réponse Gemini non lisible en JSON.' });
    }

    const nomEn = cardData.en || '';
    const nomFr = cardData.fr || nomEn;
    let num = cardData.num || '';

    let cleanNum = num.includes('/') ? num.split('/')[0] : num;
    cleanNum = cleanNum.replace(/^0+/, '').trim();

    // 5. RECHERCHE MULTIPLE SUR POKÉMON TCG
    let cardsFound = [];

    if (nomEn || cleanNum) {
      try {
        let queryStr = '';
        if (cleanNum && nomEn) {
          const cleanName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();
          queryStr = `number:"${cleanNum}" name:"*${cleanName}*"`;
        } else if (cleanNum) {
          queryStr = `number:"${cleanNum}"`;
        } else if (nomEn) {
          const cleanName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();
          queryStr = `name:"*${cleanName}*"`;
        }

        let tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryStr)}&pageSize=10`,
          { signal: AbortSignal.timeout(6000) }
        );

        let tcgData = await tcgRes.json();
        cardsFound = tcgData.data || [];

        // Fallback si rien trouvé avec la combinaison numéro + nom
        if (cardsFound.length === 0 && nomEn) {
          const cleanName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();
          tcgRes = await fetch(
            `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"*${cleanName}*"`)}&pageSize=10`,
            { signal: AbortSignal.timeout(6000) }
          );
          tcgData = await tcgRes.json();
          cardsFound = tcgData.data || [];
        }
      } catch (tcgErr) {
        console.warn('API Pokémon TCG erreur :', tcgErr.message);
      }
    }

    // 6. FORMATAGE DE TOUTES LES CARTES TROUVÉES
    const candidates = cardsFound.slice(0, 6).map(c => {
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
