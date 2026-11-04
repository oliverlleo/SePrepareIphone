import assert from 'node:assert/strict';
import {reviewKey,rebaseReviewMatches} from '../enhancements/review-position.js';
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
const match=(offset,length=4)=>({offset,length,word:'erro',chosen:'certo',selected:true,customValue:'minha correção',rememberCustom:true,reviewKey:'k'+offset});
check('Correção maior desloca apenas ocorrências posteriores e conserva escolhas',()=>{const a=match(2),b=match(12),c=match(22);const out=rebaseReviewMatches([a,b,c],[{offset:12,length:4,replacement:'ajustado',match:b}]);assert.deepEqual(out.map(m=>m.offset),[2,26]);assert.equal(out[1].chosen,c.chosen);assert.equal(out[1].customValue,c.customValue);assert.equal(out[1].reviewKey,c.reviewKey);assert.equal(out[1].selected,true);assert.equal(c.offset,22);});
check('Remover ocorrência recalcula índices sem aplicar outras sugestões',()=>{const a=match(0),b=match(10);assert.deepEqual(rebaseReviewMatches([a,b],[{offset:0,length:4,replacement:'',match:a}]).map(m=>m.offset),[6]);});
check('Correções sobrepostas são retiradas após uma alteração',()=>{const a=match(5,8),inside=match(7,2),next=match(13,3);assert.deepEqual(rebaseReviewMatches([a,inside,next],[{offset:5,length:8,replacement:'x',match:a}]).map(m=>m.offset),[6]);});
check('Várias alterações mantêm offsets UTF-16 usados pelo editor',()=>{const a=match(2,2),b=match(10),c=match(20);assert.deepEqual(rebaseReviewMatches([a,b,c],[{offset:10,length:4,replacement:'á',match:b},{offset:2,length:2,replacement:'🙂a',match:a}]).map(m=>m.offset),[18]);});
check('Sem alteração preserva todas as ocorrências e não modifica a entrada',()=>{const a=match(8);assert.deepEqual(rebaseReviewMatches([a],[]),[a]);assert.notEqual(rebaseReviewMatches([a],[])[0],a);});
check('Cada cartão tem uma identidade estável e independente do índice visual',()=>{const a=match(4),b={offset:5};assert.equal(reviewKey(a),'k4');const key=reviewKey(b);assert.equal(reviewKey(b),key);assert.notEqual(reviewKey({offset:5}),key);});
console.log(JSON.stringify({success:true,checks}));
