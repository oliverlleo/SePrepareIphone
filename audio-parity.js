/* SePrepare: leitura por voz compartilhada entre PWA de iPhone e web/Windows. */
(function(global) {
  'use strict';
  if (global.SePrepareAudio) return;
  const langs = {'pt-BR':'pt-BR',pt:'pt-BR',en:'en-US',es:'es-ES',ja:'ja-JP'};
  const translations = {
    'pt': ['Automática (idioma do aplicativo)','Voz de leitura','Velocidade','Texto para testar a voz','Use a frase de exemplo ou escreva um texto. O teste não altera seus discursos.','Testar voz','Parar teste','Nenhuma voz disponível para este idioma. Instale uma voz nas configurações do dispositivo.','As vozes disponíveis dependem do navegador e do sistema. Apenas vozes acessíveis a este navegador podem ser usadas.','Posição da leitura','Avançar ou recuar a leitura','Arraste para voltar ou avançar no texto.','Pausar áudio','Leitura','Pausar','Continuar áudio','Não há uma voz disponível para este idioma. Confira as vozes instaladas no dispositivo.','Este navegador não disponibiliza leitura em voz alta.','Esta voz é automática para o idioma selecionado.','Esta é uma frase para testar a voz do SePrepare.'],
    en: ['Automatic (app language)','Reading voice','Speed','Text to test the voice','Use the sample sentence or write your own. This test does not change your speeches.','Test voice','Stop test','No voice is available for this language. Install one in device settings.','Available voices depend on your browser and operating system. Only accessible voices can be used.','Reading position','Skip forwards or backwards','Drag to move within the text.','Pause audio','Reading','Pause','Resume audio','No voice is available for this language. Check the installed voices.','This browser does not support speech synthesis.','Automatically use a voice in the selected language.','This is a sample sentence to test the SePrepare voice.'],
    es: ['Automática (idioma de la aplicación)','Voz de lectura','Velocidad','Texto para probar la voz','Utiliza la frase de ejemplo o escribe un texto. La prueba no modifica tus discursos.','Probar voz','Detener prueba','No hay voces para este idioma. Instala una en los ajustes del dispositivo.','Las voces disponibles dependen del navegador y del sistema operativo.','Posición de lectura','Avanzar o retroceder','Arrastra para moverte por el texto.','Pausar audio','Lectura','Pausar','Reanudar audio','No hay una voz disponible para este idioma. Revisa las voces instaladas.','Este navegador no permite la lectura en voz alta.','Seleccionar automáticamente la voz del idioma elegido.','Esta es una frase de ejemplo para probar la voz de SePrepare.'],
    ja: ['自動（アプリの言語）','読み上げ音声','速度','音声を試すテキスト','例文を使うか、文章を入力してください。原稿は変更されません。','音声をテスト','テストを停止','この言語の音声がありません。端末の設定で追加してください。','利用可能な音声はブラウザーと端末によって異なります。','読み上げ位置','前後に移動','スライダーで再生位置を移動できます。','音声を一時停止','読み上げ','一時停止','音声を再開','この言語の音声がありません。端末の設定を確認してください。','このブラウザーは読み上げに対応していません。','選択した言語の音声を自動で使用します。','SePrepare の音声をテストするための例文です。']
  };
  const APPLE_NOVELTY_NAMES = new Set([
    'albert','bad news','bahh','bells','boing','bubbles','cellos','deranged',
    'good news','hysterical','jester','organ','pipe organ','superstar',
    'trinoids','whisper','wobble','zarvox','fred','junior','kathy',
    'princess','ralph','agnes','bruce','vicki'
  ]);
  const APPLE_ELOQUENCE_NAMES = new Set([
    'eddy','flo','grandma','grandpa','reed','rocko','sandy','shelley'
  ]);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalized = code => langs[String(code || 'pt-BR').split('-')[0]] || 'pt-BR';
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

  function createSilentWavUrl() {
    if (typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') return '';
    const sampleRate = 22050;
    const samples = 441;
    const dataSize = samples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeAscii = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function create(options) {
    const o=options, synth=global.speechSynthesis, audio=o.audio;
    const isIOS=/iPhone|iPad|iPod/i.test(global.navigator?.userAgent||'') || (global.navigator?.platform==='MacIntel'&&global.navigator?.maxTouchPoints>1);
    const failedVoices=new Set(),failedSystemLocales=new Set();
    const voiceKey=v=>v?(v.voiceURI||v.name+'|'+v.lang):'system-default';
    let missingVoiceHandler=options.onMissingVoice;
    let candidates=[],browserList=[],activeUtterance=null,primerUtterance=null,request=0,previewing=false,previewUtterance=null,dragged=false,startupTimer=null,chunkPauseTimer=null,activeSegment=null,externalInterrupt=null;
    let audioCtx=null,silentAudioEl=null,silentAudioUrl='',previousSessionType=null,sessionRestoreTimer=null;
    const lang=() => String(o.getSettings().language || 'pt-BR').slice(0,2).toLowerCase();
    const t=i => (translations[lang()] || translations.pt)[i];
    const locale=() => normalized(o.getSettings().language);
    const sameLanguagePrefix=(a,b)=>String(a||'').replace(/_/g,'-').split('-')[0].toLowerCase()===String(b||'').replace(/_/g,'-').split('-')[0].toLowerCase();
    const startingLabel=()=>({pt:'Iniciando teste…',en:'Starting test…',es:'Iniciando prueba…',ja:'テストを開始中…'}[lang()]||'Starting test…');
    const appleVoiceHelp={
      pt:['Como adicionar vozes','Abra Ajustes → Acessibilidade → Leitura e Fala → Vozes (ou Conteúdo Falado). Se o som não sair, confira também o botão lateral de modo silencioso e o volume.'],
      en:['How to add voices','Open Settings → Accessibility → Read & Speak → Voices (or Spoken Content). If there is no sound, also check the Silent switch and volume.'],
      es:['Cómo añadir voces','Abre Ajustes → Accesibilidad → Lectura y voz → Voces (o Contenido leído). Si no hay sonido, revisa también el interruptor de silencio y el volumen.'],
      ja:['音声の追加方法','「設定」→「アクセシビリティ」→「リーダーと読み上げ」→「声」（または「読み上げコンテンツ」）を開きます。音が出ない場合は消音スイッチと音量もご確認ください。']
    };
    const appleSilentHint={
      pt:'Sem som? Desative o Modo Silencioso do iPhone e aumente o volume.',
      en:'No sound? Turn off Silent Mode on iPhone and turn up the volume.',
      es:'¿Sin sonido? Desactiva el modo Silencio del iPhone y sube el volumen.',
      ja:'音が出ないときは、iPhoneの消音モードをオフにして音量を上げてください。'
    };
    const autoUsingLabel={
      pt:name=>'Automática usa a voz mais natural do idioma: '+name+'.',
      en:name=>'Automatic uses the most natural voice for this language: '+name+'.',
      es:name=>'Automática usa la voz más natural del idioma: '+name+'.',
      ja:name=>'自動はこの言語で最も自然な音声を使用します：'+name+'。'
    };
    const manualVoiceHint={
      pt:'Voz escolhida manualmente. Selecione Automática para voltar à melhor voz do idioma.',
      en:'Manually selected voice. Choose Automatic to return to the best voice for this language.',
      es:'Voz elegida manualmente. Selecciona Automática para volver a la mejor voz del idioma.',
      ja:'手動で選択した音声です。「自動」を選ぶと言語に最適な音声に戻ります。'
    };
    const appleQualityHint={
      pt:['Para uma voz mais natural, baixe uma voz Aprimorada ou Premium (ex.: Luciana ou Felipe) em Ajustes → Acessibilidade → Leitura e Fala → Vozes.','Você escolheu uma voz compacta. A opção Automática usa a voz mais natural instalada neste idioma.'],
      en:['For a more natural voice, download an Enhanced or Premium voice in Settings → Accessibility → Read & Speak → Voices.','You selected a compact voice. Automatic uses the most natural voice installed for this language.'],
      es:['Para una voz más natural, descarga una voz Mejorada o Premium en Ajustes → Accesibilidad → Lectura y voz → Voces.','Elegiste una voz compacta. Automática usa la voz más natural instalada en este idioma.'],
      ja:['より自然な声にするには、「設定」→「アクセシビリティ」→「リーダーと読み上げ」→「声」から拡張またはプレミアム音声をダウンロードしてください。','コンパクト音声が選択されています。「自動」を選ぶと、この言語で最も自然な音声を使用します。']
    };
    const normalizedName=name => String(name||'').replace(/(?:\s*\(?(?:online|offline|network)\)?|-network|-local)$/i,'').trim();
    const baseVoiceLabel=name => normalizedName(name).replace(/\s*\(.*$/g,'').trim().toLowerCase();
    const cleanVoiceBase=name => normalizedName(name)
      .replace(/\s*\(?(?:online|offline|network|compact|compacta|compacto|super-compact|enhanced|premium|aprimorada|aprimorado|melhorada|melhorado|mejorada|mejorado|natural|neural|拡張|プレミアム)\)?$/i,'')
      .trim()
      .toLocaleLowerCase();
    const dedupeKey=v => cleanVoiceBase(v.name)+'|'+String(v.lang||'').toLowerCase();
    const isNoveltyVoice=v => APPLE_NOVELTY_NAMES.has(baseVoiceLabel(v?.name));
    const isEloquenceVoice=v => {
      const uri=String(v?.voiceURI||'').toLowerCase();
      return uri.includes('eloquence') || (isIOS && APPLE_ELOQUENCE_NAMES.has(baseVoiceLabel(v?.name)));
    };
    const isSiriVoice=v => {
      const uri=String(v?.voiceURI||'').toLowerCase();
      const name=String(v?.name||'').toLowerCase();
      return uri.includes('.siri.') || uri.includes('siri_') || /\bsiri\b/.test(name);
    };
    const isReliableNatural=v => !isNoveltyVoice(v) && !isEloquenceVoice(v) && !(isIOS && isSiriVoice(v));
    function voiceQualityTier(v) {
      if(!v)return 'none';
      if(isNoveltyVoice(v))return 'novelty';
      if(isEloquenceVoice(v))return 'eloquence';
      if(isIOS && isSiriVoice(v))return 'siri-restricted';
      const uri=String(v.voiceURI||'').toLowerCase();
      const name=String(v.name||'').toLowerCase();
      if(uri.includes('.premium.') || /\bpremium\b|プレミアム/.test(name)) return 'premium';
      if(!isIOS && (uri.includes('.siri.') || /\b(siri|neural|natural)\b/.test(name))) return 'neural';
      if(uri.includes('.enhanced.') || /\b(enhanced|aprimorad[ao]|melhorad[ao]|mejorad[ao])\b|拡張/.test(name)) return 'enhanced';
      return 'compact';
    }
    const isRealisticVoice=v => ['premium','neural','enhanced'].includes(voiceQualityTier(v));
    function voiceQualityScore(v) {
      if(!v)return -1000;
      let score=v.localService!==false ? 10 : 0;
      const tier=voiceQualityTier(v);
      const uri=String(v.voiceURI||'').toLowerCase();
      if(tier==='novelty') score-=100;
      else if(tier==='eloquence') score-=50;
      else if(tier==='siri-restricted') score-=25;
      else if(tier==='premium') score+=60;
      else if(tier==='neural') score+=55;
      else if(tier==='enhanced') score+=45;
      else if(uri.includes('super-compact')) score+=10;
      else if(uri.includes('com.apple.voice.') || uri.includes('com.apple.ttsbundle.')) score+=20;
      if(v.default) score+=5;
      return score;
    }

    const hasActiveMic=() => Boolean(global[Symbol.for('SePrepare.sharedMicrophone')]?.activeLeases?.()>0);
    const isAudioActive=() => previewing || !!activeSegment || ['starting','playing'].includes(audio.state);

    // iOS Safari/PWA defaults Web Speech/Audio to Ambient (silenced by hardware mute
    // or suspended session). Promoting navigator.audioSession and priming an AudioContext
    // synchronously inside the tap gesture forces AVAudioSession playback routing.
    function acquireIOSAudioSession() {
      if(!isIOS)return;
      if(sessionRestoreTimer!==null){clearTimeout(sessionRestoreTimer);sessionRestoreTimer=null;}
      const session=global.navigator?.audioSession;
      const recordSession=hasActiveMic() || session?.type==='play-and-record';
      if(recordSession) {
        previousSessionType=null;
        return;
      }
      try {
        if(session && session.type!=='playback') {
          if(previousSessionType===null) previousSessionType=session.type;
          session.type='playback';
        }
      } catch {}
      try {
        const AudioCtx=global.AudioContext || global.webkitAudioContext;
        if(typeof AudioCtx==='function') {
          if(!audioCtx || audioCtx.state==='closed') audioCtx=new AudioCtx();
          if(audioCtx.state!=='running' && typeof audioCtx.resume==='function') {
            Promise.resolve(audioCtx.resume()).catch(()=>{});
          }
          const buffer=typeof audioCtx.createBuffer==='function' ? audioCtx.createBuffer(1,1,22050) : null;
          if(buffer && typeof audioCtx.createBufferSource==='function' && audioCtx.destination) {
            const source=audioCtx.createBufferSource();
            source.buffer=buffer;
            source.connect(audioCtx.destination);
            source.start(0);
          }
          return;
        }
      } catch {}
      try {
        if(!global.navigator?.audioSession && typeof document?.createElement==='function') {
          if(!silentAudioEl) {
            silentAudioUrl ||= createSilentWavUrl();
            if(silentAudioUrl) {
              silentAudioEl=document.createElement('audio');
              silentAudioEl.setAttribute('playsinline','');
              silentAudioEl.playsInline=true;
              silentAudioEl.preload='auto';
              silentAudioEl.src=silentAudioUrl;
            }
          }
          if(silentAudioEl && typeof silentAudioEl.play==='function') {
            Promise.resolve(silentAudioEl.play()).catch(()=>{});
          }
        }
      } catch {}
    }

    function scheduleIOSAudioSessionRelease() {
      if(!isIOS)return;
      if(sessionRestoreTimer!==null){clearTimeout(sessionRestoreTimer);sessionRestoreTimer=null;}
      sessionRestoreTimer=setTimeout(()=>{
        sessionRestoreTimer=null;
        if(isAudioActive())return;
        const session=global.navigator?.audioSession;
        const recordSession=hasActiveMic() || session?.type==='play-and-record';
        try {
          if(!recordSession && audioCtx && audioCtx.state==='running' && typeof audioCtx.suspend==='function') {
            Promise.resolve(audioCtx.suspend()).catch(()=>{});
          }
        } catch {}
        try {
          if(session && previousSessionType!==null && !hasActiveMic() && session.type==='playback') {
            session.type=previousSessionType;
          }
        } catch {}
        previousSessionType=null;
      },1000);
    }

    function unlock(opts) {
      if(!isIOS)return;
      const forRecording=Boolean(opts && opts.forRecording);
      if(forRecording) {
        if(sessionRestoreTimer!==null){clearTimeout(sessionRestoreTimer);sessionRestoreTimer=null;}
        previousSessionType=null;
        try {
          const session=global.navigator?.audioSession;
          if(session && session.type!=='play-and-record') session.type='play-and-record';
        } catch {}
        try {
          if(audioCtx && audioCtx.state==='running' && typeof audioCtx.suspend==='function') {
            Promise.resolve(audioCtx.suspend()).catch(()=>{});
          }
        } catch {}
      } else {
        acquireIOSAudioSession();
      }
      if(!synth || typeof global.SpeechSynthesisUtterance!=='function')return;
      try {
        if(synth.paused && typeof synth.resume==='function') synth.resume();
        if(synth.speaking || synth.pending)return;
        const primer=new global.SpeechSynthesisUtterance(' ');
        primer.lang=locale();
        primer.volume=0;
        primer.rate=1;
        primerUtterance=primer;
        const clear=()=>{if(primerUtterance===primer)primerUtterance=null;};
        primer.onend=clear;
        primer.onerror=clear;
        synth.speak(primer);
      } catch {
        primerUtterance=null;
      }
    }

    function voicesForLocale(preferred=locale(),list=candidates) {
      const pref=String(preferred||'pt-BR').replace(/_/g,'-').toLowerCase();
      const prefix=pref.split('-')[0];
      const sameLang=list.filter(v=>String(v.lang||'').replace(/_/g,'-').split('-')[0].toLowerCase()===prefix);
      if(!sameLang.length)return [];
      const natural=sameLang.filter(isReliableNatural);
      const nonNovelty=sameLang.filter(v=>!isNoveltyVoice(v));
      const pool=natural.length ? natural : (nonNovelty.length ? nonNovelty : sameLang);
      return [...pool].sort((a,b)=>{
        const aExact=String(a.lang||'').replace(/_/g,'-').toLowerCase()===pref ? 0 : 1;
        const bExact=String(b.lang||'').replace(/_/g,'-').toLowerCase()===pref ? 0 : 1;
        if(aExact!==bExact)return aExact-bExact;
        const scoreDiff=voiceQualityScore(b)-voiceQualityScore(a);
        if(scoreDiff!==0)return scoreDiff;
        return normalizedName(a.name).localeCompare(normalizedName(b.name));
      });
    }

    function refreshVoices() {
      try { browserList=synth ? synth.getVoices() : []; } catch { browserList=[]; }
      const map=new Map();
      browserList.forEach(v => {
        if (!v || !v.name || !v.lang) return;
        const key=dedupeKey(v);
        const previous=map.get(key);
        if (!previous || (v.localService && !previous.localService) ||
            ((Boolean(v.localService)===Boolean(previous.localService)) && voiceQualityScore(v)>voiceQualityScore(previous))) {
          map.set(key,v);
        }
      });
      const unique=[...map.values()];
      // Prefer installed local voices and do not list a network duplicate.
      candidates=unique.some(v=>v.localService) ? unique.filter(v=>v.localService!==false) : unique;
      candidates.sort((a,b)=>a.lang.localeCompare(b.lang)||voiceQualityScore(b)-voiceQualityScore(a)||normalizedName(a.name).localeCompare(normalizedName(b.name)));
      const localeVoices=voicesForLocale(locale());
      const exposed=localeVoices.length ? localeVoices : candidates.filter(isReliableNatural);
      o.setVoices(exposed.map(v=>({name:v.name,locale:v.lang,offline:v.localService!==false})));
      const select=document.getElementById('voiceName');
      if(select && !previewing) {
        const selected=select.value;
        select.innerHTML=voiceOptions(selected);
        if([...select.options].some(v=>v.value===selected)) select.value=selected;
      }
      updateVoiceHints();
      return candidates;
    }
    function exactVoice(name,voiceLocale) {
      if(!name)return null;
      const base=cleanVoiceBase(name);
      const loc=String(voiceLocale||'').toLowerCase();
      return candidates.find(v=>v.name===name && (!loc||v.lang.toLowerCase()===loc)) ||
        candidates.find(v=>normalizedName(v.name)===normalizedName(name) && (!loc||v.lang.toLowerCase()===loc)) ||
        candidates.find(v=>cleanVoiceBase(v.name)===base && (!loc||v.lang.toLowerCase()===loc)) || null;
    }
    function automaticVoice(preferred=locale()) {
      const available=candidates.filter(v=>!failedVoices.has(voiceKey(v)));
      const ranked=voicesForLocale(preferred,available);
      if(ranked.length)return ranked[0];
      const language=String(preferred||'pt-BR').split(/[-_]/)[0].toLowerCase();
      return available.find(v=>v.lang.toLowerCase()===String(preferred||'').toLowerCase()&&v.default) ||
        available.find(v=>v.lang.toLowerCase()===String(preferred||'').toLowerCase()) ||
        available.find(v=>v.lang.toLowerCase().split(/[-_]/)[0]===language&&v.default) ||
        available.find(v=>v.lang.toLowerCase().split(/[-_]/)[0]===language) || null;
    }
    function selectedVoice(form=false) {
      const settings=o.getSettings();
      const name=form ? document.getElementById('voiceName')?.value : settings.voice;
      const parsed=String(name||'').split('\u001f');
      if(parsed[0]) {
        const chosen=exactVoice(parsed[0],parsed[1] || (!form&&settings.audioLanguage) || '');
        if(chosen&&(form||(sameLanguagePrefix(chosen.lang,locale())&&!failedVoices.has(voiceKey(chosen)))))return chosen;
      }
      const voice=automaticVoice(locale());
      if(voice)return voice;
      if(isIOS&&!failedSystemLocales.has(locale().toLowerCase()))return null;
      return null;
    }
    function storedVoice() {
      const settings=o.getSettings();
      const chosen=exactVoice(settings.voice,settings.audioLanguage);
      return chosen && sameLanguagePrefix(chosen.lang,locale()) ? chosen.name+'\u001f'+chosen.lang : '';
    }
    function voiceHintsState(selectedValue) {
      const loc=locale();
      const localeVoices=voicesForLocale(loc);
      if(!localeVoices.length) return {voiceHint:t(7),qualityHint:''};
      const parts=String(selectedValue||'').split('\u001f');
      const manual=parts[0] ? exactVoice(parts[0],parts[1]||'') : null;
      const active=manual || automaticVoice(loc);
      const voiceHint=manual
        ? (manualVoiceHint[lang()]||manualVoiceHint.pt)
        : active
          ? (autoUsingLabel[lang()]||autoUsingLabel.pt)(normalizedName(active.name)+' · '+active.lang)
          : t(18);
      let qualityHint='';
      if(isIOS && active && !isRealisticVoice(active)) {
        const hasBetter=localeVoices.some(isRealisticVoice);
        const copy=appleQualityHint[lang()]||appleQualityHint.pt;
        qualityHint=hasBetter && manual ? copy[1] : copy[0];
      }
      return {voiceHint,qualityHint};
    }
    function updateVoiceHints() {
      const select=document.getElementById('voiceName');
      const selectedValue=select ? select.value : storedVoice();
      const hints=voiceHintsState(selectedValue);
      const hint=document.getElementById('audioVoiceHint');
      if(hint) hint.textContent=hints.voiceHint;
      const quality=document.getElementById('audioQualityHint');
      if(quality) {
        quality.textContent=hints.qualityHint;
        quality.hidden=!hints.qualityHint;
      }
    }
    function voiceOptions(previous) {
      const chosen=previous===undefined ? storedVoice() : previous;
      const list=voicesForLocale(locale());
      const display=[...list];
      if(chosen) {
        const parts=String(chosen).split('\u001f');
        const saved=exactVoice(parts[0],parts[1]||'');
        if(saved && !display.some(v=>v.name===saved.name&&v.lang===saved.lang)) display.push(saved);
      }
      let html='<option value="">'+escape(t(0))+'</option>';
      for(const v of display) {
        const value=v.name+'\u001f'+v.lang;
        html+='<option value="'+escape(value)+'"'+(value===chosen?' selected':'')+'>'+escape(normalizedName(v.name)+' · '+v.lang)+'</option>';
      }
      return html;
    }
    function settingsHTML() {
      refreshVoices();
      const s=o.getSettings();
      const hints=voiceHintsState(storedVoice());
      return '<p class="help">'+escape(t(8))+'</p><div class="stack">'+
        '<div class="field"><label for="voiceName">'+escape(t(1))+'</label><select id="voiceName">'+voiceOptions()+'</select>'+
        '<small id="audioVoiceHint">'+escape(hints.voiceHint)+'</small>'+
        (isIOS ? '<p id="audioQualityHint" class="help audio-quality-hint"'+(hints.qualityHint?'':' hidden')+'>'+escape(hints.qualityHint)+'</p>' : '')+
        '</div>'+
        '<div class="field"><div class="range-line"><label for="voiceRate">'+escape(t(2))+'</label><output id="voiceRateValue">'+Number(s.rate||1).toFixed(1)+'×</output></div>'+
        '<input type="range" id="voiceRate" min=".5" max="1.8" step=".1" value="'+escape(s.rate||1)+'"></div>'+
        '<div class="field audio-preview-field"><label for="voicePreviewText">'+escape(t(3))+'</label>'+
        '<textarea id="voicePreviewText" rows="3" maxlength="2000">'+escape(t(19))+'</textarea><small>'+escape(t(4))+'</small></div>'+
        '<button type="button" class="btn soft" data-action="test-voice"><span id="audioTestLabel" aria-live="polite">'+escape(t(5))+'</span></button>'+
        (isIOS ? '<p class="help audio-silent-hint">'+escape(appleSilentHint[lang()]||appleSilentHint.pt)+'</p>' : '')+
        '</div>';
    }
    function bindSettings() {
      const test=document.querySelector('[data-action="test-voice"]');
      const install=document.querySelector('[data-action="install-voices"]');
      if(test&&install&&!test.closest('.audio-settings-actions')) {
        const actions=document.createElement('div');actions.className='audio-settings-actions';
        test.before(actions);actions.append(test,install);
        if(isIOS) {
          const copy=appleVoiceHelp[lang()]||appleVoiceHelp.pt;
          install.innerHTML=o.icon('Info')+'<span>'+escape(copy[0])+'</span>';
          const help=document.createElement('p');help.id='audioAppleVoiceHelp';help.className='help audio-voice-help';help.hidden=true;help.textContent=copy[1];
          actions.append(help);install.setAttribute('aria-controls',help.id);install.setAttribute('aria-expanded','false');
          install.addEventListener('click',event=>{
            event.preventDefault();event.stopPropagation();help.hidden=!help.hidden;
            install.setAttribute('aria-expanded',String(!help.hidden));
          });
        }
      }
      const select=document.getElementById('voiceName');
      if(select && !select.dataset.spQualityBound) {
        select.dataset.spQualityBound='1';
        select.addEventListener('change',updateVoiceHints);
      }
      const rate=document.getElementById('voiceRate');
      if(rate) rate.addEventListener('input',()=>{const v=document.getElementById('voiceRateValue');if(v)v.textContent=Number(rate.value).toFixed(1)+'×';});
    }
    function saveSettings() {
      const s=o.getSettings(), selector=document.getElementById('voiceName'), selected=String(selector?.value||'').split('\u001f');
      s.voice=selected[0] || '';s.audioLanguage=selected[1] || '';
      s.rate=clamp(Number(document.getElementById('voiceRate')?.value||s.rate||1),.5,1.8);
      return s;
    }
    function cleanSpokenLine(rawLine) {
      const text=String(rawLine||'')
        .replace(/[<>]/g,' ')
        .replace(/^[ \t]*(?:[•▪◦‣●○■□▸►★☆]+|[-–—](?=\s))\s*/u,'')
        .replace(/\.{3,}/g,'...')
        .replace(/\s+[—–-]\s+/g,', ')
        .replace(/[ \t]{2,}/g,' ')
        .trim();
      return text && /[\p{L}\p{N}]/u.test(text) ? text : '';
    }
    function formatSpokenChunk(rawChunk, addTerminalPause=false) {
      const rawLines=String(rawChunk||'').split(/\r?\n/);
      const parts=[];
      let sawBlank=false;
      for(const rawLine of rawLines) {
        if(!rawLine.trim()) {
          if(parts.length) sawBlank=true;
          continue;
        }
        const line=cleanSpokenLine(rawLine);
        if(!line) {
          if(parts.length) sawBlank=true;
          continue;
        }
        parts.push({line,blankBefore:parts.length ? sawBlank : false});
        sawBlank=false;
      }
      if(!parts.length) return '';
      let out='';
      for(let i=0;i<parts.length;i++) {
        let line=parts[i].line;
        const hasNext=i<parts.length-1;
        if((hasNext || addTerminalPause) && !/[.!?:;。！？…]$/.test(line)) line+='.';
        if(i>0) out+=parts[i].blankBefore ? '\n\n' : '\n';
        out+=line;
      }
      return out;
    }
    function scalePause(baseMs, rate) {
      return Math.round(clamp(baseMs/Math.max(0.7,Number(rate)||1),Math.round(baseMs*0.6),Math.round(baseMs*1.35)));
    }
    function lastRegexEnd(str, minIdx, maxIdx, re) {
      let best=0, match;
      re.lastIndex=0;
      while((match=re.exec(str))) {
        const end=match.index+match[0].length;
        if(end>=minIdx && end<=maxIdx) best=end;
        if(end>maxIdx) break;
      }
      return best;
    }
    function lastMatchStart(str, minIdx, maxIdx, re) {
      let best=0, match;
      re.lastIndex=0;
      while((match=re.exec(str))) {
        if(match.index>=minIdx && match.index<=maxIdx) best=match.index;
        if(match.index>maxIdx) break;
      }
      return best;
    }
    function firstRegexEnd(str, minIdx, maxIdx, re) {
      let match;
      re.lastIndex=0;
      while((match=re.exec(str))) {
        const end=match.index+match[0].length;
        if(end>minIdx && end<=maxIdx) return end;
        if(end>maxIdx) break;
      }
      return 0;
    }
    function planSpeechChunk(fullText, startAt, rate) {
      const TARGET_CHUNK=220, MAX_SENTENCE_CHUNK=250, CLAUSE_MAX=220, MIN_BREAK=40;
      const SENTENCE_RE=/[.!?…]["'”’)\]]*(?=\s|$)|[。！？…]["'”’」』）\]]*/g;
      const CLAUSE_RE=/[;,:—–]["'”’)\]]*(?=\s|$)|\)(?=\s|$)|[、；：]/g;
      let cursor=startAt, pendingBreak='end';
      while(cursor<fullText.length) {
        while(cursor<fullText.length && /\s/.test(fullText[cursor])) cursor++;
        if(cursor>=fullText.length) return null;
        const remainingLen=fullText.length-cursor;
        const targetSlice=fullText.slice(cursor,Math.min(fullText.length,cursor+TARGET_CHUNK+1));
        const desktopParaBreak=!isIOS ? /\n[ \t]*\n/.exec(targetSlice) : null;
        let end=fullText.length, boundaryKind='end';
        if(desktopParaBreak && desktopParaBreak.index>0) {
          end=cursor+desktopParaBreak.index;
          boundaryKind='paragraph';
        } else if(remainingLen>TARGET_CHUNK) {
          const slice=fullText.slice(cursor,Math.min(fullText.length,cursor+MAX_SENTENCE_CHUNK));
          const paraBreak=lastMatchStart(slice,MIN_BREAK,TARGET_CHUNK,/\n[ \t]*\n/g);
          const lineBreak=slice.lastIndexOf('\n',TARGET_CHUNK);
          if(paraBreak) {
            end=cursor+paraBreak;
            boundaryKind='paragraph';
          } else if(lineBreak>=MIN_BREAK) {
            end=cursor+lineBreak;
            boundaryKind='line';
          } else {
            const nearEnd=lastRegexEnd(slice,MIN_BREAK,TARGET_CHUNK,SENTENCE_RE);
            const wholeEnd=nearEnd || firstRegexEnd(slice,TARGET_CHUNK,MAX_SENTENCE_CHUNK,SENTENCE_RE);
            if(wholeEnd) {
              end=cursor+wholeEnd;
              boundaryKind='sentence';
            } else {
              const clauseEnd=lastRegexEnd(slice,80,CLAUSE_MAX,CLAUSE_RE);
              if(clauseEnd) {
                end=cursor+clauseEnd;
                boundaryKind='clause';
              } else {
                const wordsEnd=slice.slice(0,CLAUSE_MAX).lastIndexOf(' ');
                end=cursor+(wordsEnd>=100 ? wordsEnd+1 : CLAUSE_MAX);
                boundaryKind='clause';
              }
            }
          }
        }
        const raw=fullText.slice(cursor,end);
        let nextAt=end;
        while(nextAt<fullText.length && /\s/.test(fullText[nextAt])) nextAt++;
        const gap=fullText.slice(end,nextAt);
        if(nextAt>=fullText.length) boundaryKind='end';
        else if(/\n[ \t]*\n/.test(gap)) boundaryKind='paragraph';
        else if(gap.includes('\n')) boundaryKind='line';
        const addTerminalPause=(boundaryKind==='paragraph' || boundaryKind==='line') && nextAt<fullText.length;
        const spoken=formatSpokenChunk(raw,addTerminalPause);
        if(!spoken) {
          if(boundaryKind==='paragraph' || pendingBreak!=='paragraph') pendingBreak=boundaryKind;
          cursor=nextAt;
          continue;
        }
        const effectiveBreak=boundaryKind==='end'
          ? 'end'
          : (boundaryKind==='paragraph' || pendingBreak==='paragraph')
            ? 'paragraph'
            : boundaryKind;
        const pauseMap={
          end:0,
          paragraph:scalePause(380,rate),
          line:scalePause(240,rate),
          sentence:scalePause(140,rate),
          clause:scalePause(50,rate)
        };
        return {start:cursor,raw,spoken,nextAt,pauseMs:isIOS?0:(pauseMap[effectiveBreak]||0)};
      }
      return null;
    }
    function stopActiveSegment(notifyInterrupt=false) {
      const seg=activeSegment;
      if(!seg)return;
      activeSegment=null;
      seg.utterance=null;
      activeUtterance=null;
      clearTimeout(seg.startupTimer);
      clearTimeout(seg.pauseTimer);
      request++;
      cancelActiveSpeech();
      scheduleIOSAudioSessionRelease();
      if(notifyInterrupt && typeof externalInterrupt==='function') externalInterrupt('audio-player');
    }
    function setExternalInterruptHandler(fn) {
      externalInterrupt=typeof fn==='function' ? fn : null;
    }
    function getAvailableVoices(preferredLocale) {
      refreshVoices();
      const loc=preferredLocale || locale();
      const available=candidates.filter(v=>!failedVoices.has(voiceKey(v)));
      const matchingVoices=voicesForLocale(loc,available);
      const naturalAll=available.filter(isReliableNatural);
      const nonNoveltyAll=available.filter(v=>!isNoveltyVoice(v));
      const cleanAll=naturalAll.length ? naturalAll : (nonNoveltyAll.length ? nonNoveltyAll : available);
      const mapVoice=v=>({
        name:v.name,
        locale:v.lang,
        offline:v.localService!==false,
        default:!!v.default,
        label:normalizedName(v.name)+' · '+v.lang
      });
      const all=cleanAll.map(mapVoice);
      const voices=matchingVoices.length ? matchingVoices.map(mapVoice) : all;
      return {status:synth?'ready':'unavailable',locale:loc,voices,allVoices:all};
    }
    function speakSegment(spec={}) {
      const {text='',offset=0,voice='',locale:preferredLocale='',rate=1,onStart,onBoundary,onEnd,onPaused,onError}=spec;
      if(previewing) stopPreview();
      if(audio.state==='playing'||audio.state==='starting') {
        request++;cancelActiveSpeech();
        activeUtterance=null;audio.state='paused';update();dispatch();
      }
      stopActiveSegment(false);
      if(!synth||typeof global.SpeechSynthesisUtterance!=='function') {
        if(typeof onError==='function') onError({code:'synthesis-unavailable',message:t(17)});
        return null;
      }
      refreshVoices();
      const loc=preferredLocale || locale();
      let chosen=null;
      if(voice) {
        const candidate=exactVoice(voice,preferredLocale) || exactVoice(voice,'');
        if(candidate && !failedVoices.has(voiceKey(candidate))) chosen=candidate;
      }
      if(!chosen) {
        chosen=automaticVoice(loc);
      }
      if(!chosen && !isIOS && candidates.length>0) {
        if(typeof onError==='function') onError({code:'language-unavailable',message:t(16)});
        return null;
      }
      request++;
      const id=request, reqId='rehearsal-'+id;
      const cancelledOnStart=cancelActiveSpeech();
      acquireIOSAudioSession();
      const fullText=String(text||'');
      const startAt=clamp(Number(offset)||0,0,fullText.length);
      const cleanRate=clamp(Number(rate)||Number(o.getSettings().rate)||1,.5,1.8);
      const seg={requestId:reqId,id,started:false,startupTimer:0,pauseTimer:0,utterance:null};
      const attempted=new Set();
      let fallbackCount=0,currentVoice=chosen,chunkIndex=0;
      const sameLanguage=v=>v && v.lang && v.lang.split(/[-_]/)[0].toLowerCase()===loc.split(/[-_]/)[0].toLowerCase();
      activeSegment=seg;
      function fallbackSegmentVoice() {
        if(fallbackCount>=2)return false;
        attempted.add(voiceKey(currentVoice));
        refreshVoices();
        const alternatives=candidates.filter(v=>sameLanguage(v)&&!failedVoices.has(voiceKey(v))&&!attempted.has(voiceKey(v)))
          .sort((a,b)=>voiceQualityScore(b)-voiceQualityScore(a));
        const alternate=alternatives[0]||(!attempted.has('system-default')?null:undefined);
        if(alternate===undefined)return false;
        currentVoice=alternate;
        fallbackCount++;
        return true;
      }
      function failSegment(code,at) {
        if(activeSegment!==seg || id!==request) return;
        clearTimeout(seg.startupTimer);
        clearTimeout(seg.pauseTimer);
        seg.pauseTimer=0;
        const retryable=['voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed','network','startup-timeout'].includes(code);
        if(isIOS && retryable) {
          if(!seg.started) {
            if(currentVoice) failedVoices.add(voiceKey(currentVoice));
            else failedSystemLocales.add(loc.toLowerCase());
          }
        } else if(retryable && fallbackSegmentVoice()) {
          seg.utterance=null;activeUtterance=null;
          cancelActiveSpeech();
          nextChunk(at);
          return;
        }
        activeSegment=null;seg.utterance=null;activeUtterance=null;
        scheduleIOSAudioSessionRelease();
        if(typeof onError==='function') onError({code:code||'synthesis-failed',message:speechErrorMessage(code||'synthesis-failed')});
      }
      function nextChunk(at,{retried=false}={}) {
        if(activeSegment!==seg || id!==request) return;
        clearTimeout(seg.pauseTimer);
        seg.pauseTimer=0;
        const plan=planSpeechChunk(fullText,at,cleanRate);
        if(!plan) {
          clearTimeout(seg.startupTimer);
          activeSegment=null;seg.utterance=null;activeUtterance=null;
          scheduleIOSAudioSessionRelease();
          if(typeof onEnd==='function') onEnd();
          return;
        }
        const utterance=new global.SpeechSynthesisUtterance(plan.spoken);
        utterance.lang=currentVoice?.lang || loc;
        if(currentVoice) utterance.voice=currentVoice;
        utterance.rate=cleanRate;
        utterance.volume=1;
        utterance.pitch=1;
        seg.utterance=utterance;
        activeUtterance=utterance;
        let chunkStarted=false;
        const armStallWatchdog=()=>{
          clearTimeout(seg.startupTimer);
          seg.startupTimer=setTimeout(()=>{
            if(activeSegment!==seg || id!==request) return;
            cancelActiveSpeech();
            failSegment('startup-timeout',plan.start);
          },10000+Math.ceil(plan.spoken.length*180/cleanRate));
        };
        clearTimeout(seg.startupTimer);
        utterance.onstart=()=>{
          if(activeSegment!==seg || id!==request) return;
          chunkStarted=true;
          if(!seg.started){seg.started=true;if(typeof onStart==='function')onStart();}
          armStallWatchdog();
        };
        utterance.onboundary=ev=>{
          if(activeSegment!==seg || id!==request) return;
          chunkStarted=true;
          if(!seg.started){seg.started=true;if(typeof onStart==='function')onStart();}
          armStallWatchdog();
          const ratio=plan.spoken.length ? clamp((Number(ev.charIndex)||0)/plan.spoken.length,0,1) : 0;
          const pos=clamp(plan.start+Math.round(ratio*plan.raw.length),0,fullText.length);
          if(typeof onBoundary==='function') onBoundary({offset:pos,end:pos});
        };
        utterance.onend=()=>{
          if(activeSegment!==seg || id!==request) return;
          clearTimeout(seg.startupTimer);
          if(!seg.started){seg.started=true;if(typeof onStart==='function')onStart();}
          chunkIndex+=1;
          if(plan.nextAt<fullText.length) seg.pauseTimer=setTimeout(()=>nextChunk(plan.nextAt),plan.pauseMs);
          else {activeSegment=null;seg.utterance=null;activeUtterance=null;scheduleIOSAudioSessionRelease();if(typeof onEnd==='function')onEnd();}
        };
        utterance.onerror=ev=>{
          if(activeSegment!==seg || id!==request) return;
          clearTimeout(seg.startupTimer);
          const errCode=String(ev?.error||'');
          if(errCode==='canceled'||errCode==='interrupted') {
            if(errCode==='interrupted' && typeof onPaused==='function') {
              activeSegment=null;seg.utterance=null;activeUtterance=null;
              scheduleIOSAudioSessionRelease();
              onPaused();
            }
            return;
          }
          failSegment(errCode||'synthesis-failed',plan.start);
        };
        try {
          if(synth.paused&&typeof synth.resume==='function')synth.resume();
          synth.speak(utterance);
          if(!chunkStarted && activeSegment===seg && id===request) {
            const canRecoverIOS=isIOS && !retried && (chunkIndex>0 || (chunkIndex===0 && cancelledOnStart));
            seg.startupTimer=setTimeout(()=>{
              if(activeSegment!==seg || id!==request || chunkStarted) return;
              if(canRecoverIOS) {
                seg.utterance=null;activeUtterance=null;
                cancelActiveSpeech();
                seg.pauseTimer=setTimeout(()=>nextChunk(plan.start,{retried:true}),100);
                return;
              }
              cancelActiveSpeech();
              failSegment('startup-timeout',plan.start);
            },canRecoverIOS?2200:5500);
          }
        } catch {
          clearTimeout(seg.startupTimer);
          failSegment('synthesis-failed',plan.start);
        }
      }
      nextChunk(startAt);
      return reqId;
    }
    function cancelSegment(reqId) {
      if(!activeSegment || (reqId && activeSegment.requestId!==reqId)) return;
      stopActiveSegment(false);
    }
    function applyLanguageChange() {
      stopActiveSegment(true);
      stopPreview(); pause();
      const s=o.getSettings();s.voice='';s.audioLanguage='';
      audio.offset=0;audio.text='';audio.speechId=null;audio.state='idle';
      refreshVoices();update();
    }
    function dispatch() {
      if(typeof o.onUpdate==='function')o.onUpdate();
    }
    const clearStartupTimer=()=>{if(startupTimer!==null){clearTimeout(startupTimer);startupTimer=null;}if(chunkPauseTimer!==null){clearTimeout(chunkPauseTimer);chunkPauseTimer=null;}};
    function cancelActiveSpeech() {
      clearStartupTimer();
      primerUtterance=null;
      if(!synth)return false;
      let cancelled=false;
      try{if(synth.speaking||synth.pending||synth.paused){synth.cancel();cancelled=true;}}catch(error){console.warn('SePrepare: falha ao limpar fila de voz',error);}
      return cancelled;
    }
    const speechErrors={
      pt:{'not-allowed':'O iPhone bloqueou o início da voz. Toque novamente em Ouvir ou Testar voz.','audio-busy':'A saída de áudio está ocupada. Verifique outros aplicativos ou dispositivos conectados.','audio-hardware':'Não foi encontrada uma saída de áudio. Verifique o alto-falante ou os fones.','language-unavailable':'Não há voz utilizável para este idioma. Instale uma voz nas configurações do iPhone.','voice-unavailable':'A voz escolhida não está disponível para reproduzir áudio.','synthesis-unavailable':'O iPhone não disponibilizou um mecanismo de leitura em voz alta.','network':'Esta voz depende de uma conexão que não está disponível.','startup-timeout':'A voz não respondeu. Tente outra voz nas configurações de áudio.','synthesis-failed':'O iPhone não conseguiu reproduzir esta voz.'},
      en:{'not-allowed':'The iPhone blocked speech. Tap Listen or Test voice again.','audio-busy':'Audio output is busy. Check other apps or connected devices.','audio-hardware':'No audio output was found. Check the speaker or headphones.','language-unavailable':'No usable voice was found for this language. Install a voice in iPhone Settings.','voice-unavailable':'The selected voice is unavailable for playback.','synthesis-unavailable':'Speech synthesis is unavailable on this iPhone.','network':'This voice needs a network connection.','startup-timeout':'The voice did not start. Try another voice in audio settings.','synthesis-failed':'The iPhone could not play this voice.'},
      es:{'not-allowed':'El iPhone bloqueó la voz. Toca Escuchar o Probar voz de nuevo.','audio-busy':'La salida de audio está ocupada. Revisa otras aplicaciones o dispositivos.','audio-hardware':'No se encontró salida de audio. Comprueba el altavoz o los auriculares.','language-unavailable':'No hay una voz disponible para este idioma. Instala una en Ajustes del iPhone.','voice-unavailable':'La voz seleccionada no está disponible para reproducir.','synthesis-unavailable':'La lectura en voz alta no está disponible.','network':'Esta voz necesita conexión de red.','startup-timeout':'La voz no respondió. Prueba otra voz en ajustes de audio.','synthesis-failed':'El iPhone no pudo reproducir esta voz.'},
      ja:{'not-allowed':'iPhoneが読み上げをブロックしました。もう一度タップしてください。','audio-busy':'音声出力が使用中です。ほかのアプリや接続機器をご確認ください。','audio-hardware':'音声出力先が見つかりません。スピーカーやイヤホンをご確認ください。','language-unavailable':'この言語で使用できる音声がありません。iPhoneの設定で追加してください。','voice-unavailable':'選択した音声を再生できません。','synthesis-unavailable':'このiPhoneでは読み上げを使用できません。','network':'この音声にはネットワーク接続が必要です。','startup-timeout':'音声が始まりませんでした。別の音声を選んでください。','synthesis-failed':'iPhoneでこの音声を再生できませんでした。'}
    };
    function speechErrorMessage(code) {
      const messages=speechErrors[lang()]||speechErrors.pt;
      return messages[code]||messages['synthesis-failed'];
    }
    function stopPreview() {
      if(!previewing)return;
      request++;previewing=false;previewUtterance=null;activeUtterance=null;
      cancelActiveSpeech();
      scheduleIOSAudioSessionRelease();
      const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);
      update();
    }
    function startUtterance(text, offset, voice, isPreview) {
      if(!synth||typeof global.SpeechSynthesisUtterance!=='function') {
        o.toast(t(17));return false;
      }
      // The first speak() must run synchronously in the user's tap gesture on iOS.
      // Calling cancel() on an idle synthesizer immediately before speak() can
      // discard that first utterance in WebKit.
      request++;
      const id=request, preferredLocale=voice?.lang||locale();
      const cancelledOnStart=cancelActiveSpeech();
      acquireIOSAudioSession();
      const attempted=new Set();
      let fallbackCount=0,currentVoice=voice||null,anyChunkStarted=false,chunkIndex=0;
      const sameLanguage=v=>v && v.lang && v.lang.split(/[-_]/)[0].toLowerCase()===preferredLocale.split(/[-_]/)[0].toLowerCase();
      const valid=()=>id===request && (isPreview?previewing:['starting','playing'].includes(audio.state));
      let currentUtterance=null;

      function fallback() {
        if(fallbackCount>=2)return false;
        // Retry only with a voice of the same language; never silently switch
        // a Japanese/Spanish presentation to Portuguese or English.
        attempted.add(voiceKey(currentVoice));
        refreshVoices();
        const alternatives=candidates.filter(v=>sameLanguage(v)&&!attempted.has(voiceKey(v)))
          .sort((a,b)=>voiceQualityScore(b)-voiceQualityScore(a));
        const alternate=alternatives[0]||(!attempted.has('system-default')?null:undefined);
        if(alternate===undefined)return false;
        currentVoice=alternate;
        fallbackCount++;
        return true;
      }
      function fail(code,at) {
        if(!valid())return;
        clearStartupTimer();
        const retryable=['voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed','network','startup-timeout','preview-timeout'].includes(code);
        // A retry from an asynchronous callback loses the user's tap gesture
        // on iOS. Use a different voice only on the next explicit tap, and never blacklist a working voice.
        if(isIOS&&retryable) {
          if(!anyChunkStarted) {
            if(currentVoice)failedVoices.add(voiceKey(currentVoice));
            else failedSystemLocales.add(preferredLocale.toLowerCase());
          }
        } else if(retryable && fallback()) {
          currentUtterance=null;
          if(isPreview)previewUtterance=null;else activeUtterance=null;
          cancelActiveSpeech();
          nextChunk(at);
          return;
        }
        if(isPreview) {
          previewing=false;previewUtterance=null;
          cancelActiveSpeech();
          const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);
        } else {
          audio.state='paused';activeUtterance=null;
        }
        scheduleIOSAudioSessionRelease();
        const retryText={
          pt:'O iPhone não conseguiu ler com esta voz. Tente outra voz.',
          en:'The iPhone could not read with this voice. Try another voice.',
          es:'El iPhone no pudo leer con esta voz. Prueba otra voz.',
          ja:'iPhoneでこの音声を読み上げられませんでした。別の音声をお試しください。'
        };
        const messageCode=isPreview&&['startup-timeout','preview-timeout'].includes(code)?'synthesis-failed':code;
        o.toast(isIOS&&retryable&&!isPreview ? retryText[lang()]||retryText.pt : speechErrorMessage(messageCode));
        console.warn('SePrepare: speech synthesis failed',code,{language:preferredLocale,preview:isPreview,voice:currentVoice?.name||'system'});
        update();dispatch();
        if(!isPreview&&['voice-unavailable','language-unavailable'].includes(code))missingVoiceHandler?.();
      }
      function nextChunk(at,{retried=false}={}) {
        if(!valid())return;
        clearStartupTimer();
        const rate=clamp(Number(isPreview?document.getElementById('voiceRate')?.value||o.getSettings().rate||1:o.getSettings().rate||1),.5,1.8);
        const plan=planSpeechChunk(text,at,rate);
        if(!plan){
          if(isPreview) {previewing=false;previewUtterance=null;const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);}
          else {audio.state='finished';audio.offset=audio.text.length;activeUtterance=null;}
          scheduleIOSAudioSessionRelease();
          update();dispatch();return;
        }
        const utterance=new global.SpeechSynthesisUtterance(plan.spoken);
        utterance.lang=currentVoice?.lang||preferredLocale;
        if(currentVoice)utterance.voice=currentVoice;
        utterance.rate=rate;
        utterance.volume=1;
        utterance.pitch=1;
        const isCurrent=()=>valid()&&currentUtterance===utterance;
        const armStallTimer=()=>{
          clearStartupTimer();
          const ms=isPreview
            ? 8000+Math.ceil(plan.spoken.length*160/utterance.rate)
            : 10000+Math.ceil(plan.spoken.length*180/utterance.rate);
          startupTimer=setTimeout(()=>{
            if(isCurrent())fail(isPreview?'preview-timeout':'startup-timeout',plan.start);
          },ms);
        };
        let started=false;
        utterance.onstart=()=>{
          if(!isCurrent())return;
          started=true;anyChunkStarted=true;clearStartupTimer();
          if(isPreview){
            const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(6);
          } else {
            audio.state='playing';update();dispatch();
          }
          // WebKit can report a start and then never deliver end or error.
          // Allow extra time for slower voices and longer utterances.
          armStallTimer();
        };
        utterance.onboundary=ev=>{
          if(!isCurrent()||isPreview||audio.state!=='playing')return;
          armStallTimer();
          const ratio=plan.spoken.length ? clamp((Number(ev.charIndex)||0)/plan.spoken.length,0,1) : 0;
          audio.offset=clamp(plan.start+Math.round(ratio*plan.raw.length),0,audio.text.length);
          update();dispatch();
        };
        utterance.onend=()=>{
          if(!isCurrent())return;
          anyChunkStarted=true;
          clearStartupTimer();
          chunkIndex+=1;
          if(plan.nextAt<text.length) {
            if(!isPreview)audio.offset=plan.nextAt;
            update();dispatch();
            // On iOS a short breathing pause between chunks avoids flat run-on speech and queue stalls.
            chunkPauseTimer=setTimeout(()=>{chunkPauseTimer=null;nextChunk(plan.nextAt);},plan.pauseMs);
          } else {
            if(isPreview){previewing=false;previewUtterance=null;const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);}
            else {audio.state='finished';audio.offset=audio.text.length;activeUtterance=null;}
            scheduleIOSAudioSessionRelease();
            update();dispatch();
          }
        };
        utterance.onerror=ev=>{
          if(!isCurrent())return;
          clearStartupTimer();
          fail(ev.error||'synthesis-failed',plan.start);
        };
        currentUtterance=utterance;
        if(isPreview)previewUtterance=utterance;else activeUtterance=utterance;
        try {
          if(synth.paused&&typeof synth.resume==='function')synth.resume();
          synth.speak(utterance);
          if(!started && isCurrent()) {
            // Safari can silently drop speak(): recover once after post-cancel/chunk handoff, or fail cleanly.
            const canRecoverIOS=isIOS && !retried && (chunkIndex>0 || (chunkIndex===0 && cancelledOnStart));
            startupTimer=setTimeout(()=>{
              startupTimer=null;
              if(!isCurrent()||started)return;
              if(canRecoverIOS) {
                cancelActiveSpeech();
                chunkPauseTimer=setTimeout(()=>{chunkPauseTimer=null;nextChunk(plan.start,{retried:true});},100);
                return;
              }
              fail('startup-timeout',plan.start);
            },canRecoverIOS?2200:5500);
          }
        } catch(error) {
          console.warn('SePrepare: speechSynthesis.speak threw',error);
          fail('synthesis-failed',plan.start);
        }
      }
      nextChunk(offset);
      return true;
    }
    function play() {
      stopActiveSegment(true);
      if(audio.state==='playing'||audio.state==='starting'){pause();return;}
      stopPreview();
      o.sync();
      const speech=o.getSpeech();
      if(!speech||!speech.text.trim()){o.toast(o.noSpeechMessage());return;}
      if(audio.speechId!==speech.id||audio.text!==speech.text) {
        audio.speechId=speech.id;audio.text=speech.text;audio.offset=0;
      }
      if(audio.offset>=audio.text.length)audio.offset=0;
      refreshVoices();
      const voice=selectedVoice(false);
      audio.state='starting';
      if(!startUtterance(audio.text,audio.offset,voice,false))audio.state='paused';
      update();dispatch();
    }
    function pause() {
      if(previewing)stopPreview();
      request++;cancelActiveSpeech();
      activeUtterance=null;
      if(audio.state==='playing'||audio.state==='starting')audio.state='paused';
      scheduleIOSAudioSessionRelease();
      update();dispatch();
    }
    function seek(value) {
      if(!audio.text||!audio.speechId)return;
      const wasPlaying=audio.state==='playing'||audio.state==='starting';
      const fraction=clamp(Number(value)||0,0,1000)/1000;
      audio.offset=Math.min(audio.text.length-1,Math.round(audio.text.length*fraction));
      if(wasPlaying){request++;cancelActiveSpeech();audio.state='paused';play();}
      else {update();dispatch();}
    }
    function preview() {
      stopActiveSegment(true);
      if(previewing){stopPreview();return;}
      if(audio.state==='playing'||audio.state==='starting')pause();
      const field=document.getElementById('voicePreviewText');
      const text=(field?.value||'').trim() || t(19);
      if(field&&!field.value.trim())field.value=text;
      refreshVoices();
      const voice=selectedVoice(true);
      previewing=true;
      const label=document.getElementById('audioTestLabel');if(label)label.textContent=startingLabel();
      if(!startUtterance(text,0,voice,true)){previewing=false;if(label)label.textContent=t(5);}
      update();
    }
    function progressHTML() {
      return '<div class="audio-progress" id="audioProgress" hidden><div class="range-line"><label for="audioSeek">'+escape(t(9))+'</label>'+
        '<output id="audioSeekValue">0%</output></div><input type="range" id="audioSeek" min="0" max="1000" step="1" value="0" aria-label="'+escape(t(10))+'">'+
        '<small>'+escape(t(11))+'</small>'+
        (isIOS ? '<small class="audio-silent-hint">'+escape(appleSilentHint[lang()]||appleSilentHint.pt)+'</small>' : '')+
        '</div>';
    }
    let floating=document.getElementById('floatingAudioStop'),pos=null,ignoreClick=false,pointer=null;
    try{const value=JSON.parse(localStorage.getItem('seprepare-audio-control-position')||'null');if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))pos=value;}catch{}
    function ensureFloating() {
      if(floating)return;
      floating=document.createElement('button');floating.id='floatingAudioStop';floating.type='button';floating.className='audio-floating-stop';floating.hidden=true;
      floating.innerHTML=o.icon('Volume2')+o.icon('Square','audio-stop-symbol');
      floating.setAttribute('aria-label',t(12));floating.title=t(12);
      document.body.append(floating);
      floating.addEventListener('pointerdown',ev=>{pointer={id:ev.pointerId,x:ev.clientX,y:ev.clientY,ox:floating.offsetLeft,oy:floating.offsetTop};dragged=false;try{floating.setPointerCapture(ev.pointerId);}catch{}});
      floating.addEventListener('pointermove',ev=>{if(!pointer||ev.pointerId!==pointer.id)return;if(Math.hypot(ev.clientX-pointer.x,ev.clientY-pointer.y)<7&&!dragged)return;dragged=true;const w=window.innerWidth,h=window.innerHeight;floating.style.left=clamp(pointer.ox+ev.clientX-pointer.x,8,w-60)+'px';floating.style.top=clamp(pointer.oy+ev.clientY-pointer.y,8,h-60)+'px';});
      floating.addEventListener('pointerup',ev=>{if(!pointer||ev.pointerId!==pointer.id)return;pointer=null;if(dragged){ignoreClick=true;pos={x:floating.offsetLeft/Math.max(1,window.innerWidth-52),y:floating.offsetTop/Math.max(1,window.innerHeight-52)};try{localStorage.setItem('seprepare-audio-control-position',JSON.stringify(pos));}catch{}}});
      floating.addEventListener('click',ev=>{if(ignoreClick){ignoreClick=false;ev.preventDefault();return;}pause();});
    }
    function updateFloating() {
      ensureFloating();
      const controls=document.querySelector('.reader-subtools'), rect=controls?.getBoundingClientRect();
      const controlsVisible=!!rect&&rect.top<innerHeight&&rect.bottom>0;
      floating.hidden=!(o.isReader()&&audio.state==='playing'&&!controlsVisible&&!document.querySelector('.modal-backdrop'));
      if(floating.hidden)return;
      const x=pos?clamp(pos.x,0,1)*(window.innerWidth-52):window.innerWidth-68;
      const y=pos?clamp(pos.y,0,1)*(window.innerHeight-52):Math.max(8,window.innerHeight-132);
      floating.style.left=clamp(x,8,Math.max(8,window.innerWidth-60))+'px';
      floating.style.top=clamp(y,8,Math.max(8,window.innerHeight-60))+'px';
    }
    function update() {
      const playing=audio.state==='playing'||audio.state==='starting';
      document.querySelectorAll('[data-action="speak"]').forEach(btn=>{
        btn.innerHTML=o.icon(playing?'Pause':'Volume2')+'<span>'+escape(playing?t(14):t(13))+'</span>';
        btn.setAttribute('aria-label',playing?t(12):(audio.state==='paused'?t(15):t(13)));
      });
      const bar=document.getElementById('audioProgress'), slider=document.getElementById('audioSeek');
      if(bar)bar.hidden=!(audio.speechId&&audio.text&&['starting','playing'].includes(audio.state));
      if(slider&&!slider.matches(':active')) {
        const n=audio.text?.length ? Math.round(clamp(audio.offset/audio.text.length,0,1)*1000):0;
        slider.value=String(n);
        const output=document.getElementById('audioSeekValue');if(output)output.textContent=Math.round(n/10)+'%';
      }
      updateFloating();
    }
    global.addEventListener('scroll',updateFloating,{passive:true});
    global.addEventListener('resize',updateFloating);
    global.addEventListener('focus',refreshVoices);
    // Reset a suspended iOS playback session but keep speech text/position.
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){
        if(activeSegment)stopActiveSegment(false);
        if(audio.state==='playing'||audio.state==='starting'||previewing)pause();
      }
    });
    global.addEventListener('pagehide',()=>{
      if(activeSegment)stopActiveSegment(false);
      if(audio.state==='playing'||audio.state==='starting'||previewing)pause();
    });
    if(synth)synth.addEventListener('voiceschanged',refreshVoices);
    document.addEventListener('input',event=>{
      if(event.target?.id!=='audioSeek')return;
      const output=document.getElementById('audioSeekValue');
      if(output)output.textContent=Math.round(Number(event.target.value)/10)+'%';
    });
    document.addEventListener('change',event=>{if(event.target?.id==='audioSeek')seek(event.target.value);});
    refreshVoices();ensureFloating();
    return {readLabel:()=>t(13),setMissingVoiceHandler:fn=>{missingVoiceHandler=fn;},refreshVoices,settingsHTML,bindSettings,saveSettings,applyLanguageChange,play,pause,preview,stopPreview,seek,update,progressHTML,getAvailableVoices,speakSegment,cancelSegment,setExternalInterruptHandler,unlock};
  }
  global.SePrepareAudio={create};
})(window);
