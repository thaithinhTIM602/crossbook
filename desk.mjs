import { VENUES } from './book.mjs';
import { clock, HORIZON } from './market.mjs';
import { reserved, score } from './engine.mjs';
import { ACTIONS, targetFraction } from './strategy.mjs';
import { bps, btn, chart, dollars, esc, heading, icon, metric, num, panelHead, pct, perShare, price, tag } from './view.mjs';

function chartPanel(s,policy,chartType,playing) {
  const quote=s.quote, progress=chartType==='progress', start=s.arrival;
  const visible=progress?s.history.filter(f=>f.tick>=0):s.history;
  const lines=progress?[
    {color:'#6fe1ba',points:visible.map(f=>[f.tick,f.filled])},
    {color:'#aeb8f7',dash:true,points:visible.map(f=>[f.tick,s.mission.target*targetFraction(policy,f.tick)])},
  ]:[{color:'#72e6bd',points:visible.map(f=>[f.tick,f.mid/1000])}];
  const markers=progress?[]:s.fills.map(f=>({x:f.tick,y:f.price/100,text:`${clock(f.tick)} · ${num(f.qty)} at ${price(f.price)}`}));
  const done=s.tick===HORIZON, move=quote.mid-start;
  return `<section class="market-chart"><div class="chart-heading"><div><div class="market-symbol"><span class="asset-mark">M</span><b>MICA</b><span>Mica Systems</span></div>
    <div class="market-value">${progress?num(s.filled):perShare(quote.mid)}<small class="${move>=0?'up':'down'}">${progress?'shares filled':(move>=0?'+':'')+(move/1000).toFixed(3)+' since open'}</small></div></div>
    <div class="dark-switch">${btn('chart-price','Price','',`aria-pressed="${!progress}"`)}${btn('chart-progress','Progress','',`aria-pressed="${progress}"`)}</div></div>
    <div class="chart-frame">${chart(lines,{format:progress?v=>num(v):v=>v.toFixed(2),markers,reference:progress?null:s.arrival/1000,label:progress?'Completed shares and target schedule by time':'Observed midpoint price history and actual desk fills'})}</div>
    <div class="chart-key"><span><i></i>${progress?'Shares filled':'Midpoint'}</span><span class="secondary-line"><i></i>${progress?'Target schedule':'Arrival price'}</span>${progress?'':'<span class="dot-key"><i></i>Your fills</span>'}</div>
    <div class="playbar">${done?btn('to-replay',icon('fork',16)+' Open decision replay','primary'):btn('auto',icon(playing?'pause':'play',15)+(playing?' Pause':' Play market'),'primary')}
    ${btn('step',icon('step',15)+' Step','dark-btn',done?'disabled':'')}${btn('skip','+6 steps','dark-btn',done?'disabled':'')}
    ${btn('close-market','Run to close','text-dark',done?'disabled':'')}</div></section>`;
}
function mandate(s,policy) {
  const p=s.filled/s.mission.target, working=reserved(s);
  return `<section class="panel mandate">${panelHead('Order mandate',icon('wallet',19))}
    <div class="mandate-body"><div class="overline">Parent order</div><div class="order-quantity"><span class="side ${s.mission.side}">${s.mission.side.toUpperCase()}</span> ${num(s.mission.target)} <small>shares</small></div>
    <div class="progress-label"><b>${num(s.filled)} filled</b><span>${pct(p)}</span></div><div class="progress-track"><i style="width:${p*100}%"></i></div>
    <dl class="terms"><div><dt>Working at exchanges</dt><dd>${num(working)} shares</dd></div><div><dt>Arrival midpoint</dt><dd>${perShare(s.arrival)}</dd></div><div><dt>Deadline</dt><dd>16:00</dd></div><div><dt>Strategy</dt><dd>${esc(policy.name)}</dd></div></dl>
    ${btn('to-studio',icon('studio',16)+' Open strategy studio','outline-wide')}</div></section>`;
}
function bookPanel(book) {
  const venue=VENUES[book.venue], bids=book.levels('buy',5),asks=book.levels('sell',5);
  const max=Math.max(...bids.concat(asks).map(x=>x.qty),1);
  const row=(l,side)=>l?`<td class="size ${side}" style="--depth:${Math.max(2,100*l.qty/max)}%">${num(l.qty)}${l.own?'<sup title="Includes your shares">●</sup>':''}</td>`:'<td>·</td>';
  return `<section class="panel depth"><div class="panel-head"><div class="venue-title"><span class="venue-icon v${book.venue}">${book.venue?'II':'A'}</span><h2>${venue.name}</h2></div><span class="muted-small">${venue.latency} interval${venue.latency>1?'s':''} to route</span></div>
    <table><thead><tr><th scope="col">Bid size</th><th scope="col">Bid price</th><th scope="col">Ask price</th><th scope="col">Ask size</th></tr></thead><tbody>${Array.from({length:5},(_,i)=>`<tr>${row(bids[i],'bid')}<td class="bid-price">${bids[i]?price(bids[i].price):'·'}</td><td class="ask-price">${asks[i]?price(asks[i].price):'·'}</td>${row(asks[i],'ask')}</tr>`).join('')}</tbody></table>
    <p class="book-foot">Maker ${venue.maker<0?'rebate':'fee'} $0.001/share <span>·</span> Taker fee $${(venue.taker/1000).toFixed(3)}/share</p></section>`;
}
function table(headers,rows) {
  return `<div class="scroll-table"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function blotter(s,tab) {
  let rows,headers,empty='';
  if(tab==='orders') {
    headers=['Child','Sent','Venue','Instruction','Shares','Filled','Status'];
    rows=[...s.children].reverse().slice(0,12).map(c=>`<tr><td>${btn('inspect-child',esc(c.id),'link',`data-id="${c.id}"`)}</td><td>${clock(c.born)}</td><td>${VENUES[c.venue].short}</td><td>${c.price===null?'Market':price(c.price)+' limit'}</td><td>${num(c.qty)}</td><td>${num(c.filled)}</td><td>${esc(c.status)}</td></tr>`);
    empty='Your strategy splits the parent order into smaller child orders. Play one interval to see the first instruction.';
  } else if(tab==='fills') {
    headers=['Time','Child','Venue','Role','Shares','Fill price','Net fee'];
    rows=[...s.fills].reverse().slice(0,12).map(f=>`<tr><td>${clock(f.tick)}</td><td>${btn('inspect-child',esc(f.id),'link',`data-id="${f.id}"`)}</td><td>${VENUES[f.venue].short}</td><td>${f.role}</td><td>${num(f.qty)}</td><td>${price(f.price)}</td><td>${dollars(f.fee)}</td></tr>`);
    empty='Your executions appear as soon as another order matches yours.';
  } else {
    headers=['Time','Venue','Aggressor','Shares','Trade price','Desk'];
    rows=[...s.tapePrints].reverse().slice(0,10).map(t=>`<tr><td>${clock(t.tick)}</td><td>${VENUES[t.venue].short}</td><td><span class="trade-side ${t.side}">${t.side}</span></td><td>${num(t.qty)}</td><td>${price(t.price)}</td><td>${t.ours?'Your order':'Market'}</td></tr>`);
  }
  return `<section class="panel blotter">${panelHead('Activity',btn('export-fills',icon('export',15)+' Export fills','link',s.fills.length?'':'disabled'))}
    <div class="section-tabs">${[['tape','Trade tape'],['orders','Child orders'],['fills','Your fills']].map(([v,n])=>btn('blotter',n,'',`data-tab="${v}" aria-pressed="${v===tab}"`)).join('')}</div>
    ${rows.length?table(headers,rows):`<p class="empty">${empty}</p>`}</section>`;
}
export function deskView(s,policy,{chartType,blotterTab,playing}) {
  const q=score(s), done=s.tick===HORIZON;
  const side=s.mission.side==='buy'?'Buy':'Sell';
  const caption=s.tick===0?`${side} ${num(q.target)} MICA shares by 16:00. Press Step to follow the first order.`:done?'The closing bell has rung. Compare the result with a different trading decision.':'Your strategy is routing orders while the two exchanges match buyers and sellers.';
  return `${heading('Execution desk',caption,tag(done?'Session closed':s.tick===0?'Ready to trade':playing?'Market running':'Market paused',done?'':'live'))}
    <div class="metrics-strip">${metric('Session time',clock(s.tick),`${s.tick} of 72 intervals`)}${metric('Shares filled',num(s.filled),`of ${num(q.target)} shares`)}${metric('Average fill',q.avg===null?'—':perShare(q.avg),'per executed share')}${metric(done?'Final trading cost':'Trading cost so far',s.tick===0?'—':bps(q.bps),done?'relative to arrival':'unfinished shares marked at midpoint')}</div>
    <div class="main-grid">${chartPanel(s,policy,chartType,playing)}${mandate(s,policy)}</div>
    <div class="section-lead"><div><h2>Exchange depth</h2><p>Shares waiting at the five best prices on each venue.</p></div>${tag('Live order books')}</div>
    <div class="pair">${s.books.map(bookPanel).join('')}</div>${blotter(s,blotterTab)}`;
}
export function childView(s,id) {
  const c=s.children.find(x=>x.id===id);
  if(!c)return '<h2 id="dialog-title">Order unavailable</h2>';
  const fills=s.fills.filter(f=>f.id===id);
  const events=s.journal.filter(j=>j.id===id).map(j=>({tick:j.tick,text:j.text}));
  for(const f of fills)events.push({tick:f.tick,text:`Filled ${num(f.qty)} shares at ${price(f.price)} as ${f.role}.`});
  events.sort((a,b)=>a.tick-b.tick);
  return `<div class="overline">Order audit</div><h2 id="dialog-title">Child order ${esc(id)}</h2><p>${esc(c.reason)} selected “${ACTIONS[c.action]}” on ${VENUES[c.venue].name}.</p>
    <dl class="terms">${[['Sent',clock(c.born)],['Arrived',c.arrived===null?'In transit':clock(c.arrived)],['Limit',c.price===null?'Market order':price(c.price)],['Status',c.status],['Executed',num(c.filled)+' of '+num(c.qty)],['Ahead at the same price',num(s.books[c.venue].ahead(c.id,s.mission.side))+' shares']].map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    <h3>Lifecycle</h3><ul class="timeline">${events.map(j=>`<li><time>${clock(j.tick)}</time>${esc(j.text)}</li>`).join('')}</ul>`;
}

