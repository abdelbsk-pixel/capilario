// ============================================================
//  Capilario — Analyse capillaire par IA
//  Fonction serverless (Vercel). Reçoit la photo + le questionnaire,
//  demande une analyse à Claude, renvoie un JSON propre au site.
//  La clé API reste côté serveur (variable d'environnement) —
//  elle n'est JAMAIS visible dans le navigateur.
// ============================================================

const SYSTEM = `Tu es l'assistant d'analyse capillaire de Capilario.
À partir d'une photo et des réponses d'un questionnaire, tu produis une ANALYSE COSMÉTIQUE ET DE SOIN — jamais un diagnostic médical, jamais un nom de pathologie.

Règles:
- Décris uniquement ce qui est observable sur la photo (densité apparente, zones plus clairsemées, ligne d'implantation, état visible du cuir chevelu).
- Reste factuel et bienveillant. N'affirme jamais de certitude médicale. Les valeurs chiffrées sont des ESTIMATIONS INDICATIVES, pas des mesures.
- Adapte l'analyse aux réponses du questionnaire (zone, ancienneté, âge, type de cheveu, objectif).
- Si la photo est inexploitable (floue, aucun cheveu visible), renvoie verdict="Photo inexploitable" et des champs neutres.

Réponds STRICTEMENT en JSON valide, sans texte autour, sans balises Markdown, avec exactement ce schéma:
{
  "verdict": "titre court du phénomène observé (ex: 'Recul fronto-temporal débutant')",
  "subtitle": "une phrase encourageante et orientée soin",
  "zone": "zone analysée en clair",
  "densityIndex": nombre entier 0-100 (indice indicatif de densité apparente),
  "stage": "Précoce | Précoce à modéré | Modéré | Installé",
  "hairType": "Raides | Ondulés | Bouclés | Crépus",
  "follicles": nombre entier (estimation indicative de follicules dans le cadre)
}`;

module.exports = async (req, res) => {
  // Autorise l'appel (utile si le site est servi depuis un autre domaine un jour)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { answers = {}, photo = '' } = req.body || {};

    // Sépare le type d'image et les données base64 depuis la "data URL" envoyée par le site
    let media = 'image/jpeg';
    let data = photo;
    const m = /^data:(.+?);base64,(.*)$/s.exec(photo);
    if (m) { media = m[1]; data = m[2]; }
    if (!data) return res.status(400).json({ error: 'Photo manquante' });

    const userText =
      'Réponses du questionnaire (JSON):\n' +
      JSON.stringify(answers, null, 2) +
      '\n\nAnalyse la photo ci-jointe selon tes règles et renvoie UNIQUEMENT le JSON du schéma.';

    // Appel au modèle de vision
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',   // rapide + pas cher pour le volume gratuit
        max_tokens: 700,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data } },
            { type: 'text', text: userText }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Erreur du modèle IA', detail });
    }

    const out = await apiRes.json();
    let text = (out.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const s = text.indexOf('{');
      const en = text.lastIndexOf('}');
      parsed = JSON.parse(text.slice(s, en + 1));
    }

    // garde-fous de type
    parsed.densityIndex = parseInt(parsed.densityIndex, 10) || 0;
    parsed.follicles = parseInt(parsed.follicles, 10) || 0;

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};
