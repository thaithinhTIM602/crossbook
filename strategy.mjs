import { direction, expectedSweep, opposite, VENUES } from './book.mjs';
import { HORIZON } from './market.mjs';

export const SIGNALS = {
  left:{label:'Intervals left', op:'≤', min:0, max:72, unit:'intervals'},
  lag:{label:'Behind schedule', op:'≥', min:0, max:100, unit:'% of target'},
  spread:{label:'Market spread', op:'≥', min:0, max:50, unit:'cents'},
  pressure:{label:'Book pressure', op:'≥', min:-100, max:100, unit:'%'},
};
export const ACTIONS = { post:'Join best price', inside:'Improve by one cent', take:'Take liquidity', sweep:'Sweep remaining', pause:'Wait' };
export const ROUTES = { smart:'Smart router', arc:'Arc only', ion:'Ion only', split:'Split evenly' };
export const PRESETS = {
  adaptive:{ name:'Adaptive route', cadence:2, clip:220, route:'smart', fallback:'inside',
    rules:[{signal:'left',threshold:7,action:'sweep'},{signal:'lag',threshold:5,action:'take'},{signal:'spread',threshold:6,action:'post'}] },
  even:{ name:'Even schedule', cadence:3, clip:350, route:'smart', fallback:'take',
    rules:[{signal:'left',threshold:5,action:'sweep'}] },
  patient:{ name:'Queue first', cadence:2, clip:230, route:'smart', fallback:'post',
    rules:[{signal:'left',threshold:6,action:'sweep'},{signal:'lag',threshold:11,action:'take'}] },
};
export const clone = obj => JSON.parse(JSON.stringify(obj));
export function validSchedule(plan) {
  return Array.isArray(plan) && plan.length===12 && plan.every(n=>Number.isInteger(n)&&n>=0&&n<=5) &&
    plan.reduce((total,n)=>total+n,0)===20;
}
export function targetFraction(policy,tick) {
  const t=Math.max(0,Math.min(HORIZON,tick));
  if(!policy.schedule)return t/HORIZON;
  const block=Math.floor(t/6);
  const complete=policy.schedule.slice(0,block).reduce((sum,n)=>sum+n,0);
  const within=block<12?policy.schedule[block]*(t%6)/6:0;
  return (complete+within)/20;
}
export function validStrategy(s) {
  const integer = (n,lo,hi) => Number.isInteger(n) && n>=lo && n<=hi;
  return !!s && typeof s.name === 'string' && s.name.trim().length>0 && s.name.length<=32 &&
    integer(s.cadence,1,8) && integer(s.clip,25,1500) && Object.hasOwn(ROUTES,s.route) &&
    Object.hasOwn(ACTIONS,s.fallback) && (s.schedule===undefined||validSchedule(s.schedule)) && Array.isArray(s.rules) && s.rules.length<=6 && s.rules.every(r=>
      r && Object.hasOwn(SIGNALS,r.signal) && integer(r.threshold,SIGNALS[r.signal].min,SIGNALS[r.signal].max) && Object.hasOwn(ACTIONS,r.action));
}
export function observe(s,policy=PRESETS.even) {
  const topSize=side=>s.books.reduce((sum,b)=>sum+b.levels(side,2).reduce((n,l)=>n+l.qty,0),0);
  const bids=topSize('buy'), asks=topSize('sell');
  return { left:HORIZON-s.tick, lag:Math.max(0,100*(targetFraction(policy,s.tick)-s.filled/s.mission.target)),
    spread:Math.max(0,s.quote.spread), pressure:direction(s.mission.side)*100*(bids-asks)/Math.max(1,bids+asks) };
}
export function resolveRule(policy, observed) {
  for (const [i,rule] of policy.rules.entries()) {
    const hit = rule.signal === 'left' ? observed.left <= rule.threshold : observed[rule.signal] >= rule.threshold;
    if (hit) return { action:rule.action, rule:i+1, reason:SIGNALS[rule.signal].label+' '+SIGNALS[rule.signal].op+' '+rule.threshold };
  }
  return { action:policy.fallback, rule:0, reason:'Fallback rule' };
}
function limitPrice(book,side,action) {
  const same=book.best(side), other=book.best(opposite(side));
  if (action==='post') return same;
  const sign=direction(side);
  return sign*(other-same)>1 ? same+sign : same;
}
function passiveCost(book,side,price) {
  const atPrice=book.levels(side,5).find(l=>l.price===price);
  const queue=atPrice?.qty||0;
  return direction(side)*price*10 + VENUES[book.venue].maker + Math.min(7,queue/70);
}
export function routeOrders(books,side,action,route,qty,left) {
  if (!qty || action==='pause') return [];
  const active=action==='take'||action==='sweep';
  const paths=books.map(book=>{
    const venue=VENUES[book.venue];
    const price=active?null:limitPrice(book,side,action);
    const cost=(active?expectedSweep(book,side,qty):passiveCost(book,side,price)) + (venue.latency-1)*1.5;
    return {venue:book.venue,price,cost,qty};
  });
  if(route==='arc'||route==='ion')return [paths[route==='arc'?0:1]];
  if(route==='split') {
    const half=Math.ceil(qty/2);
    return [{...paths[0],qty:half},{...paths[1],qty:qty-half}].filter(p=>p.qty>0);
  }
  const reachable=paths.filter(p=>VENUES[p.venue].latency<=left);
  return [(reachable.length?reachable:paths).sort((a,b)=>a.cost-b.cost||a.venue-b.venue)[0]];
}

