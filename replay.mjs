import { HORIZON, clock } from './market.mjs';
import { score } from './engine.mjs';
import { PRESETS } from './strategy.mjs';
import { btn, bps, chart, dollars, esc, field, heading, icon, num, panelHead, pct, perShare, select, tag } from './view.mjs';

export function replayView(s,policy,alt,fork,studio,choice) {
  const title=heading('Decision replay','Change the trading instructions at one point in the session and compare both outcomes.');
  if(s.tick!==HORIZON)return title+`<section class="panel replay-empty"><div class="freeze-icon">${icon('fork',28)}</div><h2>Finish the baseline session</h2><p>The desk is at ${clock(s.tick)}. Run it to the close, then choose a time and try a different strategy from that point.</p>${btn('baseline-close','Complete baseline and open replay','solid')}</section>`;
  const a=score(s),b=score(alt),gap=a.total-b.total;
  const fa=s.history.filter(h=>h.tick>=0), fb=alt.history.filter(h=>h.tick>=0);
  const divergence=fa.find((v,i)=>v.tick>fork&&(v.filled!==fb[i].filled||v.notional!==fb[i].notional||v.fees!==fb[i].fees));
  const names={...Object.fromEntries(Object.entries(PRESETS).map(([k,p])=>[k,p.name])),studio:'Studio · '+studio.name};
  return title+`<section class="panel fork-controls">${panelHead('Choose the decision point',tag(esc(s.mission.seed)))}<div class="fork-form">
    ${field('Switch strategy at '+clock(fork),`<input id="fork-at" type="range" min="0" max="71" value="${fork}" aria-label="Switch strategy at interval"><small>Interval ${fork} of 72</small>`)}
    ${field('Replacement strategy',select('fork-policy',names,choice))}<div class="field"><span>Original strategy</span><b>${esc(policy.name)}</b></div></div></section>
    <div class="verdict"><div class="freeze-icon">${icon('fork',24)}</div><div><div class="overline">Paired replay result</div><h2>${gap===0?'Both paths have the same trading cost.':`The switch ${gap>0?'saved':'cost'} ${dollars(Math.abs(gap))}.`}</h2>
    <p>${divergence?'Executed quantities or costs first differed at '+clock(divergence.tick)+'.':'The two paths have identical executed quantities, notionals and fees at each interval.'} Baseline completion ${pct(a.completion)}. Replay completion ${pct(b.completion)}.</p></div></div>
    <div class="replay-layout"><section class="panel">${panelHead('Order completion')}${chart([{color:'#116b5c',points:fa.map(f=>[f.tick,f.filled])},{color:'#8056b7',dash:true,points:fb.map(f=>[f.tick,f.filled])}],{dark:false,format:num,branch:fork,label:'Shares completed before and after switching strategies'})}
    <div class="light-key"><span>● Baseline</span><span>┄ Replay</span></div></section>
    <section class="panel">${panelHead('Execution comparison')}<div class="scroll-table"><table><thead><tr><th>Measure</th><th>Baseline</th><th>Replay</th></tr></thead><tbody>
    ${[['Filled',num(a.filled),num(b.filled)],['Average price',perShare(a.avg),perShare(b.avg)],['Maker shares',num(a.makerQty),num(b.makerQty)],['Total cost',bps(a.bps),bps(b.bps)],['Unfilled',num(a.unfilled),num(b.unfilled)]].map(([x,y,z])=>`<tr><td>${x}</td><td>${y}</td><td>${z}</td></tr>`).join('')}</tbody></table></div></section></div>
    <section class="panel attribution">${panelHead('Where the cost came from',btn('export-replay',icon('export',15)+' Export comparison','link'))}
    <div class="scroll-table"><table><thead><tr><th>Cost component</th><th>Baseline</th><th>Replay</th><th>Saving from switch</th></tr></thead><tbody>
    ${[['Price paid or received','execution'],['Unfilled shares at the closing midpoint','opportunity'],['Exchange fees less rebates','fees'],['Total relative to arrival','total']].map(([name,key])=>`<tr><td>${name}</td><td>${dollars(a[key])}</td><td>${dollars(b[key])}</td><td>${dollars(a[key]-b[key])}</td></tr>`).join('')}</tbody></table></div>
    <p class="book-foot">Both paths keep the same order history up to ${clock(fork)}, including messages in flight. Outside order intentions stay the same. Your trades can change the prices and queues that follow.</p></section>`;
}

