// ============================================================
//  Capilario — Création du paiement (Stripe Checkout)
//  Reçoit { answers, result, email } et renvoie l'URL de paiement.
//  On range answers + result dans la session (metadata) : au retour,
//  le rapport est généré à partir de ça, sans dépendre du navigateur.
//  Clé Stripe côté serveur uniquement.
// ============================================================

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { answers = {}, result = {}, email = '' } = req.body || {};
    const site = process.env.SITE_URL || 'https://capilario-pnxy.vercel.app';

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', site + '/?paid=1&session_id={CHECKOUT_SESSION_ID}');
    params.append('cancel_url', site + '/?canceled=1');
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'eur');
    params.append('line_items[0][price_data][unit_amount]', '500'); // 5,00 €
    params.append('line_items[0][price_data][product_data][name]', 'Bilan capillaire complet — Capilario');
    params.append('metadata[a]', JSON.stringify(answers).slice(0, 490));
    params.append('metadata[r]', JSON.stringify(result).slice(0, 490));
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
