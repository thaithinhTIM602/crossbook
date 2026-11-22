import test from 'node:test';
import assert from 'node:assert/strict';
import { Book, consolidated, expectedSweep, VENUES } from '../book.mjs';
import { DEFAULT_MISSION, HORIZON, WARMUP, makeTape, REGIMES, validMission } from '../market.mjs';
import { advance, createSession, reserved, run, score } from '../engine.mjs';
import { clone, PRESETS, resolveRule, routeOrders, validStrategy, targetFraction } from '../strategy.mjs';
import { csv, decodeSession, encodeSession, fresh, restore } from '../state.mjs';

const m=DEFAULT_MISSION, p=PRESETS.adaptive;
const order=(id,side,price,qty,ioc=false)=>({id,side,price,qty,ioc,child:null});
const mk=(side,venue=0)=>{const b=new Book(venue);for(const [i,price] of (side==='buy'?[9999,9998,9997]:[10001,10002,10003]).entries())b.submit(order(i,side,price,(i+1)*20));return b;};

test('best price fills first and older orders have priority at the same price',()=>{
  const b=new Book(0), prints=[];
  for(const [id,price,qty] of [['a',101,15],['b',100,20],['c',100,14],['d',99,17]])b.submit(order(id,'sell',price,qty));
  assert.equal(b.ahead('c','sell'),20);
  b.submit(order('market','buy',null,47),t=>prints.push([t.maker.id,t.price,t.qty]));
  assert.deepEqual(prints,[['d',99,17],['b',100,20],['c',100,10]]);
  assert.deepEqual(b.levels('sell').map(l=>[l.price,l.qty]),[[100,4],[101,15]]);
  assert.equal(b.ahead('c','sell'),0);
});
test('sell market orders walk bids in descending price; an IOC remainder never rests',()=>{
  const b=mk('buy'),fills=[];
  b.submit(order(8,'sell',9998,100,true),t=>fills.push([t.price,t.qty]));
  assert.deepEqual(fills,[[9999,20],[9998,40]]);
  assert.equal(b.best('sell'),null);assert.equal(b.best('buy'),9997);
  assert.ok(Number.isFinite(expectedSweep(b,'sell',500)));
  assert.equal(expectedSweep(b,'buy',5),Infinity);
});
test('partially filled limits rest at their original limit and cancellation removes just that order',()=>{
  const b=new Book(1);b.submit(order('a','sell',1000,40));
  const seated=b.submit(order('b','buy',1002,50));
  assert.ok(seated);assert.equal(b.best('buy'),1002);
  b.submit(order('c','buy',1002,3));assert.equal(b.ahead('c','buy'),10);
  assert.equal(b.cancel('b').qty,10);assert.equal(b.levels('buy')[0].qty,3);assert.equal(b.cancel('b'),null);
  assert.throws(()=>b.submit(order('bad','sell',101,0)));
});
test('consolidated midpoint includes half cents; smart routing includes fees and reachable latency',()=>{
  const b0=new Book(0),b1=new Book(1);
  for(const b of [b0,b1]){b.submit(order('bid','buy',9999,100));b.submit(order('ask','sell',10000,100));}
  assert.equal(consolidated([b0,b1]).mid,99995);
  assert.equal(routeOrders([b0,b1],'buy','take','smart',20,5)[0].venue,1);
  assert.equal(routeOrders([b0,b1],'buy','take','smart',20,1)[0].venue,0);
  assert.deepEqual(routeOrders([b0,b1],'buy','take','split',21,5).map(x=>x.qty),[11,10]);
  assert.equal(routeOrders([b0,b1],'buy','inside','arc',2,5)[0].price,9999);
});
test('venue latency delays fills and pending shares are reserved against the parent order',()=>{
  const policy={...PRESETS.even,route:'ion',cadence:1};
  const s=createSession(m);advance(s,policy);
  assert.equal(s.tick,1);assert.equal(s.filled,0);assert.ok(reserved(s)>0);
  assert.equal(s.children[0].arrived,null);
  advance(s,policy);assert.equal(s.children[0].arrived,2);assert.ok(s.filled>0);
});
test('a passive fill can occur while a cancellation is in flight',()=>{
  let found=false;
  for(let k=0;k<16&&!found;k++) {
    const s=run({...m,seed:'CANCEL'+k},PRESETS.patient,{detail:true});
    for(const j of s.journal.filter(j=>j.type==='cancel')) {
      const child=s.children.find(c=>c.id===j.id);
      const wait=VENUES[child.venue].latency;
      if(s.fills.some(f=>f.id===j.id&&f.tick>j.tick&&f.tick<=j.tick+wait)){found=true;break;}
    }
  }
  assert.ok(found);
});
test('full order accounting agrees with every individual fill, including maker rebates',()=>{
  const s=run(m,p,{detail:true}),a=score(s);
  assert.equal(a.filled,s.fills.reduce((n,f)=>n+f.qty,0));
  assert.equal(s.notional,s.fills.reduce((n,f)=>n+f.price*f.qty*10,0));
  assert.equal(s.fees,s.fills.reduce((n,f)=>n+VENUES[f.venue][f.role]*f.qty,0));
  assert.ok(s.fills.some(f=>f.fee<0));assert.ok(s.fills.some(f=>f.fee>0));
  assert.ok(s.children.every(c=>c.filled<=c.qty&&!['resting','pending','canceling'].includes(c.status)));
  assert.equal(reserved(s),0);assert.ok(s.children.every(c=>c.ended!==null));
});
test('a partially filled $50 buy has the documented $54 cost, including $40 on unfilled shares',()=>{
  const fixture={mission:{side:'buy',target:1000},filled:600,notional:50020*600,arrival:50000,
    quote:{mid:50100},fees:2000,makerQty:0,fillCount:1,venueQty:[600,0]};
  const buy=score(fixture);
  assert.deepEqual([buy.execution,buy.opportunity,buy.fees,buy.total,buy.completion],[12000,40000,2000,54000,.6]);
  assert.equal(buy.bps,10.8);
  const sell=score({...fixture,mission:{...fixture.mission,side:'sell'}});
  assert.deepEqual([sell.execution,sell.opportunity,sell.total],[-12000,-40000,-50000]);
});
test('an all wait strategy keeps the entire parent unfilled and incurs zero fees',()=>{
  const s=run(m,{...p,rules:[],fallback:'pause'}),a=score(s);
  assert.equal(s.children.length,0);assert.equal(a.filled,0);assert.equal(a.avg,null);
  assert.equal(a.fees,0);assert.equal(a.opportunity,m.target*(a.close-a.arrival));
});
test('first matching rule wins and invalid strategies, targets and horizons are rejected',()=>{
  const obs={left:4,lag:20,spread:10,pressure:0};
  assert.equal(resolveRule(p,obs).action,'sweep');
  assert.equal(resolveRule({...p,rules:[...p.rules].reverse()},obs).action,'post');
  assert.equal(validStrategy({...p,clip:-1}),false);assert.equal(validStrategy({...p,route:'unknown'}),false);
  assert.equal(validMission({...m,seed:'bad code!'}),false);assert.throws(()=>run(m,p,{until:73}));
});
test('a replay with identical instructions reproduces every order; switching preserves the entire prefix',()=>{
  const base=run(m,p,{detail:true}), noChange=run(m,p,{detail:true,fork:{at:24,policy:p}});
  assert.deepEqual(noChange.history,base.history);assert.deepEqual(noChange.children,base.children);assert.deepEqual(noChange.fills,base.fills);
  const forked=run(m,p,{detail:true,fork:{at:24,policy:PRESETS.even}});
  assert.deepEqual(forked.tape,base.tape);
  assert.deepEqual(forked.history.filter(f=>f.tick<=24),base.history.filter(f=>f.tick<=24));
  assert.deepEqual(forked.fills.filter(f=>f.tick<=24),base.fills.filter(f=>f.tick<=24));
  assert.notEqual(score(forked).total,score(base).total);
  const root=run(m,p,{detail:true,fork:{at:0,policy:PRESETS.patient}});
  assert.deepEqual(root.history,run(m,PRESETS.patient,{detail:true}).history);
});
test('future outside orders cannot change past screen data or past fills',()=>{
  const tape=makeTape(m.seed,m.regime), changed=structuredClone(tape);
  for(let i=WARMUP+19;i<changed.length;i++)changed[i].reference+=300;
  const a=run(m,p,{tape,until:18,detail:true}),b=run(m,p,{tape:changed,until:18,detail:true});
  assert.deepEqual(a.history,b.history);assert.deepEqual(a.fills,b.fills);assert.deepEqual(a.children,b.children);
});
test('saving or sharing a strategy with Unicode text reproduces the same run and rejects malformed links',()=>{
  const policy={...p,name:'Δ timing · café'},s={...fresh(m,policy),tick:17};
  const restored=decodeSession(encodeSession(s));
  assert.deepEqual(restored,s);assert.deepEqual(restore(JSON.stringify(s)),s);
  assert.equal(score(run(s.mission,s.policy,{until:s.tick})).total,score(run(restored.mission,restored.policy,{until:restored.tick})).total);
  for(const bad of ['%%','N',null,'a'.repeat(6001)])assert.equal(decodeSession(bad),null);
  assert.equal(restore({...s,tick:72.5}),null);
});
test('CSV preserves real line breaks, escaped quotes, and literal user text',()=>{
  const actual=csv([['a','b'],['last, first','one"two'],[3,'=instruction']]);
  assert.equal(actual,['"a","b"','"last, first","one""two"',`"3","'=instruction"`].join(String.fromCharCode(13,10)));
});
test('1,200 completed runs preserve share reservations, sorted uncrossed books and cash invariants',()=>{
  const regimes=Object.keys(REGIMES),policies=Object.values(PRESETS);
  for(let k=0;k<1200;k++) {
    const policy=clone(policies[k%3]);
    policy.route=['smart','arc','ion','split'][Math.floor(k/3)%4];
    if(k%7===0)policy.fallback='pause';
    const mission={seed:'ASSAY'+k,target:[1000,2500,5000,7500][Math.floor(k/7)%4],side:k%2?'sell':'buy',regime:regimes[Math.floor(k/2)%4]};
    const s=createSession(mission,{detail:false});
    while(advance(s,policy)){
      assert.ok(s.filled>=0&&s.filled+reserved(s)<=mission.target);
      assert.ok(s.quote.ask>=s.quote.bid);
      for(const b of s.books){
        assert.ok(b.best('sell')>b.best('buy'));
        for(const side of ['buy','sell']){
          const list=b.sides[side];
          assert.ok(list.every((o,i)=>o.qty>0&&(!i||(side==='buy'?list[i-1].price>=o.price:list[i-1].price<=o.price))));
        }
      }
    }
    const a=score(s);assert.equal(a.total,a.execution+a.fees+a.opportunity);
    assert.ok(Number.isSafeInteger(a.total));assert.equal(a.filled,s.children.reduce((n,c)=>n+c.filled,0));
    assert.equal(s.venueQty[0]+s.venueQty[1],s.filled);assert.equal(reserved(s),0);
  }
});

