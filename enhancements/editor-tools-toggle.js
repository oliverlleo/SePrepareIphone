const ICON_HIDE_TOOLS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="m9 16 3-3 3 3"/></svg>';
const ICON_SHOW_TOOLS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="m15 14-3 3-3-3"/></svg>';
const escapeAttr = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function mountEditorToolsToggle({shell, t}) {
  if (!shell) return;
  const toolbar = shell.querySelector('.toolbar');
  if (toolbar && !toolbar.querySelector('.editor-hide-tools-btn')) {
    const label = escapeAttr(t('Ocultar ferramentas'));
    const detail = escapeAttr(t('Oculta a barra de ferramentas para escrever na tela toda. Puxe no topo ou toque no botão para voltar.'));
    toolbar.insertAdjacentHTML('afterbegin', `<button type="button" class="tool editor-hide-tools-btn" data-action="hide-editor-tools" aria-label="${label}" title="${label}" data-help-title="${label}" data-help-detail="${detail}">${ICON_HIDE_TOOLS}</button><span class="tool sep editor-hide-tools-sep"></span>`);
  }
  if (!shell.querySelector('.editor-restore-tools-btn')) {
    const showLabel = escapeAttr(t('Mostrar ferramentas'));
    shell.insertAdjacentHTML('beforeend', `<button type="button" class="editor-restore-tools-btn" data-action="show-editor-tools" aria-label="${showLabel}" title="${showLabel}">${ICON_SHOW_TOOLS}</button>`);
  }
}
