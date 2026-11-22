import { train, validate } from './research.mjs';
self.onmessage=async ({data})=>{
  try {
    const progress=(done,total)=>self.postMessage({type:'progress',done,total});
    const result=data.type==='train'?await train(data.input,progress):await validate(data.input,progress);
    self.postMessage({type:'done',result});
  } catch(error) { self.postMessage({type:'error',message:error.message}); }
};

