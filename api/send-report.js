// ============================================================
//  Capilario — Envoi du bilan gratuit par email (via Resend)
//  Reçoit { email, result } depuis le site et envoie un récap.
//  Clés côté serveur uniquement (variables d'environnement).
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(result, siteUrl) {
  const r = result || {};
  const row = (k, v) => `
    <tr>
      <td style="padding:10px 0;color:#6b7d72;font-size:14px;">${esc(k)}</td>
      <td style="padding:10px 0;text-align:right;font-weight:700;color:#16221c;font-size:14px;">${esc(v)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f4f6f2;font-family:Arial,Helvetica,sans-serif;color:#16221c;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#0e1a15;border-radius:16px;padding:22px 24px;">
      <div style="color:#c6f03e;font-weight:800;letter-spacing:2px;font-size:13px;">CAPILARIO</div>
      <div style="color:#eef2e9;font-size:22px;font-weight:700;margin-top:8px;">Ton bilan capillaire</div>
    </div>

    <div style="background:#ffffff;border-radius:16px;padding:22px 24px;margin-top:14px;">
      <div style="font-size:20px;font-weight:700;">${esc(r.verdict || 'Analyse capillaire')}</div>
      <div style="color:#6b7d72;font-size:15px;margin-top:6px;">${esc(r.subtitle || '')}</div>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        ${row('Zone analysée', r.zone || '—')}
        ${row('Indice de densité', (r.densityIndex != null ? r.densityIndex + '/100' : '—'))}
        ${row('Stade estimé', r.stage || '—')}
        ${row('Type de cheveu', r.hairType || '—')}
      </table>

      <div style="background:#f4f6f2;border-radius:12px;padding:16px;margin-top:18px;">
        <div style="font-weight:700;font-size:15px;">🔒 Va plus loin avec le bilan complet</div>
        <div style="color:#6b7d72;font-size:14px;margin-top:6px;">
          Analyse détaillée, routine sur 90 jours et produits ciblés adaptés à ton cas.
        </div>
        <a href="${esc(siteUrl)}" style="display:inline-block;margin-top:14px;background:#c6f03e;color:#0e1a15;
          text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:100px;">
          Débloquer mon bilan complet — 5 €
        </a>
      </div>
    </div>

    <div style="color:#9aa89e;font-size:12px;line-height:1.5;margin-top:16px;text-align:center;">
      Analyse cosmétique à visée de soin. Ne constitue pas un avis médical.<br>
      Capilario · ${esc(siteUrl)}
    </div>
  </div>
</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { email = '', result = {} } = req.body || {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    const from = process.env.MAIL_FROM || 'Capilario <onboarding@resend.dev>';
    const siteUrl = process.env.SITE_URL || 'https://capilario.vercel.app';

    const apiRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Ton bilan capillaire Capilario',
        html: buildHtml(result, siteUrl)
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Envoi impossible', detail });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};
