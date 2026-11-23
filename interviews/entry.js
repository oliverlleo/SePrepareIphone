import {createInterviewUI} from './interview-ui.js';
import {sharedMicrophone} from '../recordings/shared-microphone.js';

window.SePrepareInterviews = host => {
  let previousAudioType;
  return createInterviewUI({
    ...host,
    unlockAudio(recording) {
      const session = navigator.audioSession;
      if (recording && session && previousAudioType === undefined) {
        previousAudioType = ['playback','play-and-record'].includes(session.type) ? 'auto' : session.type;
      }
      host.player()?.unlock?.({forRecording:recording});
    },
    releaseRecordingAudio() {
      const session = navigator.audioSession;
      try {
        if (previousAudioType !== undefined && session?.type === 'play-and-record' && !sharedMicrophone.activeLeases()) {
          session.type = previousAudioType;
        }
      } catch { /* WebKit owns the final audio-session state. */ }
      previousAudioType = undefined;
    },
  });
};
