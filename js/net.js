// Online rooms. Nothing touches the network until a room is made or joined.
import { createOnline } from './online.js?v=a3d0418b';

window.CatanNet = createOnline({ game: window.CatanGame.game, gameId: 'catan', botDelayMs: 700 });
window.dispatchEvent(new Event('catannet'));
