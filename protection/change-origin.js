const key=Symbol.for('seprepare.change-origin.v1');
const context=globalThis[key]||(globalThis[key]={origin:'user'});
const origins=new Set(['user','drive','shared-import','manual-restore','local-configuration','internal','migration']);
export const currentChangeOrigin=()=>context.origin;
export function withChangeOrigin(origin,action){if(!origins.has(origin))throw Error('Origem de alteração inválida.');const previous=context.origin;context.origin=origin;try{return action();}finally{context.origin=previous;}}
