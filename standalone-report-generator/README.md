# Standalone Report Generator Starter

This folder is a starter app for the new standalone GitHub Pages report-generator repo.

## What is included

- Standalone login flow (Google sign-in via Firebase Auth)
- Report template CRUD (users/{uid}/reportTemplates)
- Phrase handling CRUD (users/{uid}/phraseHandlings)
- AI report generation with user-provided OpenAI, Claude, or Gemini API keys (browser mode)
- AI report generation via Firebase Functions proxy (server-side API keys)
- Mobile-friendly two-column layout that collapses to one column
- Firebase config files for standalone project setup (`firebase.json`, `.firebaserc`)
- Firestore rules file included at `firestore.rules`

## Before first run

1. Update `js/firebase-config.js` with the new Firebase project values.
2. Ensure your new project has:
   - Authentication enabled for Google
   - Firestore enabled
3. Add your GitHub Pages domain to Firebase authorized domains.
4. Configure server-side API keys in Firebase Functions.

## Configure Firebase Functions AI proxy

This app now routes AI calls through Firebase at `/api/generate`.

1. Install function dependencies:

```bash
cd functions
npm install
```

2. Set secrets directly in Firebase Secret Manager (no `.env` file required):

```bash
firebase functions:secrets:set OPENAI_API_KEY --project reports-eadf8
firebase functions:secrets:set ANTHROPIC_API_KEY --project reports-eadf8
firebase functions:secrets:set GEMINI_API_KEY --project reports-eadf8
```

3. (Optional) confirm secrets are present:

```bash
firebase functions:secrets:list --project reports-eadf8
```

4. Deploy hosting + functions:

```bash
cd ..
firebase deploy --only hosting,functions --project YOUR_PROJECT_ID
```

## Firestore rules expectation

This app assumes user-scoped access under:

- `users/{uid}/reportTemplates/*`

This folder already includes a deployable rules file:

- `firestore.rules`

To deploy rules from the standalone folder after setting your project ID:

```bash
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

## Deploy as a new GitHub Pages repo

1. Create a new repository (for example `searches-report-generator`).
2. Copy this folder contents to the root of that repository.
3. Add this workflow at `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy Report Generator to GitHub Pages

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload website artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

4. In repo Settings, enable GitHub Pages with source `GitHub Actions`.

## Notes

- API provider keys are stored in Firebase Secret Manager and bound to the `aiProxy` function.
- The browser sends only provider/model/prompt and a Firebase ID token to `/api/generate`.
- Templates can store their active phrase handling selection through `selectedPhraseHandlingIds` so each template can remember which phrase rules should be applied during generation.
- Phrase handling drafts can be generated from an example phrase or rule and then saved for reuse.
- Update model options or provider list in `js/app.js` as needed.
- Set the Firebase project ID in `.firebaserc` before using default `firebase deploy` commands.
