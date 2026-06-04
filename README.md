# Kebab Roulette

A phone-friendly kebab-shop themed roulette PWA for a stag day. It has five chips, local PNG chip art, configurable power-number lists, adjustable hit chance, weighted spins, and winner/loser result screens.

## Run Locally

```powershell
python -m http.server 4173
```

Open `http://localhost:4173`.

## Use On Android

Host the folder on any static host such as GitHub Pages or Netlify. Open the hosted URL on Android Chrome, then use **Add to Home screen**.

The app stores the groom name, power numbers, and target hit chance locally on the phone. Add local PNG art at `assets/chip.png`, `assets/winner.png`, and `assets/loser.png`.

## Host On GitHub Pages

1. Push this folder to a GitHub repository.
2. If you are using GitHub Free, make the repository public.
3. In GitHub, open the repository and go to **Settings** > **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then save.
6. Open the published URL on your phone in Chrome or Safari and choose **Add to Home Screen**.

GitHub Pages can take a few minutes to publish after each push.
