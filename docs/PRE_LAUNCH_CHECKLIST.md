# Pre-launch checklist

Remaining work before launch. Stripe is in test mode only.

Standing rule: no secrets, env changes, Firestore rules deploys, or production data writes without Xavier's explicit approval. Never commit or print a secret.

## AI Try-on Stripe top-up

[#1380](https://github.com/techpalava/ODOGWU-HERITAGE/pull/1380) added the admin Stripe top-up for 1,000 AI Try-on tries ($64). Released to production on 2026-11-08 via [#1384](https://github.com/techpalava/ODOGWU-HERITAGE/pull/1384) and [#1385](https://github.com/techpalava/ODOGWU-HERITAGE/pull/1385).

Until steps 2 and 3 are done, the button opens Checkout and no tries are added. Only admins can see it, so customers are not affected.

- [ ] **1. Firestore rules.** #1380 changed `firestore.rules`. The rules have not been deployed, so the live rules are behind the code. They need a deploy, which requires Xavier's explicit approval. Do this soon, ahead of launch, after someone checks what the gap affects.
- [ ] **2. Stripe webhook (test mode first).** Create an endpoint at `https://odogwu-heritage.vercel.app/api/ai-try-on/top-up-webhook` for the event `checkout.session.completed`, and copy its signing secret (`whsec_...`). Do not commit or print the secret.
- [ ] **3. Vercel env.** Add `STRIPE_AI_TRY_ON_TOP_UP_WEBHOOK_SECRET` (production) with that secret, then redeploy. `STRIPE_SECRET_KEY` stays `sk_test` until going live. Never commit or print the secret. Requires Xavier's explicit approval.
- [ ] **4. End-to-end test.** An admin uses "Top up 1,000 tries ($64)" with a Stripe test card. Someone confirms the global cap increases by 1,000 exactly once and the payment appears in the history.
- [ ] **5. Going live with real money.** Repeat steps 2 and 3 with live Stripe keys and a live webhook (live `STRIPE_SECRET_KEY` plus a new live webhook secret), then do one small real check. Requires Xavier's explicit approval.
