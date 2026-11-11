import Stripe from 'stripe';

// One client instance for the app (no global/module-level key pattern).
// If no key is configured yet, the store runs in "not configured" mode
// and checkout returns a friendly error instead of crashing.
export const stripe = process.env.STRIPE_API_KEY
  ? new Stripe(process.env.STRIPE_API_KEY)
  : null;

// Webhook signature checks don't need an API key, only the signing secret.
export const webhookVerifier = new Stripe('unused_for_webhook_verification');
