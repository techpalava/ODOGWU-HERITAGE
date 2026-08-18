# Firebase Staging QA

Local browser QA for Design Studio, including Custom Details construction breakdown, must never use the live Firebase project.

Production project ID that local development must reject:

`gen-lang-client-0614710868`

## Why local development is blocked from production Firebase

The SPA previously initialized the committed production Firebase web configuration as soon as the client loaded. `npm run dev` therefore read live Firestore immediately.

Local Vite development now fails closed until an explicit non-production staging configuration is supplied through an ignored `.env.local`. There is no silent fallback to the production project.

Unsupported or non-Vite runtime contexts also fail closed. Only a normal Vite development runtime (`DEV=true`, `PROD=false`, `MODE=development`) or a normal Vite production build (`DEV=false`, `PROD=true`, `MODE=production`) may initialize the Firebase client. Empty, contradictory, or unknown signals — including `vite build --mode staging` — throw before Firebase initializes.

## Create a dedicated Firebase staging project

This repository does **not** create or deploy the staging project. Do that manually:

1. In Firebase Console, create a new project used only for staging and browser QA.
2. Do not reuse `gen-lang-client-0614710868`.
3. Enable Authentication, Firestore, and Storage in that staging project when you are ready to exercise those services.
4. Deploy staging security rules and seed staging catalogue/style/fabric data separately. This configuration layer does not do that work.

Later, after the staging project exists, you may add a Firebase CLI alias with `firebase use --add`. Do not run that command until the project exists. Do not change `.firebaserc` in this task.

## Register a staging Web app

1. In the staging project, add a Web app.
2. Register `localhost` as an authorized Authentication domain before using Google or anonymous sign-in locally.

## Obtain the staging Firebase web configuration

From the **same** staging Web app settings, copy every **client** Firebase field together:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- `measurementId` (optional)
- Firestore database ID, if the staging project uses a named database

Do not mix production and staging Firebase web configuration. Copying only the staging `projectId` while retaining a production `authDomain`, `storageBucket`, messaging sender ID, app ID, API key, measurement ID, or Firestore database ID will be rejected.

Custom Auth domains and Storage buckets may use a different format from the staging project ID, but they must still come from that staging Web app — never from production.

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

Copy every value from the same staging Firebase Web app:

```bash
VITE_APP_ENV=staging
VITE_FIREBASE_API_KEY=YOUR_STAGING_WEB_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_STAGING_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_STAGING_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STAGING_PROJECT.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_STAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_STAGING_WEB_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIRESTORE_DATABASE_ID=
```

See `.env.example` for the same placeholders. `VITE_*` variables are browser-visible.

## Firestore database ID

- Set `VITE_FIRESTORE_DATABASE_ID` to the staging named database ID when staging uses a named database.
- Leave it blank, omit it, or set it to `(default)` to use the SDK default Firestore database.
- Do not copy the production named database ID into staging configuration.

## Browser-visible `VITE_*` values

Anything prefixed with `VITE_` is bundled into the browser. Use only Firebase **web** configuration.

Never put Admin credentials, private keys, `FIREBASE_ADMIN_*`, or `FIREBASE_SERVICE_ACCOUNT_KEY` in `VITE_*` variables.

## Admin private keys remain server-only

`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` are server-only. They are not read by the Firebase client configuration resolver. Keep them out of `.env.local` unless you are intentionally running server Admin routes against staging, and never expose them to the client.

## Run `npm run dev`

Normal browser QA uses `npm run dev` with an ignored staging `.env.local`. That is the supported path.

```bash
npm run dev
```

Restart the dev server after changing `.env.local`. Vite reads those values at startup.

`vite build --mode staging` is **not** the supported way to run browser staging QA. That mode is an unknown/contradictory runtime and fails closed instead of initializing production or a mixed staging build.

## Verify the console diagnostic

In the browser or server terminal, look for a non-sensitive diagnostic similar to:

```text
[firebase-client] applicationEnvironment=staging projectId=YOUR_STAGING_PROJECT_ID firestoreDatabaseId=(default) configurationSource=explicit_environment
```

Confirm:

- `applicationEnvironment=staging`
- `projectId` is the staging project
- `configurationSource=explicit_environment`

The diagnostic must not include the API key, Admin credentials, or tokens.

## Stop immediately if the production project ID appears

If the diagnostic or network traffic shows `gen-lang-client-0614710868`, stop. Local development is misconfigured and must not continue.

## `test-storage.ts` is staging-only

`test-storage.ts` must never use the committed production configuration. It resolves the same explicit staging `VITE_FIREBASE_*` web fields, rejects missing, partial, mixed, or production identifiers, and initializes Firebase only after that staging resolver succeeds.

Do not run it against production. Do not import `firebase-applet-config.json` as an `initializeApp` fallback.

## Remaining manual staging setup

This configuration boundary only selects which Firebase **web** project the browser talks to. You still need to set up, separately and manually:

- Authentication providers and authorized domains
- Firestore
- Storage
- Security rules
- Seeded catalogue, styles, fabrics, and other QA data

## This task does not create or deploy staging Firebase

No staging project is created here. No Firebase or Vercel deployment is performed. Production configuration remains the committed fallback for a normal `npm run build` only.
