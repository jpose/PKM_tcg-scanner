export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image n\'a été fournie.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans Vercel.' });
    }

    // 1. Extraction et nettoyage des données Base64
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    // 2. Appel à l'API via le point d'entrée canonique v1beta
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const promptText = `Analyse cette image de carte Pokémon TCG.
Identifie le nom de la carte et son numéro (ex: 4/102 ou 058/102).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans aucun texte autour ni balises markdown :
{"cardName": "Nom de la carte", "cardNumber": "numéro"}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      throw new Error(geminiData.error?.message || `Erreur Gemini (${geminiResponse.status})`);
    }

    // Extraction et nettoyage du JSON
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedInfo;
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      throw new Error('Erreur de lecture de la réponse Gemini : ' + rawText);
    }

    const { cardName, cardNumber } = parsedInfo;

    // 3. Interrogation de l'API Pokémon TCG
    let searchQuery = `name:"${cardName}"`;
    if (cardNumber) {
      const cleanNum = cardNumber.split('/')[0].trim();
      searchQuery += ` number:"${cleanNum}"`;
    }

    const tcgResponse = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(searchQuery)}`);
    const tcgData = await tcgResponse.json();

    const matchedCard = tcgData.data && tcgData.data.length > 0 ? tcgData.data[0] : null;

    // 4. Extraction du prix Cardmarket ou TCGPlayer
    let price = 0;
    if (matchedCard?.cardmarket?.prices?.averageSellPrice) {
      price = matchedCard.cardmarket.prices.averageSellPrice;
    } else if (matchedCard?.tcgplayer?.prices?.holofoil?.market) {
      price = matchedCard.tcgplayer.prices.holofoil.market;
    } else if (matchedCard?.tcgplayer?.prices?.normal?.market) {
      price = matchedCard.tcgplayer.prices.normal.market;
    }

    // 5. Renvoi du résultat final
    return res.status(200).json({
      success: true,
      cardName: matchedCard ? matchedCard.name : (cardName || 'Carte inconnue'),
      setName: matchedCard ? `${matchedCard.set.name} (${matchedCard.number}/${matchedCard.set.printedTotal})` : 'Extension non trouvée',
      estimatedPrice: price || 0,
      imageUrl: matchedCard ? matchedCard.images.large : ''
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erreur lors du traitement : ' + error.message 
    });
  }
}
