import { direction, opposite, VENUES } from './book.mjs';
import { run } from './engine.mjs';
import { HORIZON, hash, safeCode, validMission } from './market.mjs';
import { PRESETS } from './strategy.mjs';

export const BLOCKS=12, UNITS=20, BLOCK_LENGTH=HORIZON/BLOCKS, MAX_UNITS=5, CALIBRATION_CASES=12;
const observer={...PRESETS.even,name:'Observe market',rules:[],fallback:'pause'};

// Merge the five visible levels from both venues, including taker fees.
// Each hypothetical sweep is a separate measurement against the same displayed snapshot.
export function walkCost(frame,side,qty) {
  if(!qty)return 0;
  const sign=direction(side), offers=[];
  frame.books.forEach((book,venue)=>{
    for(const level of book[opposite(side)])offers.push({
      unit:sign*(level.price*10-frame.mid)+VENUES[venue].taker,qty:level.qty,
    });
  });
  offers.sort((a,b)=>a.unit-b.unit);
  let left=qty,cost=0;
  for(const offer of offers){
    const matched=Math.min(left,offer.qty);
    cost+=matched*offer.unit;left-=matched;
    if(!left)break;
  }
  // A conservative extrapolation for size beyond the ten displayed venue levels.
  if(left)cost+=left*(offers.at(-1).unit+50);
  return cost/1000;
}
export function calibrate(mission,code) {
  if(!validMission(mission)||!safeCode(code))throw new Error('Invalid planner setup');
  const costs=Array.from({length:BLOCKS},()=>Array(MAX_UNITS+1).fill(0));
  const variance=Array(BLOCKS).fill(0), meanDepth=Array(BLOCKS).fill(0), codes=[];
  const unit=mission.target/UNITS;
  for(let sample=0;sample<CALIBRATION_CASES;sample++){
    let seed='P'+sample.toString(36).toUpperCase()+'X'+hash(code+'|planner|'+sample).toString(36).toUpperCase();
    if(seed===mission.seed)seed+='P';
    codes.push(seed);
    const session=run({...mission,seed},observer,{detail:true});
    const frames=session.history.filter(h=>h.tick>=0);
    for(let i=0;i<BLOCKS;i++){
      const start=i*BLOCK_LENGTH;
      const change=(frames[start+BLOCK_LENGTH].mid-frames[start].mid)/1000;
      variance[i]+=change*change;
      for(let j=0;j<BLOCK_LENGTH;j++){
        const frame=frames[start+j];
        meanDepth[i]+=frame.books.reduce((sum,b)=>sum+b[opposite(mission.side)][0].qty,0);
        for(let u=1;u<=MAX_UNITS;u++){
          const shares=unit*u;
          const slice=Math.floor(shares/BLOCK_LENGTH)+(j<shares%BLOCK_LENGTH?1:0);
          costs[i][u]+=walkCost(frame,mission.side,slice);
        }
      }
    }
  }
  return {codes,cases:CALIBRATION_CASES,target:mission.target,
    costs:costs.map(row=>row.map(v=>v/CALIBRATION_CASES)),
    volatility:variance.map(v=>Math.sqrt(v/CALIBRATION_CASES)),
    depth:meanDepth.map(v=>v/(CALIBRATION_CASES*BLOCK_LENGTH))};
}
export function optimize(calibration,urgency) {
  if(!Number.isFinite(urgency)||urgency<0||urgency>2)throw new Error('Urgency must be between zero and two');
  const unit=calibration.target/UNITS;
  const value=Array.from({length:BLOCKS+1},()=>Array(UNITS+1).fill(Infinity));
  const choice=Array.from({length:BLOCKS},()=>Array(UNITS+1).fill(0));
  value[BLOCKS][0]=0;
  const risk=(b,remaining)=>urgency*calibration.volatility[b]*(remaining*unit)**2/calibration.target;
  for(let b=BLOCKS-1;b>=0;b--){
    for(let left=0;left<=UNITS;left++){
      for(let now=0;now<=Math.min(left,MAX_UNITS);now++){
        const after=left-now;
        // Cost of this block plus the best feasible cost of completing the remaining blocks.
        const v=calibration.costs[b][now]+risk(b,after)+value[b+1][after];
        if(v<value[b][left]){value[b][left]=v;choice[b][left]=now;}
      }
    }
  }
  const units=[], rows=[];let left=UNITS,expense=0,penalty=0;
  for(let b=0;b<BLOCKS;b++){
    const x=choice[b][left];left-=x;units.push(x);
    const cost=calibration.costs[b][x], riskCost=risk(b,left);
    expense+=cost;penalty+=riskCost;
    rows.push({shares:x*unit,remaining:left*unit,cost,penalty:riskCost});
  }
  return {units,rows,expense,penalty,objective:value[0][UNITS]};
}

