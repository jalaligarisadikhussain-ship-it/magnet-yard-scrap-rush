/**
 * CrazyGames SDK v3 integration with a safe standalone fallback.
 *
 * The SDK URL is loaded ONLY inside CrazyGames hostnames. Local/browser builds
 * never contact the SDK origin. In Vite development, ?cg-sdk-test=1 allows a
 * Playwright-intercepted offline mock script to exercise the loading path.
 *
 * The live SDK and current platform requirements still need verification in
 * the actual CrazyGames submission/preview environment.
 */
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

interface CrazyGameLifecycle {
  gameplayStart?: () => void;
  gameplayStop?: () => void;
}
interface CrazySdk {
  init: () => Promise<void>;
  game?: CrazyGameLifecycle;
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk };
  }
}

function shouldLoadSdk(): boolean {
  const officialHost = /(^|\.)crazygames\.com$/i.test(window.location.hostname);
  // External HTTPS hosts embedded by CrazyGames retain its origin as the referrer
  // when permitted by the hosting platform's referrer policy.
  let embedHost = '';
  try { embedHost = new URL(document.referrer).hostname; } catch { /* No referrer in standalone mode. */ }
  const crazyGamesEmbed = /(^|\.)crazygames\.com$/i.test(embedHost);
  const mockTest = import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('cg-sdk-test') === '1';
  return officialHost || crazyGamesEmbed || mockTest;
}

function loadCrazyGamesScript(): Promise<void> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.dataset.magnetYardSdk = 'v3';
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      console.warn('CrazyGames SDK load timed out; standalone mode is available.');
      done();
    }, 8000);
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => {
      console.warn('CrazyGames SDK script failed to load; standalone mode is available.');
      done();
    }, { once: true });
    document.head.appendChild(script);
  });
}

export class GamePlatform {
  private sdk: CrazySdk | null = null;
  private initialized: Promise<void> | null = null;
  private ready = false;
  private started = false;
  private playing = false;

  initialize(): Promise<void> {
    this.initialized ??= this.initializeInternal();
    return this.initialized;
  }

  private async initializeInternal(): Promise<void> {
    if (!window.CrazyGames?.SDK && shouldLoadSdk()) {
      await loadCrazyGamesScript();
    }

    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await sdk.init();
      this.sdk = sdk;
      this.ready = true;
      if (this.playing) this.startSignal();
    } catch (error) {
      console.warn('CrazyGames SDK init unavailable; standalone mode remains active.', error);
    }
  }

  private startSignal(): void {
    if (!this.ready || this.started) return;
    try {
      if (this.sdk?.game?.gameplayStart) {
        this.sdk.game.gameplayStart();
        this.started = true;
      }
    } catch (error) {
      console.warn('CrazyGames gameplayStart failed', error);
    }
  }

  play(): void {
    this.playing = true;
    this.startSignal();
  }

  stop(): void {
    this.playing = false;
    if (!this.ready || !this.started) return;
    try { this.sdk?.game?.gameplayStop?.(); }
    catch (error) { console.warn('CrazyGames gameplayStop failed', error); }
    finally { this.started = false; }
  }
}
