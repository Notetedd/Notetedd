/**
 * revenuecatWebhook.ts — NoteTedd
 *
 * Receives RevenueCat server-to-server webhook events and updates
 * Firestore instantly so mobile subscription state is always fresh.
 *
 * Events handled:
 *   INITIAL_PURCHASE        → grant premium
 *   RENEWAL                 → extend premium
 *   CANCELLATION            → schedule revoke at period end
 *   EXPIRATION              → revoke premium
 *   BILLING_ISSUE           → flag payment problem
 *   REFUND                  → revoke premium immediately
 *
 * Setup:
 *   1. firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET
 *   2. Deploy: firebase deploy --only functions
 *   3. In RevenueCat dashboard → Project Settings → Webhooks:
 *      URL: https://REGION-PROJECT.cloudfunctions.net/revenuecatWebhook
 *      Authorization header: Bearer <your secret>
 */

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

// admin.initializeApp() is called once in index.ts — do NOT call here.
const db = admin.firestore();

// ════════════════════════════════════════════════════════════════
//  REVENUECAT EVENT TYPES
// ════════════════════════════════════════════════════════════════

const RC_EVENTS = {
  INITIAL_PURCHASE: "INITIAL_PURCHASE",
  RENEWAL:          "RENEWAL",
  CANCELLATION:     "CANCELLATION",
  EXPIRATION:       "EXPIRATION",
  BILLING_ISSUE:    "BILLING_ISSUE",
  REFUND:           "REFUND",
} as const;

type RCEventType = typeof RC_EVENTS[keyof typeof RC_EVENTS];

interface RCWebhookPayload {
  event: {
    type:                    RCEventType;
    app_user_id:             string;
    aliases?:                string[];
    product_id?:             string;
    period_type?:            string;
    purchased_at_ms?:        number;
    expiration_at_ms?:       number;
    store?:                  string;
    environment?:            string;
    price?:                  number;
    currency?:               string;
    transaction_id?:         string;
    original_transaction_id?: string;
    error_code?:             string;
  };
  api_version: string;
}

// ════════════════════════════════════════════════════════════════
//  WEBHOOK HANDLER
// ════════════════════════════════════════════════════════════════

export const revenuecatWebhook = onRequest(async (req, res) => {

  // ── 1. Method guard ──────────────────────────────────────────
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // ── 2. Auth guard ────────────────────────────────────────────
  const authHeader = req.headers["authorization"] ?? "";
  const secret     = process.env.REVENUECAT_WEBHOOK_SECRET ?? "";

  if (!secret) {
    console.error("REVENUECAT_WEBHOOK_SECRET is not set");
    res.status(500).send("Server misconfiguration");
    return;
  }

  if (authHeader !== `Bearer ${secret}`) {
    console.warn("RevenueCat webhook: invalid authorization header");
    res.status(401).send("Unauthorized");
    return;
  }

  // ── 3. Parse body ────────────────────────────────────────────
  let payload: RCWebhookPayload;
  try {
    payload = req.body as RCWebhookPayload;
    if (!payload?.event?.type || !payload?.event?.app_user_id) {
      throw new Error("Missing event.type or event.app_user_id");
    }
  } catch (err: any) {
    console.error("RevenueCat webhook: invalid payload:", err.message);
    res.status(400).send("Bad Request");
    return;
  }

  const { event } = payload;
  const uid        = event.app_user_id;

  // ── 4. Skip sandbox events in production ─────────────────────
  if (event.environment === "SANDBOX" && process.env.NODE_ENV === "production") {
    console.log(`Skipping sandbox event ${event.type} for ${uid}`);
    res.json({ received: true, skipped: "sandbox" });
    return;
  }

  console.log(`[RC Webhook] ${event.type} for user ${uid}`);

  // ── 5. Route to handler ──────────────────────────────────────
  try {
    switch (event.type) {
      case RC_EVENTS.INITIAL_PURCHASE:
        await handlePurchase(uid, event, "initial_purchase");
        break;
      case RC_EVENTS.RENEWAL:
        await handlePurchase(uid, event, "renewal");
        break;
      case RC_EVENTS.CANCELLATION:
        await handleCancellation(uid, event);
        break;
      case RC_EVENTS.EXPIRATION:
        await handleExpiration(uid, event);
        break;
      case RC_EVENTS.BILLING_ISSUE:
        await handleBillingIssue(uid, event);
        break;
      case RC_EVENTS.REFUND:
        await handleRefund(uid, event);
        break;
      default:
        console.log(`[RC Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("[RC Webhook] Handler error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  EVENT HANDLERS
// ════════════════════════════════════════════════════════════════

async function handlePurchase(
  uid: string,
  event: RCWebhookPayload["event"],
  source: string
) {
  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  await db.collection("users").doc(uid).set(
    {
      subscription: {
        isPremium:      true,
        isInTrial:      false,
        trialExpired:   false,
        source,
        platform:       event.store ?? "unknown",
        productId:      event.product_id ?? "unknown",
        transactionId:  event.transaction_id ?? null,
        expiresAt,
        paymentFailed:  false,
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await writeAnalytics(uid, "purchase_completed", {
    source,
    productId:   event.product_id,
    store:       event.store,
    environment: event.environment,
    price:       event.price,
    currency:    event.currency,
  });

  console.log(`✅ [RC] Premium granted to ${uid} — ${source}`);
}

async function handleCancellation(
  uid: string,
  event: RCWebhookPayload["event"]
) {
  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  await db.collection("users").doc(uid).set(
    {
      subscription: {
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await writeAnalytics(uid, "subscription_cancelled", {
    productId: event.product_id,
    store:     event.store,
    expiresAt,
  });

  console.log(`⚠️ [RC] Cancellation noted for ${uid} — expires ${expiresAt}`);
}

async function handleExpiration(
  uid: string,
  event: RCWebhookPayload["event"]
) {
  await db.collection("users").doc(uid).set(
    {
      subscription: {
        isPremium:    false,
        isInTrial:    false,
        trialExpired: true,
        revokedAt:    admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await writeAnalytics(uid, "subscription_expired", {
    productId: event.product_id,
    store:     event.store,
  });

  console.log(`⛔ [RC] Premium revoked for ${uid} — expired`);
}

async function handleBillingIssue(
  uid: string,
  event: RCWebhookPayload["event"]
) {
  await db.collection("users").doc(uid).set(
    {
      subscription: {
        paymentFailed:   true,
        paymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorCode:       event.error_code ?? "unknown",
        updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await writeAnalytics(uid, "billing_issue", {
    productId: event.product_id,
    store:     event.store,
    errorCode: event.error_code,
  });

  console.log(`💳 [RC] Billing issue for ${uid}`);
}

async function handleRefund(
  uid: string,
  event: RCWebhookPayload["event"]
) {
  await db.collection("users").doc(uid).set(
    {
      subscription: {
        isPremium:   false,
        isInTrial:   false,
        refundedAt:  admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  await writeAnalytics(uid, "subscription_refunded", {
    productId: event.product_id,
    store:     event.store,
    price:     event.price,
    currency:  event.currency,
  });

  console.log(`💸 [RC] Refund processed for ${uid}`);
}

// ════════════════════════════════════════════════════════════════
//  ANALYTICS HELPER
// ════════════════════════════════════════════════════════════════

async function writeAnalytics(
  uid: string,
  eventName: string,
  properties: Record<string, any>
) {
  try {
    await db.collection("analytics").add({
      event:      eventName,
      userId:     uid,
      properties,
      platform:   "mobile",
      source:     "revenuecat_webhook",
      timestamp:  admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[RC Webhook] Analytics write failed:", err);
  }
}