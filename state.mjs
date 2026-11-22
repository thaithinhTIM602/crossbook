import { DEFAULT_MISSION, HORIZON, validMission } from './market.mjs';
import { clone, PRESETS, validStrategy } from './strategy.mjs';

export const SESSION_KEY='crossbook.session.v1', STUDIO_KEY='crossbook.studio.v1';
export const STUDY_KEY='crossbook.study.v1';
export function fresh(mission=DEFAULT_MISSION,policy=PRESETS.adaptive) {
  return {version:1,mission:clone(mission),policy:clone(policy),tick:0};
}
export function restore(raw) {
  try { const data=typeof raw==='string'?JSON.parse(raw):raw;
    return data?.version===1 && validMission(data.mission) && validStrategy(data.policy) &&
      Number.isInteger(data.tick) && data.tick>=0 && data.tick<=HORIZON ?
      {version:1,mission:clone(data.mission),policy:clone(data.policy),tick:data.tick}:null;
  } catch {return null;}
}
export function encodeSession(data) {
  if(!restore(data))throw new Error('Invalid session');
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeSession(code) {
  try {
    if(typeof code!=='string'||code.length>6000||!/^[A-Za-z0-9_-]+$/.test(code))return null;
    const bytes=Uint8Array.from(atob(code.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    return restore(new TextDecoder().decode(bytes));
  } catch{return null;}
}
export function csv(rows) {
  return rows.map(row=>row.map(x=>{
    let s=String(x??'');
    if(typeof x==='string' && /^[=+@\-\t\r]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n');
}

