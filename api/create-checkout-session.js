import Stripe from "stripe";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Source de vérité côté serveur (à ajuster)
const CATALOG = {
  livraison_locale: { name: "Livraison locale", unit_amount: 599, currency: "cad" },
  // Exemple si tu ajoutes des items plus tard :
  // item_poutine: { name: "Poutine", unit_amount: 1299, currency: "cad" },
};

// CORS helper
function setCors(req, res) {
  const origin = req.headers.origin || "";

  // Autorise ton domaine prod + previews Vercel (pratique en dev)
  const allowed =
    origin === "https://livremagog.vercel.app" ||
    (origin && origin.endsWith(".vercel.app"));

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};

    // Supporte les 2 formats:
    // - Nouveau (recommandé): { cart: [{ sku, qty }] }
    // - Ancien: { items: [{ nom, prix, quantite }], livraison, taxes }
    const cart = Array.isArray(body.cart) ? body.cart : null;
    const items = Array.isArray(body.items) ? body.items : null;

    const line_items = [];

    if (cart && cart.length > 0) {
      // SKU + qty => prix serveur
      for (const item of cart) {
        const sku = String(item.sku || "");
        const qty = parseInt(item.qty, 10);

        const entry = CATALOG[sku];
        if (!entry) {
          return res.status(400).json({ error: `Unknown sku: ${sku}` });
        }
        if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
          return res.status(400).json({ error: `Invalid qty for ${sku}` });
        }

        line_items.push({
          quantity: qty,
          price_data: {
            currency: entry.currency,
            product_data: { name: entry.name },
            unit_amount: entry.unit_amount,
          },
        });
      }
    } else if (items && items.length > 0) {
      // Ancien format: nom/prix/quantite (moins sécuritaire)
      for (const item of items) {
        const nom = String(item.nom || "Item");
        const prix = Number(item.prix);
        const quantite = parseInt(item.quantite ?? 1, 10);

        if (!Number.isFinite(prix) || prix <= 0) {
          return res.status(400).json({ error: `Invalid price for item: ${nom}` });
        }
        if (!Number.isFinite(quantite) || quantite < 1) {
          return res.status(400).json({ error: `Invalid quantity for item: ${nom}` });
        }

        line_items.push({
          price_data: {
            currency: "cad",
            product_data: { name: nom },
            unit_amount: Math.round(prix * 100),
          },
          quantity: quantite,
        });
      }

      // Optionnel: livraison/taxes comme lignes séparées
      const livraisonNum = Number(body.livraison || 0);
      const taxesNum = Number(body.taxes || 0);

      if (livraisonNum > 0) {
        line_items.push({
          price_data: {
            currency: "cad",
            product_data: { name: "Frais de livraison" },
            unit_amount: Math.round(livraisonNum * 100),
          },
          quantity: 1,
        });
      }

      if (taxesNum > 0) {
        line_items.push({
          price_data: {
            currency: "cad",
            product_data: { name: "Taxes" },
            unit_amount: Math.round(taxesNum * 100),
          },
          quantity: 1,
        });
      }
    } else {
      return res.status(400).json({ error: "No items provided" });
    }

    const baseUrl = process.env.FRONTEND_URL;
    if (!baseUrl) return res.status(500).json({ error: "Missing FRONTEND_URL" });

    const orderToken = crypto.randomUUID();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      metadata: { orderToken },
      payment_intent_data: { metadata: { orderToken } },
    });

    // IMPORTANT: ton frontend attend "url"
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res.status(500).json({ error: err.message || "Stripe error" });
  }
}
