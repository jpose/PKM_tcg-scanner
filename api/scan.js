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

    // 2. MODÈLES À TESTER
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
    - "num": Le numéro exact de la carte visible en bas (ex: "25" si "025/185"). S'il n'y a pas de numéro, mets "".`;

    let rawResultText = null;
    let lastError = null;

    // 3. EXÉCUTION GEMINI (Thinking désactivé + Timeout 15s)
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
        error: `Délai dépassé ou erreur Gemini : ${lastError?.message || 'Aucune réponse reçue à temps.'}` 
      });
    }

    // 4. PARSING DU JSON GEMINI
    let cardData = {};
    try {
      cardData = JSON.parse(rawResultText);
    } catch (e) {
      return res.status(500).json({ error: 'Réponse Gemini non lisible en JSON.' });
    }

    const nomEn = cardData.en || '';
    const nomFr = cardData.fr || nomEn;
    let num = cardData.num || '';

    // Nettoyage du numéro : "025/185" -> "25"
    if (num.includes('/')) {
      num = num.split('/')[0].replace(/^0+/, '');
    } else {
      num = num.replace(/^0+/, '');
    }

    // 5. RECHERCHE DANS L'API POKÉMON TCG
    let tcgCard = null;

    if (nomEn || num) {
      try {
        let q = [];
        if (nomEn) {
          const cleanName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();
          if (cleanName) q.push(`name:"${cleanName}"`);
        }
        if (num) {
          q.push(`number:"${num}"`);
        }

        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q.join(' '))}`,
          { signal: AbortSignal.timeout(6000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const cards = tcgData.data || [];

          if (cards.length > 0) {
            // Priorité absolue au numéro exact s'il existe
            tcgCard = cards.find(c => String(c.number) === String(num)) || cards[0];
          }
        }
      } catch (tcgErr) {
        console.warn('API Pokémon TCG hors délai');
      }
    }

    // 6. CALCUL STRICT ET RÉALISTE DE LA COTE
    let price = 0;

    if (tcgCard?.cardmarket?.prices) {
      const cm = tcgCard.cardmarket.prices;
      // Prix Cardmarket (Euros) : Prix de tendance ou moyenne des ventes
      price = cm.trendPrice || cm.avg1 || cm.avg7 || cm.averageSellPrice || cm.lowPrice || 0;
    } else if (tcgCard?.tcgplayer?.prices) {
      const tp = tcgCard.tcgplayer.prices;
      
      // Sélection de la variante (normale en priorité)
      const variant = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || {};
      
      // Utilisation du prix moyen de marché (market) et non des extrêmes
      const usdPrice = variant.market || variant.mid || variant.low || 0;
      
      // Conversion approximative USD -> EUR
      price = usdPrice * 0.92;
    }

    if (isNaN(price)) price = 0;

    // 7. RETOUR DU RÉSULTAT
    return res.status(200).json({
      cardName: tcgCard ? `${nomFr} (${tcgCard.name})` : (nomFr || 'Carte inconnue'),
      setName: tcgCard ? `${tcgCard.set.name} — ${tcgCard.number}/${tcgCard.set.printedTotal}` : 'Extension introuvable',
      price: Number(price.toFixed(2)),
      imageUrl: tcgCard?.images?.large || image
    });

  } catch (globalError) {
    return res.status(500).json({ error: 'Erreur serveur : ' + globalError.message });
  }
}
