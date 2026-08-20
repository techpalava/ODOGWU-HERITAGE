# Firebase Staging QA

The existing Firebase project is **pre-launch staging**, not production.

Staging project ID:

`gen-lang-client-0614710868`

The website has not launched. There are no real customers and no important production orders. Staging data is disposable. Do not create another staging Firebase project now. Do not promote this project by renaming it production.

A separate production Firebase project is mandatory before public launch.

## Runtime mode is not the Firebase environment

Vite has a development runtime and a production-build runtime. Those are not Firebase environments.

- `npm run dev` is the Vite development runtime. It requires an ignored staging `.env.local`.
- `npm run build` is the Vite production-build runtime. Until a dedicated production Firebase project exists, that build still uses the **committed staging** Web configuration.

A successful production-mode build does **not** mean the app is connected to production Firebase. Until a dedicated production Firebase project is configured, builds continue to use staging resources and must not be publicly launched as production.

## Why local development still requires `.env.local`

The SPA still fails closed in Vite development until explicit staging `VITE_FIREBASE_*` values are supplied through an ignored `.env.local`. There is no silent fallback and no mixed-project configuration.

Those explicit values may be the current committed staging Web app, including `gen-lang-client-0614710868`. They are no longer rejected merely for matching the committed configuration.

Unsupported or non-Vite runtime contexts also fail closed. Only a normal Vite development runtime (`DEV=true`, `PROD=false`, `MODE=development`) or a normal Vite production build (`DEV=false`, `PROD=true`, `MODE=production`) may initialize the Firebase client. Empty, contradictory, or unknown signals — including `vite build --mode staging` — throw before Firebase initializes.

## Use the existing staging project

Do **not** create a new staging Firebase project for this QA path.

1. Use the existing project `gen-lang-client-0614710868`.
2. Use its existing staging Web app.
3. Use the existing named staging Firestore database unless you intentionally configure another supported database on a different non-production project.
4. Register `localhost` as an authorized Authentication domain before using Google or anonymous sign-in locally.

## Obtain the staging Firebase web configuration

From the **same** staging Web app settings, copy every **client** Firebase field together:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- `measurementId` (optional)
- Firestore database ID for the current named staging database

The committed copy of this Web configuration is `firebase-applet-config.json`. You may copy those values into an ignored `.env.local`.

If you later use a different non-production Firebase project, copy every field from that other Web app. Do not mix identifiers from both projects. Custom Auth domains and Storage buckets may use a different format, but they must still belong to the same Web app as the project ID.

Never copy Admin SDK JSON, private keys, or service-account files into `VITE_*` variables.

## Create an ignored `.env.local`

Create `.env.local` in the repository root. It is already gitignored via `.env*`.

Do not commit `.env`, `.env.local`, or `.env.staging`.

## Set `VITE_APP_ENV=staging`

Local development accepts only this approved non-production value:

```bash
VITE_APP_ENV=staging
```

## Add the staging `VITE_FIREBASE_*` fields

Copy every value from the same staging Firebase Web app. For the current project, that includes the committed named Firestore database ID:

```bash
VITE_APP_ENV=staging
VITE_FIREBASE_API_KEY=YOUR_STAGING_WEB_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_STAGING_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0614710868
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STAGING_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_STAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_STAGING_WEB_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIRESTORE_DATABASE_ID=YOUR_STAGING_NAMED_DATABASE_ID
```

See `.env.example` for placeholders. `VITE_*` variables are browser-visible.

If `VITE_FIREBASE_PROJECT_ID` is the current committed staging project, every other identifier must match that same committed Web app. Leaving the Firestore database ID blank uses the committed named staging database. Set it to `(default)` only if you intentionally want the SDK default database.

## Browser-visible `VITE_*` values

Anything prefixed with `VITE_` is bundled into the browser. Use only Firebase **web** configuration.

Never put Admin credentials, private keys, `FIREBASE_ADMIN_*`, or `FIREBASE_SERVICE_ACCOUNT_KEY` in `VITE_*` variables.

## Admin private keys remain server-only

`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` are server-only. They are not read by the Firebase client configuration resolver. If you use Admin routes locally, point them at staging, never at a future production project, and never expose them to the client.

## Run `npm run dev`

Normal browser QA uses `npm run dev` with an ignored staging `.env.local` that passes staging validation. That is the supported path.

```bash
npm run dev
```

Restart the dev server after changing `.env.local`. Vite reads those values at startup.

`vite build --mode staging` is **not** the supported way to run browser staging QA. That mode is an unknown/contradictory runtime and fails closed.

## Verify the console diagnostic

In the browser or server terminal, look for a non-sensitive diagnostic similar to:

```text
[firebase-client] applicationEnvironment=staging projectId=gen-lang-client-0614710868 firestoreDatabaseId=YOUR_STAGING_NAMED_DATABASE_ID configurationSource=explicit_environment
```

Confirm:

- `applicationEnvironment=staging`
- `projectId` is the staging project
- `configurationSource=explicit_environment`

The diagnostic must not include the API key, Admin credentials, or tokens.

Production-mode builds do not emit this browser diagnostic. Their resolver result is still `applicationEnvironment=staging` with `configurationSource=committed_staging`.

## Stop immediately if the app claims to be production Firebase

No production Firebase project exists yet. If a diagnostic, comment, or deployment description says the current project is production, stop. The current project is staging and is not launch-ready.

## `test-storage.ts` is staging-only

`test-storage.ts` must never fall back to `firebase-applet-config.json` as `initializeApp` input. It resolves explicit staging `VITE_FIREBASE_*` web fields, accepts the current committed staging Web app when those fields are complete and consistent, accepts a different internally consistent non-production project, and rejects missing, partial, or mixed identifiers.

Do not run it as a live Storage smoke test unless you intend to write to staging. Do not invent production credentials for it.

## Remaining manual staging setup

This configuration boundary only selects which Firebase **web** project the browser talks to. Staging Auth, Firestore, Storage, rules, and seed data still require separate setup when they are not already present.

## Future production Firebase project

Before public launch, developers must:

1. Create a separate production Firebase project. Do not reuse `gen-lang-client-0614710868`.
2. Register a production Web app.
3. Create production Firestore and Storage.
4. Deploy production rules.
5. Seed approved production data.
6. Introduce production configuration separately.
7. Prove staging and production identifiers are isolated.
8. Update deployment environment configuration deliberately.

Never silently promote the staging project later by renaming it production.

## This branch does not create or deploy Firebase

No Firebase or Vercel deployment is performed here. `npm run build` continues to pass without `.env.local` because the Vite production runtime uses the committed **staging** configuration. That is acceptable only because the website is pre-launch.
