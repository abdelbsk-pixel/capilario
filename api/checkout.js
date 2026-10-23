// ============================================================
//  Capilario — Création du paiement (Stripe Checkout)
//  Reçoit { answers, result, email } et renvoie l'URL de paiement.
//  On range answers + result dans la session (metadata) : au retour,
//  le rapport est généré à partir de ça, sans dépendre du navigateur.
//  Clé Stripe côté serveur uniquement.
// ============================================================

// Stripe limite chaque métadonnée à 500 caractères : on ne garde que l'essentiel
// de l'analyse gratuite (sinon le JSON est coupé, illisible, et le bilan complet
// perd la zone, le stade et la densité).
function packResult(r) {
  r = r || {};
  const cut = (s, n) => String(s == null ? '' : s).slice(0, n);
  const base = {
    verdict: cut(r.verdict, 80), zone: cut(r.zone, 40), stage: cut(r.stage, 30),
    hairType: cut(r.hairType, 20), severity: cut(r.severity, 20),
    densityIndex: Math.max(0, Math.min(100, parseInt(r.densityIndex, 10) || 0))
  };
  let inds = (Array.isArray(r.indicators) ? r.indicators : []).slice(0, 6)
    .map(x => ({ k: cut(x && x.k, 32), v: cut(x && x.v, 32) }));
  let s = JSON.stringify(Object.assign({}, base, { indicators: inds }));
  while (s.length > 490 && inds.length) { inds = inds.slice(0, -1); s = JSON.stringify(Object.assign({}, base, { indicators: inds })); }
  if (s.length > 490) s = JSON.stringify(base);
  return s;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { answers = {}, result = {}, email = '', lang = 'fr' } = req.body || {};
    const L = ['fr','en','es','de'].includes(lang) ? lang : 'fr';
    const site = process.env.SITE_URL || 'https://capilario-pnxy.vercel.app';

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', site + '/?paid=1&session_id={CHECKOUT_SESSION_ID}');
    params.append('cancel_url', site + '/?canceled=1');
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'eur');
    params.append('line_items[0][price_data][unit_amount]', '399'); // 3,99 €
    params.append('line_items[0][price_data][product_data][name]', 'Bilan capillaire complet — Capilario');
    params.append('metadata[a]', JSON.stringify(answers).slice(0, 490));
    params.append('metadata[r]', packResult(result)); // version compacte : tient toujours dans la limite Stripe
    params.append('metadata[l]', L);
    params.append('allow_promotion_codes', 'true'); // champ code promo sur la page Stripe
    if (email) params.append('customer_email', email);

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Erreur Stripe', detail: JSON.stringify(data) });

    return res.status(200).json({ url: data.url });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};
