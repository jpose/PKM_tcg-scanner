export default async function handler(req, res) {
  // Garantit un retour JSON systématique
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image transmise.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans les variables Vercel.' });
    }

    // Utilisation d'une variable d'environnement si besoin, ou gemini-2.5-flash par défaut
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette carte Pokémon.
1. Identifie le nom de la carte en français et son nom en ANGLAIS.
2. Identifie le numéro imprimé en bas (ex: 4/102, 058/102, SWSH039).

Renvoie EXCLUSIVEMENT un JSON valide au format suivant :
{"cardNameFr": "Nom FR", "cardNameEn": "Nom EN", "cardNumber": "Numéro"}`;

    // 1. Appel Gemini avec arrêt après 5 secondes si blocage
    let geminiRes;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptText },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }]
        }),
        signal: AbortSignal.timeout(5000)
      });
    } catch (err) {
      return res.status(504).json({ error: 'L\'analyse d\'image par Gemini a expiré (délai de 5s dépassé).' });
    }

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData.error?.message || 'Erreur Gemini';
      return res.status(geminiRes.status).json({ error: `Erreur Gemini (${modelName}) : ${msg}` });
    }

    // Extraction et nettoyage du JSON
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    let parsedInfo = {};
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Erreur de décodage du texte Gemini : ' + rawText });
    }

    const cardNameFr = parsedInfo.cardNameFr || parsedInfo.cardNameEn || 'Carte inconnue';
    const cardNameEn = parsedInfo.cardNameEn || parsedInfo.cardNameFr || '';
    const cardNumber = parsedInfo.cardNumber || '';

    let cleanNumber = '';
    if (cardNumber) {
      const rawNum = cardNumber.split('/')[0].trim();
      cleanNumber = rawNum.replace(/^0+/, '') || rawNum;
    }

    let matchedCard = null;

    // 2. Recherche TCG API sécurisée avec délai strict de 3s
    if (cleanNumber) {
      try {
        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=number:"${cleanNumber}"`,
          { signal: AbortSignal.timeout(3000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const cards = tcgData.data || [];

          if (cards.length === 1) {
            matchedCard = cards[0];
          } else if (cards.length > 1) {
            matchedCard = cards.find(c =>
              c.name.toLowerCase().includes(cardNameEn.toLowerCase()) ||
              cardNameEn.toLowerCase().includes(c.name.toLowerCase()) ||
              c.name.toLowerCase().includes(cardNameFr.toLowerCase())
            ) || cards[0];
          }
        }
      } catch (tcgErr) {
        console.warn('API TCG hors délai :', tcgErr.message);
      }
    }

    // 3. Calcul de la côte
    let price = 0;
    if (matchedCard) {
      const cm = matchedCard.cardmarket?.prices || {};
      const tcg = matchedCard.tcgplayer?.prices || {};

      const potentialPrices = [
        cm.averageSellPrice,
        cm.trendPrice,
        cm.lowPrice,
        tcg.normal?.market,
        tcg.holofoil?.market,
        tcg.reverseHolofoil?.market
      ].filter(p => typeof p === 'number' && p > 0);

      if (potentialPrices.length > 0) {
        price = potentialPrices[0];
      }
    }

    return res.status(200).json({
      success: true,
      cardName: matchedCard ? `${cardNameFr} (${matchedCard.name})` : cardNameFr,
      setName: matchedCard ? `${matchedCard.set.name} — ${matchedCard.number}/${matchedCard.set.printedTotal}` : 'Extension non trouvée',
      estimatedPrice: Number(price.toFixed(2)),
      imageUrl: matchedCard ? matchedCard.images.large : ''
    });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur interne du serveur : ' + error.message });
  }
}
