# Developer Notes

## Firebase Domain Authorization Checklist
If you encounter `auth/unauthorized-domain` during Google login, Firebase blocks the login before any app authorization checks can run. This is not an admin allowlist failure. You must add the exact domain where the app is being hosted to Firebase Authentication.

Go to: **Firebase Console > Authentication > Settings > Authorized domains** and add:
- `localhost`
- `127.0.0.1`
- `ais-dev-7jn7aw7dduq2ip4weuzcbn-156083073282.europe-west2.run.app` (AI Studio preview domain)
- `ais-pre-7jn7aw7dduq2ip4weuzcbn-156083073282.europe-west2.run.app` (AI Studio shared domain)
- The production domain
- Any Vercel or custom domain currently used
