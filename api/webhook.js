import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// IMPORTANT: Stripe a besoin du RAW body pour vérifier la signature
export const config = {
  api: {
    bodyParser: false,
  },
};

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed =
    origin === "https://livremagog.vercel.app" ||
    (origin && origin.endsWith(".vercel.app"));

  if (allowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Helper pour lire le raw body
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing Stripe-Signature header");

  try {
    const rawBody = await readRawBody(req);

    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // ✅ Ici tu reçois les événements Stripe confirmés
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // À ce stade: paiement confirmé côté Stripe
      // Tu peux créer ta commande en DB (prochaine étape)
      console.log("✅ checkout.session.completed", {
        session_id: session.id,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        orderToken: session.metadata?.orderToken || null,
      });
    } else {
      console.log("ℹ️ Stripe event:", event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
