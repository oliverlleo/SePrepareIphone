import {h,t} from '../localization/shared.js';

export function openAgendaDate({speech,openModal,button,escape}) {
  if(!speech)return;
  const date=new Date(speech.scheduledAt);
  const value=speech.scheduledAt&&Number.isFinite(date.getTime())
    ? new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
    : '';
  openModal(t(speech.scheduledAt?'Editar data na Agenda':'Adicionar à Agenda'),h`
    <div class="apple-simple-sheet">
      <p class="help apple-sheet-context">${escape(speech.title)}</p>
      <div class="field">
        <label for="scheduleDate">Data e horário</label>
        <input id="scheduleDate" type="datetime-local" value="${value}" aria-describedby="appleAgendaHelp">
      </div>
      <p class="help" id="appleAgendaHelp">${t('O SePrepare não envia lembretes no iPhone. Para receber um aviso, use o Calendário.')}</p>
      <div class="apple-sheet-actions">
        ${button('pwa-export-ics',t('Exportar para o Calendário'),'CalendarDays','secondary')}
        ${speech.scheduledAt?button('clear-schedule',t('Remover da Agenda'),'X','link'):''}
      </div>
    </div>`,button('save-schedule',t('Salvar na Agenda'),'Check'));
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
