import { BLOCK_LENGTH, CALIBRATION_CASES } from './planner.mjs';
import { REGIMES, clock } from './market.mjs';
import { btn, dollars, esc, field, heading, icon, metric, num, panelHead, tag } from './view.mjs';

export function plannerView(m,code,urgency,fit,plan) {
  const money=d=>dollars(d*1000);
  const halfway=plan.rows.slice(0,6).reduce((s,r)=>s+r.shares,0);
  const maximum=Math.max(m.target/12,...plan.rows.map(r=>r.shares));
  const evenHeight=100*(m.target/12)/maximum;
  const bars=plan.rows.map((r,i)=>`<div class="alloc-col"><div class="column"><div class="alloc-bar" style="height:${100*r.shares/maximum}%" title="${clock(i*BLOCK_LENGTH)} · ${num(r.shares)} shares"></div></div><small>${clock(i*BLOCK_LENGTH)}</small></div>`).join('');
  return `${heading('Execution planner','Choose how quickly to trade. A timing model divides the order across twelve half hour blocks.',btn('apply-plan','Send plan to studio','solid'))}
    <div class="planner-grid"><section class="panel">${panelHead('Trading schedule',tag(m.side.toUpperCase()+' '+num(m.target)+' shares'))}
      <div class="alloc-plot" role="img" aria-label="Planned trade sizes for twelve half hour blocks; exact values are in the schedule table.">
      <div class="alloc-even" style="bottom:calc(${evenHeight}% + ${20*(1-evenHeight/100)}px)"></div>${bars}</div>
      <div class="alloc-key"><span><i></i>Planned shares</span><span><i></i>Even schedule</span></div></section>
    <section class="panel">${panelHead('Timing preferences')}<div class="panel-body">
      ${field('Urgency · '+urgency.toFixed(2),`<input id="plan-urgency" type="range" min="0" max="2" step="0.05" value="${urgency}" aria-label="Timing urgency">`)}
      <div class="range-labels"><span>Patient</span><span>Finish earlier</span></div>
      ${field('Calibration code',`<input id="plan-code" type="text" value="${esc(code)}" maxlength="16">`)}
      <p class="footnote">Uses ${CALIBRATION_CASES} separate ${REGIMES[m.regime].name.toLowerCase()} markets to estimate trading cost and typical price movement. Your desk session is excluded.</p></div></section></div>
    <div class="research-metrics plan-metrics">${metric('Scheduled by 13:00',num(halfway)+' shares',Math.round(100*halfway/m.target)+'% of the order')}${metric('Estimated execution cost',money(plan.expense),'before the live simulation')}${metric('Timing risk penalty',money(plan.penalty),'model preference in dollar units')}</div>
    <section class="panel">${panelHead('Block by block',btn('export-plan',icon('export',15)+' Export plan','link'))}
      <div class="scroll-table"><table><thead><tr><th>Block begins</th><th>Trade shares</th><th>Remaining after block</th><th>Mean best depth</th><th>Typical price move</th><th>Estimated cost</th></tr></thead><tbody>
      ${plan.rows.map((r,i)=>`<tr><td>${clock(i*BLOCK_LENGTH)}</td><td>${num(r.shares)}</td><td>${num(r.remaining)}</td><td>${num(fit.depth[i])}</td><td>${money(fit.volatility[i])}/share</td><td>${money(r.cost)}</td></tr>`).join('')}</tbody></table></div>
      <p class="book-foot">The model compares every feasible schedule in 5% order increments, with at most 25% in any block. Greater urgency puts more weight on the shares left exposed to a price move. Actual trading costs arrive when the desk executes the schedule.</p></section>`;
}

