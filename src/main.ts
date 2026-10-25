import './style.css';
import './style/animal-faces.css';
import './style/coats.css';
import { App } from './app/app';
import { ads } from './services/ads';
import { iap } from './services/iap';
import { webHaptics } from './services/haptics';
import { webSound } from './services/sound';

const root = document.getElementById('app')!;
const app = new App(root, { ads, iap, haptics: webHaptics, sound: webSound });

// Save the board whenever the app may be about to disappear.
window.addEventListener('pagehide', () => app.persistNow());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.persistNow();
});

app.ctx.nav.home();
