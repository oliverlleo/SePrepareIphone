/* SePrepare: leitura por voz compartilhada entre PWA de iPhone e web/Windows. */
(function(global) {
  'use strict';
  if (global.SePrepareAudio) return;
  const langs = {'pt-BR':'pt-BR',pt:'pt-BR',en:'en-US',es:'es-ES',ja:'ja-JP'};
  const translations = {
    'pt': ['Automática (idioma do aplicativo)','Voz de leitura','Velocidade','Texto para testar a voz','Use a frase de exemplo ou escreva um texto. O teste não altera seus discursos.','Testar voz','Parar teste','Nenhuma voz disponível para este idioma. Instale uma voz nas configurações do dispositivo.','As vozes disponíveis dependem do navegador e do sistema. Apenas vozes acessíveis a este navegador podem ser usadas.','Posição da leitura','Avançar ou recuar a leitura','Arraste para voltar ou avançar no texto.','Pausar áudio','Ouvir','Pausar','Continuar áudio','Não há uma voz disponível para este idioma. Confira as vozes instaladas no dispositivo.','Este navegador não disponibiliza leitura em voz alta.','Esta voz é automática para o idioma selecionado.','Esta é uma frase para testar a voz do SePrepare.'],
    en: ['Automatic (app language)','Reading voice','Speed','Text to test the voice','Use the sample sentence or write your own. This test does not change your speeches.','Test voice','Stop test','No voice is available for this language. Install one in device settings.','Available voices depend on your browser and operating system. Only accessible voices can be used.','Reading position','Skip forwards or backwards','Drag to move within the text.','Pause audio','Listen','Pause','Resume audio','No voice is available for this language. Check the installed voices.','This browser does not support speech synthesis.','Automatically use a voice in the selected language.','This is a sample sentence to test the SePrepare voice.'],
    es: ['Automática (idioma de la aplicación)','Voz de lectura','Velocidad','Texto para probar la voz','Utiliza la frase de ejemplo o escribe un texto. La prueba no modifica tus discursos.','Probar voz','Detener prueba','No hay voces para este idioma. Instala una en los ajustes del dispositivo.','Las voces disponibles dependen del navegador y del sistema operativo.','Posición de lectura','Avanzar o retroceder','Arrastra para moverte por el texto.','Pausar audio','Escuchar','Pausar','Reanudar audio','No hay una voz disponible para este idioma. Revisa las voces instaladas.','Este navegador no permite la lectura en voz alta.','Seleccionar automáticamente la voz del idioma elegido.','Esta es una frase de ejemplo para probar la voz de SePrepare.'],
    ja: ['自動（アプリの言語）','読み上げ音声','速度','音声を試すテキスト','例文を使うか、文章を入力してください。原稿は変更されません。','音声をテスト','テストを停止','この言語の音声がありません。端末の設定で追加してください。','利用可能な音声はブラウザーと端末によって異なります。','読み上げ位置','前後に移動','スライダーで再生位置を移動できます。','音声を一時停止','聞く','一時停止','音声を再開','この言語の音声がありません。端末の設定を確認してください。','このブラウザーは読み上げに対応していません。','選択した言語の音声を自動で使用します。','SePrepare の音声をテストするための例文です。']
  };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalized = code => langs[String(code || 'pt-BR').split('-')[0]] || 'pt-BR';
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  function create(options) {
    const o=options, synth=global.speechSynthesis, audio=o.audio;
    let candidates=[],browserList=[],activeUtterance=null,request=0,previewing=false,previewUtterance=null,dragged=false,startupTimer=null;
    const lang=() => String(o.getSettings().language || 'pt-BR').slice(0,2).toLowerCase();
    const t=i => (translations[lang()] || translations.pt)[i];
    const locale=() => normalized(o.getSettings().language);
    const normalizedName=name => String(name||'').replace(/(?:\s*\(?(?:online|offline|network)\)?|-network|-local)$/i,'').trim();
    function refreshVoices() {
      try { browserList=synth ? synth.getVoices() : []; } catch { browserList=[]; }
      const map=new Map();
      browserList.forEach(v => {
        if (!v || !v.name || !v.lang) return;
        const key=normalizedName(v.name).toLocaleLowerCase()+'|'+v.lang.toLowerCase();
        const previous=map.get(key);
        if (!previous || (v.localService && !previous.localService)) map.set(key,v);
      });
      const unique=[...map.values()];
      // Prefer installed local voices and do not list a network duplicate.
      candidates=unique.some(v=>v.localService) ? unique.filter(v=>v.localService!==false) : unique;
      candidates.sort((a,b)=>a.lang.localeCompare(b.lang)||a.name.localeCompare(b.name));
      o.setVoices(candidates.map(v=>({name:v.name,locale:v.lang,offline:v.localService!==false})));
      const select=document.getElementById('voiceName');
      if(select && !previewing) {
        const selected=select.value;
        select.innerHTML=voiceOptions(selected);
        if([...select.options].some(v=>v.value===selected)) select.value=selected;
      }
      return candidates;
    }
    function exactVoice(name,voiceLocale) {
      return candidates.find(v=>v.name===name && (!voiceLocale||v.lang===voiceLocale)) ||
        candidates.find(v=>normalizedName(v.name)===normalizedName(name) && (!voiceLocale||v.lang===voiceLocale));
    }
    function automaticVoice(preferred=locale()) {
      const language=preferred.split('-')[0].toLowerCase();
      return candidates.find(v=>v.lang.toLowerCase()===preferred.toLowerCase()&&v.default) ||
        candidates.find(v=>v.lang.toLowerCase()===preferred.toLowerCase()) ||
        candidates.find(v=>v.lang.toLowerCase().split('-')[0]===language&&v.default) ||
        candidates.find(v=>v.lang.toLowerCase().split('-')[0]===language) || null;
    }
    function selectedVoice(form=false) {
      const settings=o.getSettings();
      const name=form ? document.getElementById('voiceName')?.value : settings.voice;
      const parsed=String(name||'').split('\u001f');
      if(parsed[0]) return exactVoice(parsed[0],parsed[1] || (!form&&settings.audioLanguage) || '') || automaticVoice(locale());
      return automaticVoice(locale());
    }
    function storedVoice() {
      const settings=o.getSettings();
      const chosen=exactVoice(settings.voice,settings.audioLanguage);
      return chosen ? chosen.name+'\u001f'+chosen.lang : '';
    }
    function voiceOptions(previous) {
      const chosen=previous===undefined ? storedVoice() : previous;
      let html='<option value="">'+escape(t(0))+'</option>';
      for(const v of candidates) {
        const value=v.name+'\u001f'+v.lang;
        html+='<option value="'+escape(value)+'"'+(value===chosen?' selected':'')+'>'+escape(normalizedName(v.name)+' · '+v.lang)+'</option>';
      }
      return html;
    }
    function settingsHTML() {
      refreshVoices();
      const s=o.getSettings();
      return '<p class="help">'+escape(t(8))+'</p><div class="stack">'+
        '<div class="field"><label for="voiceName">'+escape(t(1))+'</label><select id="voiceName">'+voiceOptions()+'</select>'+
        '<small>'+escape(candidates.length ? t(18) : t(7))+'</small></div>'+
        '<div class="field"><div class="range-line"><label for="voiceRate">'+escape(t(2))+'</label><output id="voiceRateValue">'+Number(s.rate||1).toFixed(1)+'×</output></div>'+
        '<input type="range" id="voiceRate" min=".5" max="1.8" step=".1" value="'+escape(s.rate||1)+'"></div>'+
        '<div class="field audio-preview-field"><label for="voicePreviewText">'+escape(t(3))+'</label>'+
        '<textarea id="voicePreviewText" rows="3" maxlength="2000">'+escape(t(19))+'</textarea><small>'+escape(t(4))+'</small></div>'+
        '<button type="button" class="btn soft" data-action="test-voice"><span id="audioTestLabel">'+escape(t(5))+'</span></button>'+
        '</div>';
    }
    function bindSettings() {
      const rate=document.getElementById('voiceRate');
      if(rate) rate.addEventListener('input',()=>{const v=document.getElementById('voiceRateValue');if(v)v.textContent=Number(rate.value).toFixed(1)+'×';});
    }
    function saveSettings() {
      const s=o.getSettings(), selector=document.getElementById('voiceName'), selected=String(selector?.value||'').split('\u001f');
      s.voice=selected[0] || '';s.audioLanguage=selected[1] || '';
      s.rate=clamp(Number(document.getElementById('voiceRate')?.value||s.rate||1),.5,1.8);
      return s;
    }
    function applyLanguageChange() {
      stopPreview(); pause();
      const s=o.getSettings();s.voice='';s.audioLanguage='';
      audio.offset=0;audio.text='';audio.speechId=null;audio.state='idle';
      refreshVoices();update();
    }
    function dispatch() {
      if(typeof o.onUpdate==='function')o.onUpdate();
    }
    const clearStartupTimer=()=>{if(startupTimer!==null){clearTimeout(startupTimer);startupTimer=null;}};
    function cancelActiveSpeech() {
      clearStartupTimer();
      if(!synth)return;
      try{if(synth.speaking||synth.pending||synth.paused)synth.cancel();}catch(error){console.warn('SePrepare: falha ao limpar fila de voz',error);}
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
      cancelActiveSpeech();
      request++;
      const id=request, preferredLocale=voice?.lang||locale();
      const attempted=new Set();
      let fallbackCount=0,currentVoice=voice||null;
      const voiceKey=v=>v?(v.voiceURI||v.name+'|'+v.lang):'system-default';
      const sameLanguage=v=>v && v.lang && v.lang.split('-')[0].toLowerCase()===preferredLocale.split('-')[0].toLowerCase();
      const valid=()=>id===request && (isPreview?previewing:['starting','playing'].includes(audio.state));
      let currentUtterance=null;

      function fallback() {
        if(fallbackCount>=2)return false;
        // Retry only with a voice of the same language; never silently switch
        // a Japanese/Spanish presentation to Portuguese or English.
        attempted.add(voiceKey(currentVoice));
        refreshVoices();
        const alternatives=candidates.filter(v=>sameLanguage(v)&&!attempted.has(voiceKey(v)))
          .sort((a,b)=>Number(b.localService!==false)-Number(a.localService!==false));
        const alternate=alternatives[0]||(!attempted.has('system-default')?null:undefined);
        if(alternate===undefined)return false;
        currentVoice=alternate;
        fallbackCount++;
        return true;
      }
      function fail(code,at) {
        if(!valid())return;
        clearStartupTimer();
        const retryable=['voice-unavailable','language-unavailable','synthesis-unavailable','synthesis-failed','network','startup-timeout'].includes(code);
        if(retryable && fallback()) {
          // Invalidate the failed utterance before cancel(), which can
          // synchronously emit another error event in Safari.
          currentUtterance=null;
          if(isPreview)previewUtterance=null;else activeUtterance=null;
          cancelActiveSpeech();
          nextChunk(at);
          return;
        }
        if(isPreview) {
          previewing=false;previewUtterance=null;
          const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);
        } else {
          audio.state='paused';activeUtterance=null;
        }
        o.toast(speechErrorMessage(code));
        console.warn('SePrepare: speech synthesis failed',code,{language:preferredLocale,preview:isPreview});
        update();dispatch();
      }
      function nextChunk(at) {
        if(!valid())return;
        clearStartupTimer();
        const remaining=text.slice(at);
        if(!remaining.length){
          if(isPreview) {previewing=false;previewUtterance=null;const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);}
          else {audio.state='finished';audio.offset=audio.text.length;activeUtterance=null;}
          update();dispatch();return;
        }
        let length=Math.min(220,remaining.length);
        if(remaining.length>length) {
          const punctuation=remaining.slice(0,length).search(/[.!?;:][ \n]/);
          const wordsEnd=remaining.slice(0,length).lastIndexOf(' ');
          if(punctuation>50)length=punctuation+1;
          else if(wordsEnd>100)length=wordsEnd+1;
        }
        const chunk=remaining.slice(0,length);
        const utterance=new global.SpeechSynthesisUtterance(chunk);
        utterance.lang=currentVoice?.lang||preferredLocale;
        if(currentVoice)utterance.voice=currentVoice;
        utterance.rate=clamp(Number(isPreview?document.getElementById('voiceRate')?.value||o.getSettings().rate||1:o.getSettings().rate||1),.5,1.8);
        const isCurrent=()=>valid()&&currentUtterance===utterance;
        let started=false;
        utterance.onstart=()=>{
          if(!isCurrent())return;
          started=true;clearStartupTimer();
          if(!isPreview){audio.state='playing';update();dispatch();}
        };
        utterance.onboundary=ev=>{
          if(!isCurrent()||isPreview||audio.state!=='playing')return;
          audio.offset=clamp(at+(Number(ev.charIndex)||0),0,audio.text.length);
          update();dispatch();
        };
        utterance.onend=()=>{
          if(!isCurrent())return;
          clearStartupTimer();
          const finish=at+chunk.length;
          if(finish<text.length) {
            if(!isPreview)audio.offset=finish;
            update();dispatch();
            // On iOS a short task gap between chunks prevents a stalled queue.
            setTimeout(()=>nextChunk(finish),0);
          } else {
            if(isPreview){previewing=false;previewUtterance=null;const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(5);}
            else {audio.state='finished';audio.offset=audio.text.length;activeUtterance=null;}
            update();dispatch();
          }
        };
        utterance.onerror=ev=>{
          if(!isCurrent())return;
          clearStartupTimer();
          fail(ev.error||'synthesis-failed',at);
        };
        currentUtterance=utterance;
        if(isPreview)previewUtterance=utterance;else activeUtterance=utterance;
        try {
          synth.speak(utterance);
          if(!started && isCurrent()) {
            // Safari can silently drop speak(): don't leave a fake Playing state.
            startupTimer=setTimeout(()=>{
              startupTimer=null;
              if(isCurrent()&&!started)fail('startup-timeout',at);
            },4500);
          }
        } catch(error) {
          console.warn('SePrepare: speechSynthesis.speak threw',error);
          fail('synthesis-failed',at);
        }
      }
      nextChunk(offset);
      return true;
    }
    function play() {
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
      const v=selectedVoice();
      // With no enumerated voices, ask iOS to choose its system voice by lang.
      audio.state='starting';
      if(!startUtterance(audio.text,audio.offset,v,false))audio.state='paused';
      update();dispatch();
    }
    function pause() {
      if(previewing)stopPreview();
      request++;cancelActiveSpeech();
      activeUtterance=null;
      if(audio.state==='playing'||audio.state==='starting')audio.state='paused';
      update();dispatch();
    }
    function seek(value) {
      if(!audio.text||!audio.speechId)return;
      const wasPlaying=audio.state==='playing'||audio.state==='starting';
      const fraction=clamp(Number(value)||0,0,1000)/1000;
      audio.offset=Math.min(audio.text.length-1,Math.round(audio.text.length*fraction));
      if(wasPlaying){request++;synth?.cancel();audio.state='paused';play();}
      else {update();dispatch();}
    }
    function preview() {
      if(previewing){stopPreview();return;}
      pause();
      const field=document.getElementById('voicePreviewText');
      const text=(field?.value||'').trim() || t(19);
      if(field&&!field.value.trim())field.value=text;
      refreshVoices();
      const voice=selectedVoice(true);
      previewing=true;
      const label=document.getElementById('audioTestLabel');if(label)label.textContent=t(6);
      if(!startUtterance(text,0,voice,true))previewing=false;
      update();
    }
    function progressHTML() {
      return '<div class="audio-progress" id="audioProgress" hidden><div class="range-line"><label for="audioSeek">'+escape(t(9))+'</label>'+
        '<output id="audioSeekValue">0%</output></div><input type="range" id="audioSeek" min="0" max="1000" step="1" value="0" aria-label="'+escape(t(10))+'">'+
        '<small>'+escape(t(11))+'</small></div>';
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
      floating.addEventListener('pointerup',ev=>{if(!pointer||pointer.id!==ev.pointerId)return;pointer=null;if(dragged){ignoreClick=true;pos={x:floating.offsetLeft/Math.max(1,window.innerWidth-52),y:floating.offsetTop/Math.max(1,window.innerHeight-52)};try{localStorage.setItem('seprepare-audio-control-position',JSON.stringify(pos));}catch{}}});
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
      if(bar)bar.hidden=!(audio.speechId&&audio.text&&['starting','playing','paused','finished'].includes(audio.state));
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
    if(synth)synth.addEventListener('voiceschanged',refreshVoices);
    document.addEventListener('input',event=>{
      if(event.target?.id!=='audioSeek')return;
      const output=document.getElementById('audioSeekValue');
      if(output)output.textContent=Math.round(Number(event.target.value)/10)+'%';
    });
    document.addEventListener('change',event=>{if(event.target?.id==='audioSeek')seek(event.target.value);});
    refreshVoices();ensureFloating();
    return {refreshVoices,settingsHTML,bindSettings,saveSettings,applyLanguageChange,play,pause,preview,stopPreview,seek,update,progressHTML};
  }
  global.SePrepareAudio={create};
})(window);
