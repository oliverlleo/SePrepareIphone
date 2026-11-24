import {clone,newSpeech,isPart,validState,projectContentVersion,copyDocumentVersions} from '../protection/core.js';
import {withChangeOrigin} from '../protection/change-origin.js';
import {t} from '../localization/shared.js';
import {shareUxText as ux} from '../sharing/share-ux-i18n.js';

export async function receiveFilePreparation(c){
 const incoming=c.rt.incomingSpeech;if(!incoming||c.rt.importingSingleFile)return false;
 const participant=c.$('#incomingParticipant')?.value||'';
 if(isPart(incoming.content)&&!participant){c.toast(t('Escolha seu participante ou a opção Só acompanhar.'));c.$('#incomingParticipant')?.focus();return false;}
 c.rt.importingSingleFile=true;const release=c.lock?.()||(()=>{}),button=c.$('[data-action="save-incoming"]');if(button)button.disabled=true;
 const finishMetric=globalThis.SePrepareMetrics?.begin('compartilhamento','importar',{formato:'arquivo',tipo:isPart(incoming.content)?'demonstracao':'discurso'});
 let speech,adoption,staged=false,committed=false;
 try{
  if(c.persist(true)===false||!await c.flush())throw Error(ux('receiveError'));
  const state=c.getState();if(state.speeches.length>=2000)throw Error('Seu caderno atingiu o limite de preparações.');
  const selected=c.$('#incomingCategory')?.value||'',category=state.categories.some(item=>item.id===selected)?selected:'';
  adoption=c.getRhythms()?.receive(incoming.content);speech=Object.assign(newSpeech(category),adoption?.content||clone(incoming.content));
  if(speech.versions?.some(item=>item.id===incoming.previewVersionId))projectContentVersion(speech,incoming.previewVersionId);
  validState({schema:1,speeches:[speech],categories:[]});
  for(const version of speech.versions){version.createdAt=speech.createdAt;version.updatedAt=speech.updatedAt;if(isPart(speech)){const identity=incoming.identities?.[version.id]??participant;version.myParticipantId=version.participants.some(person=>person.id===identity)?identity:'';}}
  copyDocumentVersions(speech);state.speeches.unshift(speech);staged=true;
  if(withChangeOrigin('shared-import',()=>c.persist(true))===false||!await c.flush())throw Error(ux('receiveError'));
  committed=true;finishMetric?.('sucesso');c.onImported?.(speech);c.closeModal();c.rt.returnTo='home';await c.navigate('reader',speech.id);c.toast(t(isPart(speech)?'Parte salva no aparelho.':'Discurso salvo no aparelho.'));return true;
 }catch(error){
  finishMetric?.('erro');
  if(!committed){adoption?.rollback();if(staged){c.getState().speeches=c.getState().speeches.filter(item=>item.id!==speech.id);try{withChangeOrigin('shared-import',()=>c.persist(true));await c.flush();}catch{}}}
  c.toast(t(error.message));return false;
 }finally{c.rt.importingSingleFile=false;release();if(button?.isConnected)button.disabled=false;}
}
