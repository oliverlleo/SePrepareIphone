import {createDriveAuth} from './drive-auth.mjs';
const authorize=createDriveAuth();
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname.startsWith('/api/drive/'))return authorize(request,env);
  return env.ASSETS.fetch(request);
 }
};
