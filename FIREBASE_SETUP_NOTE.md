# Firebase Console Setup Note

For Google Authentication to function properly in both development and production environments, the following configurations must be made in the Firebase Console:

1. **Enable Google Provider:**
   - Navigate to Authentication > Sign-in method.
   - Click "Add new provider" (or edit the existing one) and select **Google**.
   - Enable it and save.

2. **Authorized Domains:**
   - Navigate to Authentication > Settings > Authorized domains.
   - Add the following domains:
     - `odogwu-heritage.vercel.app` (for production)
     - `localhost` (for local development)
