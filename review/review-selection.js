// Selection is UI state only. Confidence and document content are never changed here.
export function canSelectReviewMatch(review,match){
 return Array.isArray(match?.replacements)&&match.replacements.length>0&&!(review.protect&&match.protected);
}
export function initialReviewSelection(review,match){
 return canSelectReviewMatch(review,match)&&(review.bulkMode==='all'||review.bulkMode!=='none'&&!!match.safe);
}
export function selectReviewMatches(review,mode){
 if(!review||!['all','none','safe'].includes(mode))return;
 review.bulkMode=mode;
 for(const match of review.matches)match.selected=canSelectReviewMatch(review,match)&&(mode==='all'||mode==='safe'&&!!match.safe);
}
export function reviewSettingsTitle(textLanguage,interfaceLanguage='pt-BR'){
 const titles={
  'pt-BR':{'pt-BR':'Revisão de português',en:'Revisão de inglês',es:'Revisão de espanhol',ja:'Revisão de japonês'},
  en:{'pt-BR':'Portuguese proofreading',en:'English proofreading',es:'Spanish proofreading',ja:'Japanese writing review'},
  es:{'pt-BR':'Revisión de portugués',en:'Revisión de inglés',es:'Revisión de español',ja:'Revisión de japonés'},
  ja:{'pt-BR':'ポルトガル語の校正',en:'英語の校正',es:'スペイン語の校正',ja:'日本語の校正'}
 };
 return (titles[interfaceLanguage]||titles['pt-BR'])[textLanguage]||(titles[interfaceLanguage]||titles['pt-BR'])['pt-BR'];
}
