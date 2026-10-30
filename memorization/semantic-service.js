// One lazy model worker shared by formatting and memorization. No startup model load.
let current;
export function getLocalSemanticWorker(){
 if(!current){const worker=new Worker('semantic-worker.js'),terminate=worker.terminate.bind(worker);worker.terminate=()=>{if(current===worker)current=null;terminate();};current=worker;}
 return current;
}
