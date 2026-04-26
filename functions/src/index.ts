/**
 * functions/src/index.ts — NoteTedd Stripe Integration
 *
 * Two functions:
 *   1. createCheckoutSession — creates a Stripe Checkout session
 *   2. stripeWebhook         — handles Stripe events, grants premium
 */

import * as admin from "firebase-admin";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";

admin.initializeApp();

// ── RevenueCat webhook ────────────────────────────────────────
export { revenuecatWebhook } from "./revenuecatWebhook";

const db = admin.firestore();

// Stripe v16+ — use the latest API version string from your dashboard
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

// ── Plan → Stripe Price ID map ────────────────────────────────
const PRICE_IDS: Record<string, string> = {
  notetedd_premium_weekly:   process.env.STRIPE_PRICE_WEEKLY   ?? "",
  notetedd_premium_monthly:  process.env.STRIPE_PRICE_MONTHLY  ?? "",
  notetedd_premium_semester: process.env.STRIPE_PRICE_SEMESTER ?? "",
  notetedd_premium_yearly:   process.env.STRIPE_PRICE_YEARLY   ?? "",
};

// ── Lazy Stripe client — initialized on first use, not at module load ──
let _stripe: Stripe | null = null;
const getStripe = (): Stripe => {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
};

// ════════════════════════════════════════════════════════════════
//  1. CREATE CHECKOUT SESSION
// ════════════════════════════════════════════════════════════════

export const createCheckoutSession = onCall(async (request) => {
  // Auth guard — v2 uses request.auth
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to subscribe."
    );
  }

  const { planId, successUrl, cancelUrl } = request.data as {
    planId:     string;
    successUrl: string;
    cancelUrl:  string;
  };

  const uid   = request.auth.uid;
  const email = request.auth.token.email ?? "";

  if (!PRICE_IDS[planId]) {
    throw new HttpsError("invalid-argument", `Unknown plan: ${planId}`);
  }

  // Look up or create Stripe customer tied to this Firebase UID
  let stripeCustomerId: string | undefined;

  const userDoc = await db.collection("users").doc(uid).get();
  stripeCustomerId = userDoc.data()?.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await getStripe().customers.create({
      email,
      metadata: { firebaseUID: uid },
    });
    stripeCustomerId = customer.id;
    await db.collection("users").doc(uid).set(
      { stripeCustomerId },
      { merge: true }
    );
  }

  const session = await getStripe().checkout.sessions.create({
    customer:   stripeCustomerId,
    mode:       "subscription",
    line_items: [{ price: PRICE_IDS[planId], quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  cancelUrl,
    metadata: { firebaseUID: uid, planId },
    subscription_data: {
      metadata: { firebaseUID: uid, planId },
    },
    allow_promotion_codes: true,
  });

  return { sessionId: session.id, url: session.url };
});

// ════════════════════════════════════════════════════════════════
//  2. STRIPE WEBHOOK
// ════════════════════════════════════════════════════════════════

export const stripeWebhook = onRequest(async (req, res) => {
  const sig    = req.headers["stripe-signature"] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      (req as any).rawBody,
      sig,
      secret
    );
  } catch (err: any) {
    console.error("Webhook signature error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  const getUID = (obj: any): string | null =>
    obj?.metadata?.firebaseUID ?? null;

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid     = getUID(session);
        if (!uid) break;
        await grantPremium(uid, {
          planId:          session.metadata?.planId ?? "unknown",
          stripeSessionId: session.id,
          subscriptionId:  session.subscription as string,
          source:          "stripe_checkout",
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // invoice.subscription can be string | Stripe.Subscription | null
        const subId = (invoice as any).parent?.subscription_details?.subscription
  ?? (invoice as any).subscription_id
  ?? null;
        if (!subId) break;
        const sub = await getStripe().subscriptions.retrieve(subId);
        const uid = getUID(sub);
        if (!uid) break;
        await grantPremium(uid, {
          planId:         (sub as any).metadata?.planId ?? "unknown",
          subscriptionId: sub.id,
          source:         "stripe_renewal",
          periodEnd:      new Date(
            (sub as any).current_period_end * 1000
          ).toISOString(),
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = getUID(sub);
        if (!uid) break;
        await revokePremium(uid, sub.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).parent?.subscription_details?.subscription
  ?? (invoice as any).subscription_id
  ?? null;
        if (!subId) break;
        const sub = await getStripe().subscriptions.retrieve(subId);
        const uid = getUID(sub);
        if (!uid) break;
        await db.collection("users").doc(uid).set(
          {
            subscription: {
              paymentFailed:   true,
              paymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Internal error");
  }
});

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

async function grantPremium(uid: string, meta: Record<string, any>) {
  await db.collection("users").doc(uid).set(
    {
      subscription: {
        isPremium:      true,
        isInTrial:      false,
        trialExpired:   false,
        source:         meta.source,
        planId:         meta.planId,
        subscriptionId: meta.subscriptionId ?? null,
        grantedAt:      admin.firestore.FieldValue.serverTimestamp(),
        periodEnd:      meta.periodEnd ?? null,
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await db.collection("analytics").add({
    event:      "purchase_completed",
    userId:     uid,
    properties: meta,
    platform:   "web",
    timestamp:  admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`✅ Premium granted to ${uid} via ${meta.source}`);
}

async function revokePremium(uid: string, subscriptionId: string) {
  await db.collection("users").doc(uid).set(
    {
      subscription: {
        isPremium:      false,
        subscriptionId: null,
        revokedAt:      admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await db.collection("analytics").add({
    event:      "subscription_cancelled",
    userId:     uid,
    properties: { subscriptionId },
    platform:   "web",
    timestamp:  admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`⛔ Premium revoked for ${uid}`);
}