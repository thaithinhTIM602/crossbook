import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MISSION as m, HORIZON, REGIMES } from '../market.mjs';
import { PRESETS, targetFraction, validSchedule, validStrategy } from '../strategy.mjs';
import { run,score } from '../engine.mjs';
import { BLOCKS, CALIBRATION_CASES, MAX_UNITS, UNITS, calibrate, optimize, walkCost } from '../planner.mjs';
import { cohort, pairedInterval, rank, summarize, train, validate, variants } from '../research.mjs';

test('training and holdout market identities are disjoint, balanced across regimes and reproducible',()=>{
  for(const count of [12,24,48]) {
    const a=cohort('STUDY12','train',count),b=cohort('STUDY12','hold',count*2);
    assert.deepEqual(a,cohort('STUDY12','train',count));
    assert.deepEqual(new Set([...a,...b].map(x=>x.seed)).size,count*3);
    for(const id of Object.keys(REGIMES))assert.equal(b.filter(x=>x.regime===id).length,count/2);
  }
});
test('candidate generation makes unique valid policies and handles edge cadences and clip sizes',()=>{
  for(const policy of [PRESETS.adaptive,{...PRESETS.even,clip:25,cadence:1},{...PRESETS.patient,clip:1500,cadence:8}]){
    const vs=variants(policy);
    assert.ok(vs.length<=9&&vs.length>=4);
    assert.equal(new Set(vs.map(v=>v.id)).size,vs.length);
    assert.ok(vs.every(v=>validStrategy(v.policy)));
  }
});
test('execution completion precedes cost when ranking incomplete training candidates',()=>{
  const rows=[{id:'cheap',stats:{completion:.5,mean:-100}},{id:'expensive',stats:{completion:1,mean:51}},
    {id:'closer',stats:{completion:.93,mean:-55}},{id:'best',stats:{completion:.96,mean:7}}];
  assert.deepEqual(rows.sort(rank).map(r=>r.id),['best','expensive','closer','cheap']);
});
test('paired statistics and bootstrap retain benchmark minus candidate sign',()=>{
  const rows=[1,3,5,7].map(n=>({algo:{bps:n,completion:1},benchmark:{bps:n+2,completion:1}}));
  const s=summarize(rows);
  assert.equal(s.mean,4);assert.equal(s.p90,7);assert.equal(s.delta,2);assert.equal(s.wins,4);
  assert.deepEqual(pairedInterval([2,2,2,2],'MATCH'),[2,2]);
});
test('frozen validation repeats, survives editor changes and replays match the corresponding test market',async()=>{
  const starting=structuredClone(PRESETS.adaptive);
  const study=await train({code:'FLOOR26',count:12,mission:m,policy:starting});
  const frozen=structuredClone(study.locked);
  starting.clip=1000;starting.rules=[];
  const result=await validate(study);
  assert.deepEqual(study.locked,frozen);
  assert.equal(study.table.length,9);assert.equal(result.rows.length,24);
  assert.deepEqual(result,await validate(study));
  for(const row of result.rows){
    const mission={...m,side:study.side,target:study.target,seed:row.seed,regime:row.regime};
    const s=score(run(mission,study.locked,{detail:true}));
    assert.equal(row.algo.bps,s.bps);assert.equal(row.algo.completion,s.completion);
  }
  assert.equal(result.stats.wins,22);assert.equal(result.stats.full,24);
});
test('a stopped study aborts without generating a validation result',async()=>{
  let complete=0;
  await assert.rejects(()=>train({code:'STOP26',count:12,mission:m,policy:PRESETS.even},done=>{complete=done},()=>complete>=2),/Stopped/);
  assert.equal(complete,2);
});
test('planner depth estimates include venue fees and opposite signed sell costs',()=>{
  const frame={mid:100000,books:[{buy:[{price:9999,qty:20}],sell:[{price:10001,qty:10}]},
    {buy:[{price:9999,qty:5}],sell:[{price:10001,qty:3}]}]};
  assert.equal(walkCost(frame,'buy',5),.056);assert.equal(walkCost(frame,'sell',7),.076);
  assert.equal(walkCost(frame,'buy',0),0);
});
test('timing optimizer finds a known minimum, meets the target and respects the cap',()=>{
  const fixture={target:5000,costs:Array.from({length:12},(_,b)=>Array.from({length:6},(_,u)=>(12-b)*u)),
    volatility:Array(12).fill(1)};
  const o=optimize(fixture,0);
  assert.deepEqual(o.units,[0,0,0,0,0,0,0,0,5,5,5,5]);
  assert.equal(o.objective,50);assert.equal(o.expense,50);assert.equal(o.penalty,0);
  assert.ok(validSchedule(o.units));assert.equal(o.rows.at(-1).remaining,0);
});
test('calibration uses independent scenarios and increasing urgency reduces inventory exposure',()=>{
  const fit=calibrate({...m,regime:'dry'},'MODEL26');
  assert.equal(fit.codes.length,CALIBRATION_CASES);assert.ok(!fit.codes.includes(m.seed));
  assert.equal(new Set(fit.codes).size,CALIBRATION_CASES);
  const patient=optimize(fit,0),urgent=optimize(fit,2);
  for(const o of [patient,urgent]){
    assert.equal(o.units.length,BLOCKS);assert.equal(o.units.reduce((a,b)=>a+b,0),UNITS);
    assert.ok(o.units.every(u=>u<=MAX_UNITS));assert.ok(Math.abs(o.objective-o.expense-o.penalty)<1e-7);
  }
  assert.ok(urgent.rows.reduce((n,r)=>n+r.remaining,0)<patient.rows.reduce((n,r)=>n+r.remaining,0));
  assert.ok(urgent.expense>=patient.expense-1e-8);
});
test('a custom schedule survives strategy validation and changes actual dispatch and order fills',()=>{
  const schedule=[0,0,0,0,0,0,0,0,5,5,5,5], policy={...PRESETS.even,schedule,rules:[]};
  assert.ok(validStrategy(policy));assert.ok(!validStrategy({...policy,schedule:[99]}));
  assert.equal(targetFraction(policy,36),0);assert.equal(targetFraction(policy,51),.125);assert.equal(targetFraction(policy,HORIZON),1);
  const planned=run(m,policy,{detail:true}), even=run(m,{...PRESETS.even,rules:[]},{detail:true});
  assert.equal(planned.history.find(f=>f.tick===36).filled,0);assert.ok(even.history.find(f=>f.tick===36).filled>0);
  assert.notDeepEqual(planned.fills,even.fills);
});

