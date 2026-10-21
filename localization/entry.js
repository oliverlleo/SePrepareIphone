import * as locale from './i18n.js';
window.SPLocale=locale;
try{locale.setLanguage(localStorage.getItem('seprepare-ui-language'));}catch{locale.setLanguage('pt-BR');}
