import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed =
    origin === "https://livremagog.vercel.app" ||
    (origin && origin.endsWith(".vercel.app"));

  if (allowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const session_id = req.query.session_id;
    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(session_id);

    return res.status(200).json({
      paid: session.payment_status === "paid",
      payment_status: session.payment_status,
      orderToken: session.metadata?.orderToken || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: "Unable to verify session" });
  }
}
