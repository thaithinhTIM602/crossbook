import { ACTIONS, PRESETS, ROUTES, SIGNALS, observe, resolveRule } from './strategy.mjs';
import { clock, REGIMES } from './market.mjs';
import { btn, bps, esc, field, heading, icon, metric, num, options, panelHead, pct, select, tag } from './view.mjs';

export function studioView(policy,s,library) {
  const now=observe(s,policy), decision=resolveRule(policy,now);
  const ruleRows=policy.rules.map((r,i)=>`<div class="rule-row"><span class="rule-number">${i+1}</span>
    ${field('When',`<select data-rule="${i}" data-key="signal">${options(Object.fromEntries(Object.entries(SIGNALS).map(([k,v])=>[k,v.label])),r.signal)}</select>`)}
    ${field(`${SIGNALS[r.signal].op} ${SIGNALS[r.signal].unit}`,`<input type="number" data-rule="${i}" data-key="threshold" min="${SIGNALS[r.signal].min}" max="${SIGNALS[r.signal].max}" step="1" value="${r.threshold}">`)}
    ${field('Then',`<select data-rule="${i}" data-key="action">${options(ACTIONS,r.action)}</select>`)}
    <div class="rule-tools">${btn('rule-up',icon('up',14),'mini',`data-i="${i}" aria-label="Move rule ${i+1} up" ${i===0?'disabled':''}`)}${btn('rule-down',icon('down',14),'mini',`data-i="${i}" aria-label="Move rule ${i+1} down" ${i===policy.rules.length-1?'disabled':''}`)}${btn('rule-del',icon('trash',15),'mini',`data-i="${i}" aria-label="Remove rule ${i+1}"`)}</div></div>`).join('');
  return `${heading('Strategy studio','Build a set of instructions the desk can follow at every decision.',btn('apply-strategy','Use on desk','solid'))}
    <div class="studio-layout"><section class="panel editor">${panelHead('Trading instructions',tag('Visual editor'))}<div class="panel-body">
    <div class="presets"><span>Start from</span>${Object.entries(PRESETS).map(([id,p])=>btn('preset',p.name,'chip',`data-id="${id}"`)).join('')}</div>
    <div class="form-grid">${field('Strategy name',`<input id="policy-name" type="text" value="${esc(policy.name)}" maxlength="32" required>`)}${field('Routing preference',select('policy-route',ROUTES,policy.route))}
    ${field('Check rules every',select('policy-cadence',Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,(i+1)+' interval'+(i?'s':'')])),policy.cadence))}
    ${field('Maximum normal order (shares)',`<input id="policy-clip" type="number" min="25" max="1500" step="1" value="${policy.clip}">`)}</div>
    <h3>Decision rules</h3><p class="muted">The first matching rule wins. The fallback applies if none match.</p><div class="rules-list">${ruleRows||'<p class="empty">The fallback handles every decision.</p>'}</div>
    ${btn('rule-add',icon('plus',14)+' Add rule','secondary',policy.rules.length>=6?'disabled':'')}
    <div class="fallback">${field('Otherwise',select('policy-fallback',ACTIONS,policy.fallback))}</div>
    <div class="schedule-choice"><span><b>Timing schedule</b> ${policy.schedule?'Custom twelve block plan':'Even schedule'}</span>${btn('to-planner','Open planner','link')}${policy.schedule?btn('even-plan','Use even timing','link'):''}</div>
    <p class="footnote">Normal orders follow the target schedule. “Sweep remaining” sends all shares still available to trade. Open orders reserve their shares until filled or cancelled.</p>
    </div></section><div class="stack"><section class="panel signal-panel">${panelHead('Decision preview',tag(clock(s.tick)))}<div class="panel-body"><div class="overline">At this market snapshot</div><h3>${ACTIONS[decision.action]}</h3><p>${decision.rule?'Rule '+decision.rule:'Fallback'} · ${esc(decision.reason)}</p>
    <dl class="terms">${[['Intervals left',now.left],['Behind schedule',now.lag.toFixed(1)+'%'],['Market spread',now.spread+'¢'],['Book pressure',Math.round(now.pressure)+'%']].map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></div></section>
    <section class="panel">${panelHead('Blueprints')}<div class="panel-body"><p class="muted">Save a named strategy on this device or move it as a file.</p>
    ${library.length?field('Saved strategy',`<select id="library-choice"><option value="">Choose a blueprint</option>${library.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('')}</select>`):''}
    <div class="button-row">${btn('save-blueprint','Save blueprint','secondary')}${btn('export-policy','Export JSON','link')}${btn('import-policy','Import JSON','link')}</div>
    <p class="footnote">Studio edits are saved as you go. The current desk session keeps the strategy it started with.</p></div></section></div></div>`;
}
function trainingTable(study) {
  return `<section class="panel">${panelHead('Training leaderboard',tag(study.count+' markets per candidate'))}<div class="scroll-table"><table>
    <thead><tr><th>Candidate</th><th>Every</th><th>Clip size</th><th>Mean cost</th><th>90th percentile cost</th><th>Completion</th></tr></thead>
    <tbody>${study.table.map((r,i)=>`<tr class="${i===0?'highlight':''}"><td>${i===0?'Frozen winner':'Candidate '+(i+1)}</td><td>${r.policy.cadence} interval${r.policy.cadence===1?'':'s'}</td><td>${num(r.policy.clip)}</td><td>${bps(r.stats.mean)}</td><td>${bps(r.stats.p90)}</td><td>${pct(r.stats.completion)}</td></tr>`).join('')}</tbody></table></div><p class="book-foot">Candidates averaging at least 95% completion rank by lowest mean cost. Other candidates rank by completion first.</p></section>`;
}
function holdout(hold,reused) {
  const a=hold.stats;
  return `<section class="panel holdout">${panelHead(reused?'Repeated market results':'Unseen market results',tag('Paired comparison','live'))}
    <div class="research-metrics">${metric('Average saving',bps(a.delta),'positive favors your strategy')}${metric('Beat the benchmark',a.wins+' / '+a.n,'identical outside order flow')}${metric('Mean completion',pct(a.completion),'all unseen markets')}</div>
    <p class="interval">95% bootstrap interval for average saving <b>${bps(hold.interval[0])} to ${bps(hold.interval[1])}</b>. The interval resamples these paired markets.</p>
    <div class="scroll-table"><table><thead><tr><th>Market regime</th><th>Average cost</th><th>Saving vs. even</th><th>Fully completed</th></tr></thead><tbody>${Object.entries(hold.regimes).map(([id,r])=>`<tr><td>${REGIMES[id].name}</td><td>${bps(r.mean)}</td><td>${bps(r.delta)}</td><td>${r.full}/${r.n}</td></tr>`).join('')}</tbody></table></div>
    <details><summary>Inspect individual markets (${a.n})</summary><div class="scroll-table"><table><thead><tr><th>Market code</th><th>Regime</th><th>Your cost</th><th>Even schedule</th><th>Filled</th><th>Inspect</th></tr></thead><tbody>${hold.rows.map((r,i)=>`<tr><td>${esc(r.seed)}</td><td>${REGIMES[r.regime].name}</td><td>${bps(r.algo.bps)}</td><td>${bps(r.benchmark.bps)}</td><td>${num(r.algo.filled)}</td><td>${btn('inspect-market','Open desk','link',`data-i="${i}"`)}</td></tr>`).join('')}</tbody></table></div></details>
    <div class="panel-body">${btn('export-trials',icon('export',15)+' Export paired results','secondary')}</div></section>`;
}
export function trialsView(policy,study,hold,job,settings,mission) {
  const progress=job?`<div class="job" role="status"><b>${job.type==='train'?'Training candidates':'Testing the frozen strategy'}</b><progress max="${job.total}" value="${job.done}"></progress><span>${job.done}/${job.total} markets</span>${btn('cancel-job','Stop','link')}</div>`:'';
  return `${heading('Market trials','Tune a strategy on one group of markets, then test the frozen winner on a separate group.')}
    <section class="panel study-setup">${panelHead('Experiment design',tag('Four market regimes'))}<div class="panel-body"><div class="form-grid study-form">
    ${field('Research code',`<input id="study-code" value="${esc(settings.code)}" maxlength="16" ${job?'disabled':''}>`)}
    ${field('Training markets',`<select id="study-count" ${job?'disabled':''}>${options({12:'12 training / 24 unseen',24:'24 training / 48 unseen',48:'48 training / 96 unseen'},settings.count)}</select>`)}
    ${field('Starting strategy',`<div class="field-value">${esc(policy.name)}</div>`)}${field('Parent order',`<div class="field-value">${mission.side.toUpperCase()} ${num(mission.target)} shares</div>`)}</div>
    <p class="muted">The search varies order size and timing. Every candidate faces the same outside orders as the even schedule benchmark.</p>
    <div class="button-row">${btn('train',study?'Start new training':'Train candidates','solid',job?'disabled':'')}${btn('fresh-code','Fresh research code','secondary',job?'disabled':'')}${btn('to-studio','Edit strategy','link')}</div>${progress}</div></section>
    ${study?`<section class="freeze"><div class="freeze-icon">${icon('trials',23)}</div><div><div class="overline">Frozen for validation · ${esc(study.code)}</div><h2>${esc(study.locked.name)}</h2><p>${study.side.toUpperCase()} ${num(study.target)} shares · ${num(study.locked.clip)} share clip · checks every ${study.locked.cadence} interval${study.locked.cadence===1?'':'s'}.</p>${study.reused?'<p>This market set was previously revealed on this device.</p>':''}</div>${hold?tag('Holdout revealed','live'):btn('validate',study.reused?'Run repeat validation':'Run unseen markets','solid',job?'disabled':'')}</section>
    ${hold?holdout(hold,study.reused):''}${trainingTable(study)}`:`<section class="panel research-empty">${icon('trials',30)}<h2>What the test will tell you</h2><p>See whether the strategy beats an even schedule after fees, how often it finishes the order, and which market conditions change the answer.</p></section>`}
    <p class="page-note">${icon('info',15)} Once you’ve seen an unseen set, use a fresh research code for your next independent test.</p>`;
}

