import {t,h} from './i18n.js';
import {searchSettings} from './settings-search-core.js';
export const settingsGroups=['GERAL','ESCRITA E APRESENTAÇÃO','AGENDA','DADOS E SEGURANÇA','AJUDA E INFORMAÇÕES'];
export function settingsCatalog(){
 const entry=(id,title,group,icon,options={})=>({id,title:t(title),category:t(settingsGroups[group]),group,icon,...options});
 return [
  entry('language','Idioma do aplicativo',0,'Languages',{panel:'language',concepts:['language'],keywords:'interface menu português English español 日本語'}),
  entry('appearance','Aparência',0,'Sun',{panel:'appearance',concepts:['appearance']}),
  entry('review','Revisão de português',1,'SpellCheck',{panel:'review',concepts:['spelling'],keywords:'Hunspell VERO LanguageTool corretor offline online'}),
  entry('pace','Ritmos de apresentação',1,'Music',{action:'rhythm-manager',concepts:['speed'],keywords:'gerenciar criar editar personalizado leitura tempo estimativa palavras por minuto'}),
  entry('voice','Voz e áudio',1,'Volume2',{action:'audio-settings',concepts:['voice','speed'],keywords:'leitura som locutor offline aparelho velocidade'}),
  entry('notifications','Notificações',2,'Bell',{panel:'notifications',concepts:['notification']}),
  entry('backup','Backup e recuperação',3,'Cloud',{action:'drive-settings',concepts:['recover'],keywords:'Google Drive dados proteger segurança recuperar restaurar importar exportar'}),
  entry('trash','Lixeira',3,'Archive',{action:'trash',concepts:['recover','trash'],keywords:'recuperar restaurar apagado excluído 30 dias'}),
  entry('guide','Guia do SePrepare',4,'BookOpen',{action:'guide',concepts:['help']}),
  entry('support','Apoiar o desenvolvedor',4,'HandHeart',{action:'support-donation',concepts:['support']}),
  entry('privacy','Privacidade',4,'ShieldCheck',{panel:'privacy',concepts:['privacy']}),
  entry('about','Sobre o SePrepare',4,'Info',{action:'about',concepts:['about'],keywords:'versão version 1.0.73 atualização sobre'}),
  entry('interactive-rehearsal-guide','Ensaio interativo',4,'Mic',{parent:'guide',parentTitle:t('Guia do SePrepare'),action:'guide',concepts:['help','voice'],keywords:'ensaio interativo demonstração participantes manual automático microfone sua vez'}),
  entry('dictionary','Meu dicionário',1,'BookMarked',{parent:'review',parentTitle:t('Revisão de português'),action:'dictionary',concepts:['spelling'],keywords:'palavras pessoais correções lembradas personal dictionary remembered corrections diccionario 辞書'}),
  entry('online-review','Revisão online',1,'Globe',{parent:'review',parentTitle:t('Revisão de português'),panel:'review',focus:'#onlineReview',concepts:['spelling'],keywords:'LanguageTool internet corretor servidor endpoint'}),
  entry('review-address','Endereço do corretor',1,'Globe',{parent:'review',parentTitle:t('Revisão de português'),panel:'review',focus:'#reviewEndpoint',concepts:['spelling'],keywords:'URL LanguageTool HTTPS servidor endpoint'}),
  entry('default-pace','Palavras por minuto',1,'Timer',{parent:'pace',parentTitle:t('Ritmos de apresentação'),action:'rhythm-default',focus:'#rhythmDefaultPpm',concepts:['speed'],keywords:'velocidade leitura PPM padrão default predeterminado 標準'}),
  entry('manage-paces','Gerenciar ritmos',1,'Music',{parent:'pace',parentTitle:t('Ritmos de apresentação'),action:'rhythm-manager',concepts:['speed'],keywords:'criar editar excluir personalizado ritmo nome barra colorida custom'}),
  entry('voice-name','Escolher voz',1,'Headphones',{parent:'voice',parentTitle:t('Voz e áudio'),action:'audio-settings',focus:'#voiceName',concepts:['voice','language'],keywords:'offline voz padrão aparelho Voice 1 Voz 1 音声'}),
  entry('voice-speed','Velocidade da voz',1,'Volume2',{parent:'voice',parentTitle:t('Voz e áudio'),action:'audio-settings',focus:'#voiceRate',concepts:['speed','voice'],keywords:'leitura rápido lento taxa rate velocidad 速度'}),
  entry('voice-preview','Testar a voz',1,'Play',{parent:'voice',parentTitle:t('Voz e áudio'),action:'audio-settings',focus:'#voicePreviewText',concepts:['voice'],keywords:'ouvir amostra prévia escutar texto sample preview'}),
  entry('notification-permission','Permitir notificações',2,'BellRing',{parent:'notifications',parentTitle:t('Notificações'),panel:'notifications',focus:'[data-action="notifications"]',concepts:['notification'],keywords:'permissão autorizar alertas lembretes'}),
  entry('exact-time','Horários precisos',2,'Clock',{parent:'notifications',parentTitle:t('Notificações'),panel:'notifications',focus:'[data-action="exact-alarms"]',concepts:['notification'],keywords:'alarme exato exact alarm horário'}),
  entry('auto-backup','Backup automático',3,'CloudUpload',{parent:'backup',parentTitle:t('Backup e recuperação'),action:'drive-settings',focus:'#driveAutoBackup',concepts:['recover'],keywords:'salvar proteção automática automatic copia'}),
  entry('auto-restore','Recuperação automática',3,'CloudDownload',{parent:'backup',parentTitle:t('Backup e recuperação'),action:'drive-settings',focus:'#driveAutoRead',concepts:['recover'],keywords:'restaurar novidades sincronizar automático automatic restore'}),
  entry('restore-backup','Recuperar meus discursos',3,'History',{parent:'backup',parentTitle:t('Backup e recuperação'),action:'drive-settings',focus:'[data-action="drive-list"]',concepts:['recover'],keywords:'restaurar versões cópias Google Drive restore recovery'}),
  entry('file-backup','Backup em arquivo',3,'FileDown',{parent:'backup',parentTitle:t('Backup e recuperação'),action:'drive-settings',focus:'[data-action="backup"]',concepts:['recover'],keywords:'exportar importar arquivo salvar copiar JSON file export import'}),
  entry('terms','Termos de Uso',4,'FileText',{parent:'privacy',parentTitle:t('Privacidade'),panel:'privacy',focus:'a[href*="/termos/"]',concepts:['privacy']}),
  entry('licenses','Licenças e créditos',4,'FileText',{parent:'about',parentTitle:t('Sobre o SePrepare'),action:'third-party-licenses',concepts:['about'],keywords:'componentes licença código aberto fontes open source'}),
 ];
}
export function mountSettingsNavigation(c){
 const host=c.host,stash=document.createElement('div');stash.className='settings-panel-stash';stash.hidden=true;
 const panels={language:host.querySelector('#appLanguage')?.closest('.setting-card'),review:host.querySelector('#onlineReview')?.closest('.setting-card'),notifications:host.querySelector('#permissionsSummary')?.closest('.setting-card'),privacy:host.querySelector('.legal-settings-card')};
 while(host.firstChild)stash.append(host.firstChild);
 Object.assign(panels,c.panels||{});const entries=[...settingsCatalog().filter(c.filterEntry||(()=>true)),...(c.extraEntries||[])],verNote=c.version?`${t('Versão')} ${c.version}`:'';host.innerHTML=h`<div class="settings-search-sticky"><label class="settings-search-field">${c.icon('Search')}<input type="search" id="settingsSearch" autocomplete="off" placeholder="Pesquisar ajustes…" aria-label="Pesquisar ajustes"><button type="button" id="clearSettingsSearch" aria-label="Limpar busca" hidden>${c.icon('X')}</button></label><p class="settings-search-status" id="settingsSearchStatus" role="status" aria-live="polite"></p></div><div class="settings-categories" id="settingsCategories"></div>${verNote?h`<p class="settings-version-footer" id="settingsVersionFooter">SePrepare · ${c.escape(verNote)}</p>`:''}`;host.append(stash);
 let active=null,frame=0;
 const input=host.querySelector('#settingsSearch'),results=host.querySelector('#settingsCategories'),status=host.querySelector('#settingsSearchStatus');input.value=c.query||'';
 function release(){if(active){stash.append(active);active=null;}}
 function focusTarget(selector){if(!selector)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const modal=document.querySelector('.modal'),field=modal?.querySelector(selector);if(field&&!field.disabled){field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}else modal?.querySelector('h2')?.setAttribute('tabindex','-1');});}
 function openPanel(entry){
  if(entry.panel==='appearance'){c.appearance();return;}
  const panel=panels[entry.panel];if(!panel)return;c.openModal(entry.parentTitle||entry.title,'');styleSettingsDialog(entry.panel);panel.classList.add('settings-detail-content');document.querySelector('.modal-body').append(panel);active=panel;c.mark();focusTarget(entry.focus);
 }
 function row(entry,searching){const sub=searching&&entry.parent?entry.parentTitle:entry.id==='about'&&verNote?verNote:'';return h`<button type="button" class="settings-option" data-settings-id="${entry.id}" ${entry.action?`data-action="${entry.action}"`:''}><span class="settings-option-icon" aria-hidden="true">${c.icon(entry.icon)}</span><span class="settings-option-copy"><strong>${c.escape(entry.title)}</strong>${sub?h`<small>${c.escape(sub)}</small>`:''}</span>${c.icon('ChevronRight')}</button>`;}
 function render(){
  const query=input.value.trim(),found=searchSettings(entries,query),searching=!!query;
  c.onQuery(input.value);host.querySelector('#clearSettingsSearch').hidden=!query;
  status.textContent=searching?(found.length?c.count(found.length):c.empty()):'';
  results.innerHTML=found.length?settingsGroups.map((group,index)=>{const rows=found.filter(entry=>entry.group===index);return rows.length?h`<section class="settings-category" aria-labelledby="settingsGroup${index}"><h3 id="settingsGroup${index}">${c.escape(t(group))}</h3><div class="settings-option-list">${rows.map(entry=>row(entry,searching)).join('')}</div></section>`:'';}).join(''):h`<div class="settings-empty">${c.icon('Search')}<h3>Nenhum ajuste encontrado</h3><p>Experimente outra palavra.</p></div>`;
 }
 const onClick=event=>{const button=event.target.closest('[data-settings-id]');if(!button)return;const entry=entries.find(item=>item.id===button.dataset.settingsId);if(!entry)return;if(entry.panel){event.preventDefault();event.stopPropagation();openPanel(entry);}else focusTarget(entry.focus);};
 host.addEventListener('click',onClick);input.addEventListener('input',render);host.querySelector('#clearSettingsSearch').addEventListener('click',()=>{input.value='';render();input.focus();});
 render();return {release,destroy(){release();host.removeEventListener('click',onClick);cancelAnimationFrame(frame);}};
}
export function styleSettingsDialog(panel){
 const modal=document.querySelector('.modal');if(!modal)return;
 modal.classList.add('settings-detail-dialog');modal.dataset.settingsPanel=panel;
 modal.closest('.modal-backdrop')?.classList.add('settings-detail-backdrop');
}
