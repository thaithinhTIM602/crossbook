import { Book, consolidated, direction, opposite, VENUES } from './book.mjs';
import { HORIZON, WARMUP, makeTape, validMission } from './market.mjs';
import { observe, resolveRule, routeOrders, targetFraction, validStrategy } from './strategy.mjs';

function record(s,type,text,id=null) {
  if(s.detail)s.journal.push({tick:s.tick,type,text,id});
}
function trade(s, t) {
  s.tradeCount++;
  const child=t.maker.child||t.taker.child;
  const role=t.maker.child?'maker':'taker';
  if(s.detail) {
    s.tapePrints.push({tick:s.tick,venue:t.venue,side:t.taker.side,qty:t.qty,price:t.price,ours:!!child});
    if(s.tapePrints.length>50)s.tapePrints.shift();
  }
  if(!child)return;
  const fee=VENUES[t.venue][role]*t.qty;
  child.filled+=t.qty;
  if(child.filled===child.qty){child.status='filled';child.ended=s.tick;}
  s.filled+=t.qty;
  s.notional+=t.price*10*t.qty;
  s.fees+=fee;
  s.fillCount++;
  s.venueQty[t.venue]+=t.qty;
  if(role==='maker') s.makerQty+=t.qty;
  if(s.detail)s.fills.push({tick:s.tick,id:child.id,venue:t.venue,role,qty:t.qty,price:t.price,fee,rule:child.reason});
  const impulse=direction(s.mission.side)*t.qty*(role==='taker'?.035:.0045);
  s.impact=Math.max(-45,Math.min(45,s.impact+impulse));
}
function submit(s,venue,order) {
  return s.books[venue].submit(order,t=>trade(s,t));
}
function outside(s,venue,side,price,qty,tag,expires) {
  return submit(s,venue,{id:++s.sequence,side,price,qty,tag,expires,child:null,ioc:price===null});
}
function clearCross(s) {
  // A displayed price advantage can trade across venues. Each leg uses its own local queue.
  for(const [bidBook,askBook] of [[s.books[0],s.books[1]],[s.books[1],s.books[0]]]){
    while(bidBook.best('buy')>askBook.best('sell') && askBook.best('sell')!==null){
      const qty=Math.min(bidBook.sides.buy[0].qty,askBook.sides.sell[0].qty);
      outside(s,askBook.venue,'buy',null,qty,'arbitrage',s.tick);
      outside(s,bidBook.venue,'sell',null,qty,'arbitrage',s.tick);
    }
  }
}
function outsideFlow(s,row) {
  s.impact*=.83;
  const center=Math.round(row.reference+s.impact);
  for(const [v,f] of row.venues.entries()){
    const book=s.books[v];
    book.withdraw(o=>!o.child && (o.expires<=s.tick || o.tag==='backstop'));
    const local=center+f.offset;
    for(const side of ['buy','sell']){
      const sign=side==='buy'?-1:1;
      outside(s,v,side,local+sign*(48+v*5),10000,'backstop',s.tick+1);
      for(const [i,size] of f.quotes.entries()){
        const px=local+sign*(f.half+i*(v+2));
        outside(s,v,side,px,size[side==='buy'?'bid':'ask'],'maker',s.tick+2+(i+f.retire)%3);
      }
    }
    const join=local+(f.postSide==='buy'?-1:1)*(f.half+f.postOffset);
    outside(s,v,f.postSide,join,f.postQty,'resting',s.tick+5);
    if(f.take)outside(s,v,f.takeSide,null,f.takeQty,'flow',s.tick);
  }
  clearCross(s);
}

