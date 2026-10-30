import css from './interactive-rehearsal.css';
import {
  SILENCE_OPTIONS,
  canOfferInteractiveRehearsal,
  buildRehearsalPlan
} from './interactive-rehearsal-core.js';
import {
  loadRehearsalPreferences,
  saveRehearsalPreferences,
  createRehearsalAudio
} from './interactive-rehearsal-audio.js';
import { createRehearsalVad } from './interactive-rehearsal-vad.js';
import { createRehearsalController } from './interactive-rehearsal-controller.js';
import { createInteractiveRehearsalUI } from './interactive-rehearsal-ui.js';

if (typeof document !== 'undefined' && !document.getElementById('seprepare-rehearsal-style')) {
  const style = document.createElement('style');
  style.id = 'seprepare-rehearsal-style';
  style.textContent = css;
  const timingStyle = document.getElementById('seprepare-timing-style');
  if (timingStyle && timingStyle.parentNode) {
    timingStyle.parentNode.insertBefore(style, timingStyle);
  } else {
    document.head.append(style);
  }
}

window.SePrepareRehearsal = {
  SILENCE_OPTIONS,
  canOfferInteractiveRehearsal,
  buildRehearsalPlan,
  loadRehearsalPreferences,
  saveRehearsalPreferences,
  createRehearsalAudio,
  createRehearsalVad,
  createRehearsalController,
  createInteractiveRehearsalUI
};
