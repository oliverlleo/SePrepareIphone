import {h,t,uiLocale} from '../localization/shared.js';

export function openAgendaDate({speech,openModal,button,icon,escape}) {
  if(!speech)return;
  const date=new Date(speech.scheduledAt);
  const value=speech.scheduledAt&&Number.isFinite(date.getTime())
    ? new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
    : '';
  openModal(t(speech.scheduledAt?'Editar data':'Adicionar à Agenda'),h`
    <div class="apple-simple-sheet apple-agenda-sheet">
      <p class="help apple-sheet-context">${escape(speech.title)}</p>
      <div class="field">
        <label for="scheduleDate">Data e horário</label>
        <div class="apple-agenda-date">
          <input id="scheduleDate" type="datetime-local" value="${value}">
          <span class="apple-agenda-date-display" aria-hidden="true">
            <span class="apple-agenda-date-value"></span>
            ${icon('CalendarDays')}
          </span>
        </div>
      </div>
      <details class="apple-agenda-more">
        <summary>${t('Opções da Agenda')}</summary>
        <div class="apple-agenda-options">
          ${button('pwa-export-ics',t('Exportar para o Calendário'),'CalendarDays','secondary')}
          ${speech.scheduledAt?h`<button type="button" class="btn secondary" data-action="clear-schedule">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect>
              <path d="M16 3v4M8 3v4M3 10h18m-10 3 4 4m0-4-4 4"></path>
            </svg>
            <span>${t('Remover da Agenda')}</span>
          </button>`:''}
        </div>
      </details>
    </div>`,button('save-schedule',t('Salvar na Agenda'),'Check'));
  const input=document.getElementById('scheduleDate');
  if(!input)return;
  input.closest('.modal')?.classList.add('apple-agenda-modal');
  const display=input.nextElementSibling.querySelector('.apple-agenda-date-value');
  const formatter=new Intl.DateTimeFormat(uiLocale(),{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  });
  const updateDate=()=>{
    const selected=new Date(input.value);
    display.textContent=Number.isFinite(selected.getTime())?formatter.format(selected):t('Escolher data e horário');
    display.classList.toggle('is-empty',!input.value);
  };
  input.addEventListener('input',updateDate);
  input.addEventListener('change',updateDate);
  updateDate();
}

export function readAgendaDate(field,toast) {
  if(!field?.value){
    toast(t('Escolha a data e o horário.'));
    return null;
  }
  const date=new Date(field.value).getTime();
  if(!Number.isFinite(date)){
    toast(t('Essa data não é válida.'));
    return null;
  }
  return date;
}

export function openLocalCopies({copies,openModal,button,icon,escape,formatDate,formatSize}) {
  const options=copies.map(copy=>h`
    <button type="button" class="sheet-option" data-action="pwa-snapshot-preview" data-id="${escape(copy.id)}">
      ${icon('History')}
      <span>
        <strong>${escape(formatDate(copy.at))}</strong>
        <small>${escape(formatSize(copy.bytes))}</small>
      </span>
      ${icon('ChevronRight')}
    </button>`).join('');
  openModal(t('Memória do aparelho'),h`
    <div class="apple-simple-sheet">
      <p class="help">${t('Seu caderno é salvo automaticamente neste aparelho.')}</p>
      <p class="help">${t('Exporte um backup para guardar uma cópia fora do SePrepare.')}</p>
      <div class="apple-sheet-actions">
        ${button('pwa-save-device-file',t('Exportar backup'),'Download','secondary')}
      </div>
      <div class="section-head"><h3>${t('Cópias de recuperação')}</h3><span>${copies.length}</span></div>
      ${options ? h`<div class="sheet-options">${options}</div>` : h`<p class="help">${t('Nenhuma cópia de recuperação ainda.')}</p>`}
    </div>`,button('close-modal',t('Concluir'),'Check'));
}