const liveChild = c=>['pending','resting','canceling'].includes(c.status);
export function reserved(s) {
  return s.children.reduce((n,c)=>n+(liveChild(c)?c.qty-c.filled:0),0);
}
function requestCancel(s,c,why) {
  if(c.status!=='resting')return;
  c.status='canceling';
  s.messages.push({kind:'cancel',child:c,due:s.tick+VENUES[c.venue].latency});
  record(s,'cancel','Cancellation requested · '+why,c.id);
}
function dispatch(s,policy) {
  const observed=observe(s,policy);
  if(s.tick%policy.cadence!==0 && observed.left>2)return;
  const decision=resolveRule(policy,observed);
  s.lastDecision={tick:s.tick,...decision};
  const aggressive=['take','sweep'].includes(decision.action);
  for(const c of s.children){
    if(c.status!=='resting')continue;
    const stale=s.tick-c.arrived>=5 && c.price!==s.books[c.venue].best(s.mission.side);
    if(aggressive || stale || s.tick-c.arrived>=11 || decision.action==='pause'){
      requestCancel(s,c,aggressive?'new aggressive rule':decision.action==='pause'?'wait rule':'stale quote');
    }
  }
  const open=reserved(s);
  const free=s.mission.target-s.filled-open;
  if(free<=0||decision.action==='pause')return;
  const due=Math.ceil(s.mission.target*targetFraction(policy,s.tick+policy.cadence));
  const planned=decision.action==='sweep'?free:Math.min(policy.clip,Math.max(0,due-open-s.filled));
  const qty=Math.min(free,planned);
  if(qty<=0)return;
  for(const route of routeOrders(s.books,s.mission.side,decision.action,policy.route,qty,observed.left)){
    const c={id:'C'+(++s.childSeq), venue:route.venue, price:route.price, qty:route.qty, filled:0,
      born:s.tick, arrived:null, ended:null, status:'pending', action:decision.action, reason:decision.reason};
    s.children.push(c);
    s.messages.push({kind:'new',child:c,due:s.tick+VENUES[c.venue].latency});
    record(s,'send',VENUES[c.venue].short+' · '+decision.reason,c.id);
  }
}
function deliver(s) {
  const next=[];
  for(const msg of s.messages){
    const c=msg.child;
    if(msg.due>s.tick){next.push(msg);continue;}
    if(msg.kind==='cancel'){
      if(c.status==='canceling'){
        s.books[c.venue].cancel(c.id);
        c.status='cancelled';c.ended=s.tick;
        record(s,'cancelled','Exchange acknowledged cancellation',c.id);
      }
    }else if(c.status==='pending'){
      c.arrived=s.tick;
      const order={id:c.id,side:s.mission.side,price:c.price,qty:c.qty-c.filled,child:c,ioc:c.price===null};
      const resting=submit(s,c.venue,order);
      if(resting)c.status='resting';
      else {
        c.status=c.filled===c.qty?'filled':'cancelled';
        c.ended=s.tick;
      }
      record(s,c.status,c.status==='resting'?'Remaining shares entered the queue':'Immediate execution completed',c.id);
    }
  }
  s.messages=next;
}
function expire(s) {
  for(const c of s.children)if(liveChild(c)){
    s.books[c.venue].cancel(c.id);
    c.status='expired';c.ended=s.tick;
  }
  s.messages=[];
}
function snapshot(s) {
  s.quote=consolidated(s.books);
  if(!s.detail)return;
  const committed=reserved(s);
  s.history.push({
    tick:s.tick,bid:s.quote.bid,ask:s.quote.ask,mid:s.quote.mid,filled:s.filled,fees:s.fees,
    notional:s.notional,reserved:committed,children:s.children.length,fillCount:s.fillCount,
    books:s.books.map(b=>({buy:b.levels('buy',5),sell:b.levels('sell',5)})),
  });
}
export function createSession(mission,{detail=true,tape=null}={}) {
  if(!validMission(mission))throw new Error('Invalid mission');
  const s={mission:{...mission},detail,tape:tape||makeTape(mission.seed,mission.regime),
    books:[new Book(0),new Book(1)],tick:0,sequence:0,childSeq:0,children:[],messages:[],
    filled:0,notional:0,fees:0,makerQty:0,venueQty:[0,0],tradeCount:0,fillCount:0,impact:0,
    fills:[],journal:[],tapePrints:[],history:[],lastDecision:null};
  for(let t=-WARMUP;t<=0;t++){
    s.tick=t;outsideFlow(s,s.tape[t+WARMUP]);snapshot(s);
  }
  s.arrival=s.quote.mid;
  return s;
}
export function advance(s,policy) {
  if(s.tick>=HORIZON)return false;
  dispatch(s,policy);
  s.tick++;
  outsideFlow(s,s.tape[s.tick+WARMUP]);
  deliver(s);
  clearCross(s);
  if(s.tick===HORIZON)expire(s);
  snapshot(s);
  return true;
}
export function run(mission,policy,{until=HORIZON,detail=false,tape=null,fork=null}={}) {
  if(!validStrategy(policy)||!Number.isInteger(until)||until<0||until>HORIZON)throw new Error('Invalid experiment');
  if(fork && (!validStrategy(fork.policy)||!Number.isInteger(fork.at)||fork.at<0||fork.at>HORIZON))throw new Error('Invalid replay');
  const s=createSession(mission,{detail,tape});
  while(s.tick<until)advance(s,fork && s.tick>=fork.at?fork.policy:policy);
  return s;
}
export function score(s) {
  const sign=direction(s.mission.side), unfilled=s.mission.target-s.filled;
  const execution=sign*(s.notional-s.filled*s.arrival);
  const opportunity=sign*unfilled*(s.quote.mid-s.arrival);
  const total=execution+opportunity+s.fees;
  return {target:s.mission.target,filled:s.filled,unfilled,completion:s.filled/s.mission.target,
    execution,opportunity,fees:s.fees,total,bps:10000*total/(s.mission.target*s.arrival),
    avg:s.filled?s.notional/s.filled:null,arrival:s.arrival,close:s.quote.mid,
    makerQty:s.makerQty,fillCount:s.fillCount,venueQty:[...s.venueQty]};
}

