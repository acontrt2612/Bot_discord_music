import { handleMusicComponent } from '../music/controls.js';
import music from './music.js';

// Register new command groups here.
export const commands = [...music];

// Button/select menu handlers, keyed by the customId prefix before ":".
export const componentHandlers = {
  music: handleMusicComponent,
};
