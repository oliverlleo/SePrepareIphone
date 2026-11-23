import {recordingHash, recordingSnapshotHash} from '../recordings/recording-core.js';
import {createBrowserRecordingCapture, createNativeRecordingCapture} from '../recordings/recording-capture.js';
import {sharedMicrophone} from '../recordings/shared-microphone.js';
import {interviewId} from './interview-data.js';

export function createInterviewRecorder({store, nativeBridge, onInterruption}) {
  const owner = interviewId('rec');
  let capture, record, leaseTimer, startMs, pendingFinish;

  async function start(session, signal) {
    if (capture) return;
    // Safari must receive the permission request in the originating tap.
    const permission = (nativeBridge ? nativeBridge.permission() : sharedMicrophone.getUserMedia({audio:{channelCount:{ideal:1},echoCancellation:true,noiseSuppression:true},video:false})).then(stream => {
      if (signal?.aborted) stream?.getTracks().forEach(track => track.stop());
      return stream;
    });
    const cancelled = () => {throw new Error('recording-cancelled');};
    let abort;
    const abortPromise = new Promise((_, reject) => {
      abort = () => reject(new Error('recording-cancelled'));
      signal?.addEventListener('abort', abort, {once:true});
    });
    const id = interviewId('rec');
    let created = false, leased = false, stream;
    try {
      // A pending prompt must not monopolize the shared recording lease.
      stream = await Promise.race([permission, abortPromise]);
      if (signal?.aborted) cancelled();
      leased = await store.lease(owner);
      if (!leased) throw new Error('recording-busy');
      const snapshot = {
        schema:1, type:'interview', speechId:session.interviewId, versionId:session.versionId, title:session.title, versionName:session.versionName,
        questions:session.questions.map(q => ({id:q.id, prompt:q.prompt})),
      };
      record = {id, schema:1, type:'interview', speechId:session.interviewId, versionId:session.versionId, title:session.title, versionName:session.versionName,
        snapshotId:await recordingSnapshotHash(snapshot), createdAt:Date.now(), durationMs:0, bytes:0, status:'recording', mime:'audio/mp4',
        storage:nativeBridge ? 'native' : 'browser', localAvailable:false, initiallyPaused:true};
      await store.create(record, snapshot);
      created = true;
      if (signal?.aborted) cancelled();
      capture = nativeBridge ? createNativeRecordingCapture(nativeBridge) : createBrowserRecordingCapture({store, onInterruption});
      await capture.start(record, stream ? Promise.resolve(stream) : undefined);
      if (signal?.aborted) cancelled();
      leaseTimer = setInterval(() => store.lease(owner).then(ok => {if (!ok) onInterruption();}).catch(onInterruption), 5000);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (capture) await capture.finish().catch(() => {});
      if (created) await store.patch(id, {status:'failed'}).catch(() => {});
      if (leased) await store.lease(owner, true).catch(() => {});
      record = capture = null;
      throw error;
    } finally {signal?.removeEventListener('abort', abort);}
  }

  async function resume() {
    if (!capture || startMs !== undefined) return;
    const result = await capture.resume();
    if (!Number.isFinite(result?.positionMs) || result.positionMs < 0) throw new Error('recording-unavailable');
    startMs = result.positionMs;
  }

  async function pause() {
    if (!capture || startMs === undefined) return null;
    const from = startMs;
    const result = await capture.pause();
    if (!Number.isFinite(result?.positionMs) || result.positionMs < 0) return null;
    startMs = undefined;
    return result?.positionMs > from ? {recordingId:record.id, startMs:from, endMs:result.positionMs} : null;
  }

  function finish() {
    if (pendingFinish) return pendingFinish;
    if (!capture) return Promise.resolve(null);
    const current = record, engine = capture;
    const interruptedStart = startMs;
    capture = record = null;
    startMs = undefined;
    clearInterval(leaseTimer);
    pendingFinish = (async () => {
      try {
        const info = await engine.finish();
        const blob = nativeBridge ? null : await store.blob(current.id);
        const bytes = nativeBridge ? info?.bytes : blob?.size;
        if (!bytes || !info.durationMs || (nativeBridge && !info.localAvailable)) {
          await store.patch(current.id, {status:'failed', localAvailable:false});
          return null;
        }
        const meta = await store.getRecord(current.id);
        const ready = await store.patch(current.id, {status:'ready', mime:nativeBridge ? info.mime : meta.mime, bytes, localAvailable:true,
          sha256:nativeBridge ? info.sha256 : await recordingHash(blob), durationMs:info.durationMs, updatedAt:Date.now(), interrupted:!!(info.error || info.interrupted)});
        return {ready, segment:info.durationMs > interruptedStart ? {recordingId:current.id, startMs:interruptedStart, endMs:info.durationMs} : null};
      } finally {
        await store.lease(owner, true).catch(() => {});
        pendingFinish = null;
      }
    })();
    return pendingFinish;
  }

  return {start, pause, resume, finish, isOpen:() => !!capture, isRecording:() => startMs !== undefined, id:() => record?.id};
}
