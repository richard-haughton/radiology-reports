# Standalone Report Generator Starter

This folder is a starter app for the new standalone GitHub Pages report-generator repo.

## What is included

- Standalone login flow (Google sign-in via Firebase Auth)
- Report template CRUD (users/{uid}/reportTemplates)
- Phrase handling CRUD (users/{uid}/phraseHandlings)
- AI report generation with each signed-in user's own OpenAI or Claude API key
- AI report generation via Firebase Functions proxy (per-user API keys saved in Firestore)
- Mobile-friendly two-column layout that collapses to one column
- Firebase config files for standalone project setup (`firebase.json`, `.firebaserc`)
- Firestore rules file included at `firestore.rules`

## Before first run

1. Update `js/firebase-config.js` with the new Firebase project values.
2. Ensure your new project has:
   - Authentication enabled for Google
   - Firestore enabled
3. Add your GitHub Pages domain to Firebase authorized domains.
4. No server-side secrets are required — each user enters their own API key in the app.

## Configure Firebase Functions AI proxy

This app now routes AI calls through Firebase at `/api/generate`.

1. Install function dependencies:

```bash
cd functions
npm install
```

2. Deploy hosting + functions:

```bash
firebase deploy --only hosting,functions --project YOUR_PROJECT_ID
```

There are no shared/server-side API keys to configure. Each signed-in user enters
their own OpenAI or Claude API key in the app's **AI Settings** panel. That key is
saved to the user's own Firestore document at `users/{uid}/aiProviderKeys/{provider}`
and is only ever used to fulfill that user's own generation requests.

## Firestore rules expectation

This app assumes user-scoped access under:

- `users/{uid}/reportTemplates/*`
- `users/{uid}/aiProviderKeys/*`

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

- Every user must supply their own OpenAI and/or Claude/Anthropic API key in the
  app's AI Settings panel before generating reports. There is no shared/server-side
  fallback key.
- Each user's key is saved in Firestore at `users/{uid}/aiProviderKeys/{provider}`
  (`provider` is `openai` or `anthropic`) after the first generation request made
  with a key entered in AI Settings. It is only ever used to fulfill that same
  user's own requests.
- The browser sends provider/model/prompt and a Firebase ID token to `/api/generate`;
  it can also send `providerApiKey` to save/update the user's key.
- Users can clear their saved key at any time with the "Clear Saved Key" button in
  AI Settings.
- Templates can store their active phrase handling selection through `selectedPhraseHandlingIds` so each template can remember which phrase rules should be applied during generation.
- Phrase handling drafts can be generated from an example phrase or rule and then saved for reuse.
- Update model options or provider list in `js/app.js` as needed.
- Set the Firebase project ID in `.firebaserc` before using default `firebase deploy` commands.
