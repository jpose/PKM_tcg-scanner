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

    const prompt = `Analyse cette image d'une carte Pokémon. Regarde attentivement les petites mentions imprimées en bas de la carte : le numéro de la carte (souvent sous la forme "23/102"), et le nom ou symbole de l'extension.

Renvoie UNIQUEMENT un objet JSON valide, sans Markdown, au format :
{"fr": "NomFrançais", "en": "NomAnglais", "num": "NuméroTelQueImprimé", "set_name": "NomExtension"}

Règles importantes :
- Si le numéro est affiché sous forme de fraction (ex: "23/102"), renvoie-le tel quel dans "num" (ne renvoie pas seulement "23").
- Si tu n'es pas certain du nom exact de l'extension, laisse "set_name" vide ("") plutôt que d'inventer une valeur approximative : une fausse extension fait échouer la recherche de la carte.`;

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
      candidates = await searchTcgdexCandidates(detectedName, detectedNameEn, detectedNum, detectedSet);
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

// Extrait le numéro local et le total d'une chaîne du type "23/102", "023", ou "23".
function parseCardNumber(rawNum) {
  if (!rawNum) return { local: '', total: '' };
  const fraction = String(rawNum).match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction) return { local: fraction[1], total: fraction[2] };
  const onlyDigits = String(rawNum).match(/\d+/);
  return { local: onlyDigits ? onlyDigits[0] : '', total: '' };
}

// Compare deux numéros de carte en ignorant les zéros de tête ("023" === "23").
function localIdsMatch(a, b) {
  if (!a || !b) return false;
  if (String(a) === String(b)) return true;
  const aN = parseInt(a, 10);
  const bN = parseInt(b, 10);
  return !isNaN(aN) && !isNaN(bN) && aN === bN;
}

function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// --- Recherche de cartes correspondantes sur TCGdex (API publique, sans clé) ---
// Stratégie : le numéro imprimé sur la carte est bien plus fiable que le nom de
// l'extension deviné par l'IA. On filtre donc d'abord par nom + numéro exact
// côté API, puis on classe les résultats restants par pertinence (numéro,
// total de cartes du set, proximité du nom d'extension) avant de les renvoyer.
async function searchTcgdexCandidates(nameFr, nameEn, numRaw, setNameHint) {
  const { local, total } = parseCardNumber(numRaw);
  const controller = AbortSignal.timeout(10000);
  const results = new Map();

  async function fetchNameSearch(withLocalIdFilter) {
    for (const [lang, name] of [['fr', nameFr], ['en', nameEn]]) {
      if (!name) continue;
      const params = new URLSearchParams({ name });
      if (withLocalIdFilter && local) params.set('localId', `eq:${local}`);
      try {
        const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?${params.toString()}`, { signal: controller });
        if (!r.ok) continue;
        const list = await r.json();
        for (const item of list) {
          if (!results.has(item.id)) results.set(item.id, item);
        }
      } catch (err) {
        // on ignore et on tente la langue/requête suivante
      }
    }
  }

  // 1) Recherche stricte : nom + numéro exact (le plus fiable).
  if (local) await fetchNameSearch(true);

  // 2) Si l'OCR du numéro était faux ou absent, on retombe sur le nom seul.
  if (results.size === 0) await fetchNameSearch(false);

  // On garde une marge de candidats pour pouvoir les trier avant de couper à 6.
  const briefs = Array.from(results.values()).slice(0, 15);

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
          setTotal: full.set?.cardCount?.official || full.set?.cardCount?.total || null,
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
          setTotal: null,
          number: brief.localId,
          price: 0,
          imageUrl: brief.image ? `${brief.image}/high.webp` : ''
        };
      }
    })
  );

  // Score de pertinence, du plus fort au plus faible indice :
  //   - numéro imprimé identique (+3)
  //   - total de cartes de l'extension identique (+2)
  //   - nom de l'extension détecté par l'IA proche du vrai nom du set (+2)
  const setHint = normalizeText(setNameHint);
  const scored = detailed.map(c => {
    let score = 0;
    if (localIdsMatch(c.number, local)) score += 3;
    if (total && c.setTotal && String(c.setTotal) === String(total)) score += 2;
    if (setHint && normalizeText(c.setName).includes(setHint)) score += 2;
    return { card: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 6).map(({ card }) => {
    const { setTotal, ...publicFields } = card;
    return publicFields;
  });
    }
