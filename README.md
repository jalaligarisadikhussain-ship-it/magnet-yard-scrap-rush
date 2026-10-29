# MAGNET YARD: SCRAP RUSH

Original 3D browser arcade game built with Three.js, TypeScript, and Vite.

Pilot a magnetic drone, collect orbiting scrap, bank cargo for coins, avoid crushers, complete contracts, and buy permanent upgrades during 90-second shifts.

## Run and build

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
npm run build
npm run build:portal
```

- Standalone output: `dist/`
- CrazyGames output: `dist-portal/` (explicit SDK v3 loader)
- Render build: `npm ci && npm run build`, publish `dist`
- Desktop: WASD/arrows or click to move; Space for Surge.
- Mobile: touch joystick and on-screen controls, portrait or landscape.
- Pause, mute, graphics presets, and upgrades are available in game.

## Saves

Existing localStorage key `magnet-yard-scrap-rush-save-v1` and save schema are preserved. Saves belong to each browser origin: localhost, Render, and CrazyGames have separate storage. Publishing cannot automatically move a localhost save to another origin.

## Validation

`npm run test:e2e` uses installed Chrome on Windows or Playwright Chromium elsewhere. Override with CHROME_PATH. GAME_URL selects a public site for the primary E2E suite. Additional regression scripts are in `scripts/`.

Mock SDK tests are separate from real SDK and CrazyGames platform preview testing. Browser mobile emulation is not real Android hardware certification. See RELEASE_STATUS.md for verified results and remaining checks.

## Rights and dependencies

Original game source and artwork remain all rights reserved by the project owner. Public repository visibility does not grant an open-source license. Three.js is MIT licensed; its notice is included in `public/third-party-notices.txt`. See ASSET_LICENSES.md for the asset register.
