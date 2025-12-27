import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // --- CORS ---
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { items, livraison = 0, taxes = 0 } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    // Sécuriser / normaliser les données
    const line_items = items.map((item) => {
      const nom = String(item.nom || "Item");
      const prix = Number(item.prix);
      const quantite = Number(item.quantite || 1);

      if (!Number.isFinite(prix) || prix <= 0) {
        throw new Error(`Invalid price for item: ${nom}`);
      }
      if (!Number.isFinite(quantite) || quantite < 1) {
        throw new Error(`Invalid quantity for item: ${nom}`);
      }

      return {
        price_data: {
          currency: "cad",
          product_data: { name: nom },
          unit_amount: Math.round(prix * 100),
        },
        quantity: quantite,
      };
    });

    // Optionnel: ajouter livraison et taxes comme lignes séparées (si tu veux)
    const livraisonNum = Number(livraison || 0);
    const taxesNum = Number(taxes || 0);

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

    const successUrl = `${process.env.FRONTEND_URL}/success.html`;
    const cancelUrl = `${process.env.FRONTEND_URL}/cancel.html`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res.status(500).json({ error: "Stripe error" });
  }
}

