import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialisation du client SDK Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Noms officiels supportés par l'API Google Gemini
// Classés par priorité (du plus récent/rapide au plus robuste)
const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-1.5-pro-latest"
];

export default async function handler(req, res) {
  // 1. Restriction à la méthode POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { base64, image } = req.body;
    const rawBase64 = base64 || (image ? image.split(",")[1] : null);

    if (!rawBase64) {
      return res.status(400).json({ error: "Aucune donnée d'image fournie" });
    }

    const imageParts = [
      {
        inlineData: {
          data: rawBase64,
          mimeType: "image/jpeg"
        }
      }
    ];

    const prompt = "Lit uniquement le nom officiel de cette carte TCG / Pokémon. Réponds UNIQUEMENT avec le nom exact de la carte, aucun autre mot.";

    let lastError = null;

    // 2. Boucle de basculement entre les modèles
    for (const modelName of GEMINI_MODELS) {
      try {
        console.log(`[Scan API] Essai avec le modèle : ${modelName}`);

        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const text = response.text().trim();

        if (text) {
          console.log(`[Scan API] Succès via ${modelName}`);
          return res.status(200).json({
            name: text,
            modelUsed: modelName
          });
        }
      } catch (error) {
        lastError = error;
        const status = error.status || error.statusCode;
        const msg = error.message || "";

        // Détection des erreurs de quota (429), modèle introuvable (404) ou serveur saturé (500/503)
        const isQuotaOrLimit = status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
        const isNotFound = status === 404 || msg.includes("404") || msg.includes("not found");
        const isUnavailable = status === 503 || status === 500 || msg.includes("overloaded");

        if (isQuotaOrLimit || isNotFound || isUnavailable) {
          console.warn(`[Scan API] ${modelName} indisponible ou quota dépassé. Passage au modèle suivant...`);
          continue; // Passe directement au modèle suivant
        }

        // Si c'est une autre erreur (ex: clé API invalide), on stoppe le cycle
        console.error(`[Scan API] Erreur sur ${modelName} :`, msg);
        break;
      }
    }

    // 3. Fallback si l'intégralité des modèles échoue
    console.error("[Scan API] Échec : Tous les modèles Gemini ont dépassé leur quota.");
    return res.status(429).json({
      error: "Tous les modèles Gemini ont atteint leur limite de quota. Réessaie dans une minute.",
      details: lastError ? lastError.message : null
    });

  } catch (globalError) {
    console.error("[Scan API] Erreur critique serveur :", globalError);
    return res.status(500).json({ error: "Erreur interne du serveur lors du scan." });
  }
}
