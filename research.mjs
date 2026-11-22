import { DEFAULT_MISSION, REGIMES, hash, makeTape, random, safeCode, validMission } from './market.mjs';
import { run, score } from './engine.mjs';
import { clone, PRESETS, validStrategy } from './strategy.mjs';

export const mean = list=>list.reduce((a,b)=>a+b,0)/list.length;
const bounded=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function cohort(code,group,count) {
  if(!safeCode(code) || !['train','hold'].includes(group) || !Number.isInteger(count) || count<1 || count>96)throw new Error('Invalid cohort');
  const types=Object.keys(REGIMES);
  const offset=hash(code+group)%4;
  return Array.from({length:count},(_,i)=>({
    // The split prefix prevents even a hash collision from overlapping the two groups.
    seed:(group==='train'?'T':'H')+i.toString(36).toUpperCase()+'X'+hash(code+':'+group+':'+i).toString(36).toUpperCase(),
    regime:types[(offset+i)%4],
  }));
}
export function variants(policy) {
  if(!validStrategy(policy))throw new Error('Invalid starting strategy');
  const results=[];
  for(const delta of [0,-1,1])for(const scale of [1,.65,1.5]){
    const policyCopy=clone(policy);
    policyCopy.cadence=bounded(policy.cadence+delta,1,8);
    policyCopy.clip=bounded(Math.round(policy.clip*scale/5)*5,25,1500);
    const id=policyCopy.cadence+'x'+policyCopy.clip;
    if(!results.some(v=>v.id===id))results.push({id,policy:policyCopy});
  }
  return results;
}
function compact(s) {
  const q=score(s);
  return {bps:q.bps,completion:q.completion,filled:q.filled,fee:q.fees};
}
export function summarize(rows) {
  const sorted=rows.map(r=>r.algo.bps).sort((a,b)=>a-b);
  return { mean:mean(sorted), p90:sorted[Math.ceil(.9*sorted.length)-1], completion:mean(rows.map(r=>r.algo.completion)),
    delta:mean(rows.map(r=>r.benchmark.bps-r.algo.bps)),wins:rows.filter(r=>r.algo.bps<r.benchmark.bps).length,
    full:rows.filter(r=>r.algo.completion===1).length,n:rows.length };
}
export function rank(a,b) {
  const eligibleA=a.stats.completion>=.95, eligibleB=b.stats.completion>=.95;
  if(eligibleA!==eligibleB)return eligibleA?-1:1;
  if(!eligibleA && a.stats.completion!==b.stats.completion)return b.stats.completion-a.stats.completion;
  return a.stats.mean-b.stats.mean || a.id.localeCompare(b.id);
}
export function pairedInterval(values,seed) {
  const rng=random(seed+':bootstrap');
  const boot=Array.from({length:800},()=>{
    let sum=0;
    for(let i=0;i<values.length;i++)sum+=values[Math.floor(rng()*values.length)];
    return sum/values.length;
  }).sort((a,b)=>a-b);
  return [boot[19],boot[779]];
}
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function train({code,count,mission,policy},report=()=>{},stop=()=>false) {
  if(![12,24,48].includes(count)||!validMission(mission)||!validStrategy(policy))throw new Error('Invalid training setup');
  const cases=cohort(code,'train',count), candidates=variants(policy);
  const rows=candidates.map(()=>[]);
  for(const [i,scenario] of cases.entries()){
    if(stop())throw new Error('Stopped');
    const m={...mission,...scenario}, tape=makeTape(m.seed,m.regime);
    const benchmark=compact(run(m,PRESETS.even,{tape}));
    candidates.forEach((v,k)=>{
      rows[k].push({...scenario,benchmark,algo:compact(run(m,v.policy,{tape}))});
    });
    report(i+1,count);await yieldUI();
  }
  const table=candidates.map((v,i)=>({...v,stats:summarize(rows[i])})).sort(rank);
  const champion=table[0];
  return {code,count,side:mission.side,target:mission.target,starting:clone(policy),table,locked:clone(champion.policy),id:champion.id};
}
export async function validate(study,report=()=>{},stop=()=>false) {
  if(!study||![12,24,48].includes(study.count)||!validStrategy(study.locked))throw new Error('Train and freeze a strategy first');
  const cases=cohort(study.code,'hold',study.count*2), rows=[];
  for(const [i,scenario] of cases.entries()){
    if(stop())throw new Error('Stopped');
    const m={...DEFAULT_MISSION,...scenario,side:study.side,target:study.target};
    const tape=makeTape(m.seed,m.regime);
    rows.push({...scenario,benchmark:compact(run(m,PRESETS.even,{tape})),algo:compact(run(m,study.locked,{tape}))});
    report(i+1,cases.length);await yieldUI();
  }
  const stats=summarize(rows);
  const regimes=Object.fromEntries(Object.keys(REGIMES).map(r=>[r,summarize(rows.filter(x=>x.regime===r))]));
  return {rows,stats,regimes,interval:pairedInterval(rows.map(x=>x.benchmark.bps-x.algo.bps),study.code)};
}

