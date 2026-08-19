# Agent Instructions

## Universal Fabric Import via AI Prompt

When a user asks you to "upload this fabric", "identify this fabric", "add this fabric", or "create catalogue item" and attaches an image, you MUST initiate the Universal Fabric Import Workflow.

To do this, you MUST NOT ask the user to use the UI. Instead, use the `shell_exec` tool to run a script that uploads the image and writes a draft to the `fabric_drafts` Firestore collection. 

The frontend `DatabaseView.tsx` component is listening to `fabric_drafts`. Once the draft is written, the frontend will automatically pop up the Add Fabric form, pre-populated, for the administrator to review.

**Process for the AI Agent:**
1. Determine the path of the uploaded image file in the AI Studio environment (usually `src/assets/images/...`).
2. Run the helper script using the shell_exec tool:
   `npx -y tsx src/scripts/aiImportFabric.ts "src/assets/images/uploaded_file.jpg"`
3. Inform the user that the import workflow has been initiated and they should review the populated form in the Fabric Catalogue UI.

Do NOT manually create the fabric item in the `fabrics` collection unless explicitly requested. The user expects to review the auto-populated form and click "Save Fabric Settings" themselves.

## Cursor Cloud specific instructions

This repo is a single Vite + React + TypeScript + Firebase SPA ("The Odogwu Heritage", a bespoke West-African garment design/e-commerce platform). There is one service: `npm run dev` (`tsx server.ts`) runs an Express server on port `3000` that serves the Vite dev middleware and the `/api/*` routes. There is no separate backend process. Navigation is tab-based (Zustand + `sessionStorage`), not URL routes. Standard commands live in `package.json` scripts and Firebase setup in `docs/FIREBASE_STAGING_QA.md`.

- Dev server env requirement (gotcha): `npm run dev` fails closed at startup unless a git-ignored `.env.local` contains a complete staging `VITE_FIREBASE_*` set with `VITE_APP_ENV=staging`. The environment update script creates `.env.local` from the committed staging web config in `firebase-applet-config.json` (these are non-secret staging web identifiers, not admin keys). Vite reads `.env.local` only at startup, so restart the dev server after editing it.
- Lint: `npm run lint` (`tsc --noEmit`).
- Tests: the many `npm run test:*` scripts run standalone via `tsx` and cover pure domain logic. Gotcha: a few (e.g. `test:guest-checkout`) transitively import the browser client `src/services/firebase.ts` and throw `FIREBASE_CLIENT_CONFIGURATION_INVALID` ("runtime mode is unknown") under plain `tsx`, because `import.meta.env` (DEV/PROD/MODE) is only set inside the Vite runtime — those are not meant to run standalone. `npm run test:firestore-emulator` runs the real Firestore security-rules suite against the emulator (needs Java, which is present; downloads the emulator jar on first run). Its `PERMISSION_DENIED` log lines are expected assertions, not failures.
- Optional server secrets (app runs fully without them): `GEMINI_API_KEY` (AI measurement estimation, otherwise a heuristic fallback is used), `STRIPE_SECRET_KEY` (otherwise payments are simulated), and `FIREBASE_ADMIN_*` (required only for PIN login/register, `/api/auth/bootstrap`, and uploaded-design transfer routes).
- Auth gotchas for headless testing: Google OAuth and the admin portal need a popup + a Firebase-authorized domain and are not feasible headless; PIN login needs `FIREBASE_ADMIN_*`. The guest Design Studio flow (home → Design Studio → pick garment → Continue to Fabric) needs no auth and is the reliable smoke test.
