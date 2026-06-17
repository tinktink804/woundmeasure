# Publish WoundMeasure For Android Install

The app is ready to publish as a static HTTPS site.

## Automatic route

Double-click:

```text
PUBLISH-GITHUB-PAGES.bat
```

It will ask for a GitHub token, then create or update the public `woundmeasure` repository and turn on GitHub Pages.

Create a GitHub classic token here:

```text
https://github.com/settings/tokens/new
```

For the classic token, select `public_repo`. The token is only passed to the local publisher process and is not saved in this folder.

## Best simple route: GitHub Pages

1. Go to GitHub and create a new public repository named `woundmeasure`.
2. Upload these files from this folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `manifest.webmanifest`
   - `service-worker.js`
   - `.nojekyll`
   - the full `icons` folder
3. In the repository, open **Settings > Pages**.
4. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Save.
6. Wait a minute, then open:

```text
https://tinktink804.github.io/woundmeasure/
```

## Install on Android

1. Open the HTTPS link in Chrome on Android.
2. Tap the three-dot menu.
3. Tap **Add to Home screen** or **Install app**.
4. The WoundMeasure icon will appear on your phone.

Keep the first version for demo/documentation use only. Do not enter real patient information into a public demo unless privacy and HIPAA-ready storage are added.
