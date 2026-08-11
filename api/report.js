// ============================================================
//  Capilario — Génération du rapport complet (après paiement)
//  Reçoit { session_id }. Vérifie AUPRÈS DE STRIPE que la session
//  est bien payée, puis génère le bilan complet à partir des
//  données rangées dans la session. Verrou anti-fraude : sans
//  paiement confirmé, aucun rapport n'est renvoyé.
// ============================================================

const SYSTEM = `Tu es l'assistant de Capilario. Tu génères un BILAN CAPILLAIRE COMPLET, cosmétique et de soin — jamais médical, jamais de nom de pathologie, aucune promesse de guérison ni de repousse garantie.
À partir de l'analyse et des réponses du questionnaire, produis un plan réaliste, concret et bienveillant.

Réponds STRICTEMENT en JSON valide, sans texte autour ni Markdown, avec ce schéma:
{
  "summary": "3 à 4 phrases d'analyse détaillée et encourageante",
  "routine": [
    { "phase": "Semaines 1-4", "steps": ["étape courte", "étape courte"] },
    { "phase": "Semaines 5-8", "steps": ["...", "..."] },
    { "phase": "Semaines 9-12", "steps": ["...", "..."] }
  ],
  "products": [
    { "type": "catégorie ou actif cosmétique (ex: huile de ricin)", "why": "bénéfice cosmétique en une phrase", "how": "conseil d'usage court" }
  ],
  "cautions": ["point de vigilance court", "..."],
  "outlook": "1 à 2 phrases sur l'évolution probable avec une routine régulière, orientée soin"
}
Donne 3 à 5 produits et 2 à 4 points de vigilance.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { session_id = '' } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'Session manquante' });

    // 1) Vérifier le paiement auprès de Stripe
    const sRes = await fetch(
      'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(session_id),
      { headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY } }
    );
    const session = await sRes.json();
    if (!sRes.ok) return res.status(502).json({ error: 'Erreur Stripe', detail: JSON.stringify(session) });
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Paiement non confirmé' });
    }

    // 2) Récupérer les données rangées à la création de la session
    let answers = {}, result = {};
    try { answers = JSON.parse(session.metadata?.a || '{}'); } catch (e) {}
    try { result = JSON.parse(session.metadata?.r || '{}'); } catch (e) {}

    // 3) Générer le bilan complet
    const userText =
      'Analyse (teaser): ' + JSON.stringify(result) +
      '\nRéponses du questionnaire: ' + JSON.stringify(answers) +
      '\n\nGénère le bilan complet selon le schéma.';

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',   // rapport payant → modèle plus qualitatif
        max_tokens: 1400,
        system: SYSTEM,
        messages: [{ role: 'user', content: userText }]
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Erreur du modèle IA', detail });
    }

    const out = await apiRes.json();
    let text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let report;
    try { report = JSON.parse(text); }
    catch (e) {
      const s = text.indexOf('{'), en = text.lastIndexOf('}');
      report = JSON.parse(text.slice(s, en + 1));
    }

    // on renvoie aussi le teaser pour l'affichage
    report._teaser = result;
    return res.status(200).json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};
