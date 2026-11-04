import {TextlintKernel} from '@textlint/kernel';
import TextPlugin from '@textlint/textlint-plugin-text';
import preset from 'textlint-rule-preset-japanese';
import Loader from 'kuromoji/src/loader/BrowserDictionaryLoader.js';
import {getTokenizer} from 'kuromojin';
import {gunzipSync} from 'fflate';
const kernel=new TextlintKernel(),unwrap=value=>value?.default||value;
let tokenizer;
async function initialize(files){process.env.KUROMOJIN_DIC_PATH='review-pack/';Loader.prototype.loadArrayBuffer=function(url,callback){try{const data=files[url.split(/[\\/]/).at(-1)];if(!data)throw Error('Dicionário japonês incompleto.');const decoded=gunzipSync(new Uint8Array(data));callback(null,decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength));}catch(error){callback(error);}};tokenizer=await getTokenizer({dicPath:'review-pack/'});}
async function check(text){const rules=Object.entries(preset.rules).map(([ruleId,rule])=>({ruleId,rule:unwrap(rule),options:preset.rulesConfig[ruleId]}));const result=await kernel.lintText(text,{ext:'.txt',filePath:'/document.txt',plugins:[{pluginId:'text',plugin:unwrap(TextPlugin)}],rules});return result.messages;}
self.SePrepareJapaneseReview={initialize,check};
