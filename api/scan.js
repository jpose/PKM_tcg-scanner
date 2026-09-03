export const config = {
  maxDuration: 30, // Tolérance de durée pour Vercel
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

    // 1. GESTION DES CLÉS GEMINI (Load Balancing + Fallback)
    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    
    // Récupération des clés disponibles
    const availableKeys = [key1, key2].filter(Boolean);

    if (availableKeys.length === 0) {
      return res.status(500).json({ 
        error: 'Aucune clé GEMINI_API_KEY_1 ou GEMINI_API_KEY_2 configurée dans Vercel.' 
      });
    }

    // Mélange aléatoire des clés pour répartir la charge (50/50)
    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Tu es un expert Pokémon. Analyse cette carte et renvoie UNIQUEMENT un objet JSON valide avec ces 3 clés :
    - "fr": Le nom de la carte en français.
    - "en": Le nom de la carte en anglais (très important).
    - "num": Le numéro de la carte (ex: "25" si "025/185"). S'il n'y a pas de numéro, mets "".`;

    // 2. EXÉCUTION DE LA REQUÊTE GEMINI AVEC RETRY/FALLBACK
    let rawResultText = null;
    let lastError = null;

    for (const apiKey of keysToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
              response_mime_type: 'application/json', // Force le retour JSON direct
              temperature: 0.1
            }
          }),
          signal: AbortSignal.timeout(8000) // Timeout de 8s par tentative
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          throw new Error(`Erreur Gemini HTTP ${geminiRes.status}: ${errText.slice(0, 100)}`);
        }

        const geminiData = await geminiRes.json();
        rawResultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawResultText) {
          break; // Succès ! On sort de la boucle de fallback
        }
      } catch (err) {
        lastError = err;
        console.warn(`Échec avec une clé Gemini, tentative avec la clé suivante... (${err.message})`);
      }
    }

    if (!rawResultText) {
      return res.status(502).json({ 
        error: `Impossible de scanner la carte avec l'API Gemini : ${lastError?.message || 'Toutes les clés ont échoué'}` 
      });
    }

    // 3. PARSING DU JSON GEMINI
    let cardData = {};
    try {
      cardData = JSON.parse(rawResultText);
    } catch (e) {
      return res.status(500).json({ error: 'Réponse Gemini non lisible en JSON.' });
    }

    const nomEn = cardData.en || '';
    const nomFr = cardData.fr || nomEn;
    let num = cardData.num || '';

    // Nettoyage du numéro (ex: "025/185" -> "25")
    if (num.includes('/')) {
      num = num.split('/')[0].replace(/^0+/, '');
    } else {
      num = num.replace(/^0+/, '');
    }

    // 4. INTERROGATION DE L'API POKÉMON TCG
    let tcgCard = null;

    if (nomEn || num) {
      try {
        let q = [];
        if (nomEn) {
          // Nettoyage des caractères spéciaux pour éviter les erreurs de requête
          const cleanName = nomEn.replace(/[^a-zA-Z0-9 ]/g, '').trim();
          if (cleanName) q.push(`name:"*${cleanName}*"`);
        }
        if (num) {
          q.push(`number:"${num}"`);
        }

        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q.join(' '))}`,
          { signal: AbortSignal.timeout(4000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const cards = tcgData.data || [];

          if (cards.length > 0) {
            // Priorité absolue à la carte avec le numéro exact
            tcgCard = cards.find(c => String(c.number) === String(num)) || cards[0];
          }
        }
      } catch (tcgErr) {
        console.warn('API Pokémon TCG hors délai ou inaccessible');
      }
    }

    // 5. CALCUL DE LA COTE (CARDMARKET EUR)
    let price = 0;
    if (tcgCard?.cardmarket?.prices) {
      const cm = tcgCard.cardmarket.prices;
      price = cm.trendPrice || cm.averageSellPrice || cm.lowPrice || 0;
    } else if (tcgCard?.tcgplayer?.prices) {
      const tp = tcgCard.tcgplayer.prices;
      const usdPrice = tp.normal?.market || tp.holofoil?.market || tp.reverseHolofoil?.market || 0;
      price = usdPrice * 0.9; // Conversion approximative USD -> EUR
    }

    // 6. ENVOI DE LA RÉPONSE AU FRONTEND
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
