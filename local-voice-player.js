(function(global) {
  'use strict';

  function create() {
    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext || !global.Worker || !global.WebAssembly || !global.DecompressionStream) return null;

    let worker, context, active, idleTimer, nextId = 0;
    const workerUrl = new URL('voice/local-v0.2.1/synthesize.mjs', document.baseURI);

    function stop() {
      const job = active;
      if (!job) return;
      active = null;
      clearTimeout(job.timeout);
      clearInterval(job.clock);
      if (job.source) {
        job.source.onended = null;
        try { job.source.stop(); } catch {}
        job.source.disconnect();
      }
      if (job.restoreSession) job.restoreSession();
      idleTimer = setTimeout(() => {
        if (!active && context?.state === 'running') context.suspend().catch(() => {});
      }, 1000);
    }

    function fail(job) {
      if (active !== job) return;
      stop();
      if (context && context.state !== 'running') {
        context.close().catch(() => {});
        context = null;
      }
      job.utterance.onerror({error:'synthesis-failed'});
    }

    function prepareMediaSession(job) {
      const session = global.navigator?.audioSession;
      const capture = global[Symbol.for('SePrepare.sharedMicrophone')];
      if (!session || capture?.activeLeases() || session.type === 'play-and-record') return;
      try {
        const previous = session.type;
        if (previous === 'playback') return;
        session.type = 'playback';
        job.restoreSession = () => {
          try { if (session.type === 'playback') session.type = previous; } catch {}
        };
      } catch {}
    }

    async function output(job, data) {
      if (data.error) { fail(job); return; }
      try {
        await job.activation;
        if (job !== active) return;
        const buffer = context.createBuffer(1,data.pcm.length,data.sampleRate);
        buffer.copyToChannel(data.pcm,0);
        const source = job.source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const startAt = context.currentTime;
        let started = false;
        let word = 0;
        source.onended = () => {
          if (active !== job) return;
          stop();
          job.utterance.onend();
        };
        source.start();
        job.clock = setInterval(() => {
          if (active !== job || context.state !== 'running') return;
          const elapsed = context.currentTime - startAt;
          if (elapsed <= 0) return;
          if (!started) {
            started = true;
            clearTimeout(job.timeout);
            job.utterance.onstart();
          }
          while (word < data.words.length && data.words[word].at <= elapsed) {
            job.utterance.onboundary({charIndex:data.words[word++].index});
          }
        }, 50);
      } catch { fail(job); }
    }

    function play(utterance) {
      stop();
      clearTimeout(idleTimer);
      const job = active = {id:++nextId,utterance};
      try {
        prepareMediaSession(job);
        if (!context || context.state === 'closed') context = new AudioContext();
        // Resume synchronously during the first tap. The Worker can then
        // prepare PCM while WebKit activates the media output.
        job.activation = context.resume();
        job.activation.catch(() => fail(job));
        if (!worker) {
          worker = new global.Worker(workerUrl,{type:'module'});
          worker.onmessage = ({data}) => {
            if (active?.id === data.id) void output(active,data);
          };
          worker.onerror = () => {
            worker.terminate();
            worker = null;
            if (active) fail(active);
          };
        }
        job.timeout = setTimeout(() => fail(job),12000);
        worker.postMessage({id:job.id,text:utterance.text,language:utterance.lang,rate:utterance.rate});
      } catch { fail(job); }
    }

    return {play,stop};
  }

  global.SePrepareLocalVoice = {create};
})(window);
