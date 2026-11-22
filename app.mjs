import { VENUES } from './book.mjs';
import { DEFAULT_MISSION, HORIZON, REGIMES, clock, safeCode } from './market.mjs';
import { advance, run } from './engine.mjs';
import { ACTIONS, clone, observe, PRESETS, resolveRule, SIGNALS, validStrategy } from './strategy.mjs';
import { decodeSession, encodeSession, fresh, restore, csv, SESSION_KEY, STUDIO_KEY, STUDY_KEY } from './state.mjs';
import { train, validate } from './research.mjs';
import { deskView, childView } from './desk.mjs';
import { studioView, trialsView } from './workshop.mjs';
import { replayView } from './replay.mjs';
import { calibrate, optimize } from './planner.mjs';
import { plannerView } from './plan-view.mjs';
import { guide, newMission } from './guide.mjs';
import { btn, download, esc, icon, logo } from './view.mjs';

const $=s=>document.querySelector(s), main=$('#main'), dialog=$('#dialog');
let storageWorks=true, noticeTimer=null;
function read(key) {try{return localStorage.getItem(key);}catch{storageWorks=false;return null;}}
function write(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{storageWorks=false;}}
function parsed(raw) {try{return JSON.parse(raw);}catch{return null;}}
function randomCode() {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(7)),n=>alphabet[n%alphabet.length]).join('');
}
function notify(text) {
  clearTimeout(noticeTimer);
  $('#notice').textContent=text;$('#notice').classList.add('visible');
  noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),4000);
}
function validStats(st) {
  return !!st && ['mean','p90','completion','delta','wins','full','n'].every(k=>Number.isFinite(st[k]));
}
function validStudy(st) {
  return st && safeCode(st.code)&&[12,24,48].includes(st.count)&&['buy','sell'].includes(st.side)&&
    [1000,2500,5000,7500].includes(st.target)&&validStrategy(st.locked)&&validStrategy(st.starting)&&
    Array.isArray(st.table)&&st.table.length>0&&st.table.length<=9&&st.table.every(x=>validStrategy(x.policy)&&validStats(x.stats));
}
function validHold(h,st) {
  const scoreOK=q=>q && ['bps','completion','filled','fee'].every(k=>Number.isFinite(q[k]));
  return validStudy(st)&&h&&validStats(h.stats)&&Array.isArray(h.interval)&&h.interval.length===2&&h.interval.every(Number.isFinite)&&
    h.regimes&&Object.keys(REGIMES).every(k=>validStats(h.regimes[k]))&&Array.isArray(h.rows)&&h.rows.length===st.count*2&&
    h.rows.every(r=>safeCode(r.seed)&&Object.hasOwn(REGIMES,r.regime)&&scoreOK(r.algo)&&scoreOK(r.benchmark));
}
let snapshot=restore(read(SESSION_KEY))||fresh();
let desk=run(snapshot.mission,snapshot.policy,{detail:true,until:snapshot.tick});
let lastStored=read(SESSION_KEY);
const savedStudio=parsed(read(STUDIO_KEY));
let studio=validStrategy(savedStudio?.policy)?clone(savedStudio.policy):clone(PRESETS.adaptive);
let library=Array.isArray(savedStudio?.library)?savedStudio.library.filter(validStrategy).slice(0,12):[];
const savedLab=parsed(read(STUDY_KEY));
let study=validStudy(savedLab?.study)?savedLab.study:null;
let hold=validHold(savedLab?.hold,study)?savedLab.hold:null;
let settings={code:study?.code||'FLOOR26',count:study?.count||12};
let revealed=Array.isArray(savedLab?.revealed)?savedLab.revealed.filter(safeCode).slice(-60):[];
let job=null, view='desk', chartType='price', blotterTab='tape', timer=null;
let forkAt=24, forkChoice='patient', alternative=null, forkKey='';
let plannerCode='MODEL26', urgency=.25, calibrationKey='', calibration=null, timingPlan=null;
let confirmation=null, shared=null;
const navItems=[['desk','Execution desk'],['studio','Strategy studio'],['planner','Execution planner'],['trials','Market trials'],['replay','Decision replay']];

function saveSession() {
  snapshot.tick=desk.tick;
  write(SESSION_KEY,snapshot);lastStored=read(SESSION_KEY);
}
function saveStudio(){write(STUDIO_KEY,{policy:studio,library});}
function saveLab(){write(STUDY_KEY,{study,hold,revealed});}

function newDesk(mission,policy,tick=0) {
  pause();snapshot=fresh(mission,policy);desk=run(mission,policy,{detail:true,until:tick});saveSession();
  forkKey='';chartType='price';blotterTab='tape';forkAt=24;forkChoice='patient';
  go('desk');
}
function syncOther(raw) {
  if(raw===lastStored)return false;
  const data=restore(raw);
  if(!data)return false;
  pause();snapshot=data;lastStored=raw;desk=run(snapshot.mission,snapshot.policy,{detail:true,until:snapshot.tick});
  forkKey='';render();notify('The saved desk changed in another tab.');return true;
}
function pause(){if(timer!==null){clearInterval(timer);timer=null;}}
function tick(n) {
  if(syncOther(read(SESSION_KEY)))return;
  for(let j=0;j<n && desk.tick<HORIZON;j++)advance(desk,snapshot.policy);
  if(desk.tick===HORIZON)pause();
  saveSession();forkKey='';render();
}
function go(next) {
  if(!navItems.some(([id])=>id===next))return;
  pause();view=next;render();main.focus({preventScroll:true});window.scrollTo(0,0);
}
function setStudio(next,redraw=true) {
  if(!validStrategy(next)){notify('Choose a valid strategy name and settings within the displayed ranges.');render();return false;}
  studio=clone(next);saveStudio();forkKey='';if(redraw)render();return true;
}
function updateDecisionPreview() {
  if(view!=='studio')return;
  const decision=resolveRule(studio,observe(desk,studio));
  $('.signal-panel h3').textContent=ACTIONS[decision.action];
  $('.signal-panel .panel-body>p').textContent=(decision.rule?'Rule '+decision.rule:'Fallback')+' · '+decision.reason;
}
function getAlternative() {
  const policy=forkChoice==='studio'?studio:PRESETS[forkChoice];
  const key=JSON.stringify([snapshot.mission,snapshot.policy,desk.tick,forkAt,policy]);
  if(key!==forkKey){
    alternative=run(snapshot.mission,snapshot.policy,{detail:true,tape:desk.tape,fork:{at:forkAt,policy}});
    forkKey=key;
  }
  return alternative;
}
function render() {
  const m=snapshot.mission;
  $('#rail').innerHTML=`<button class="brand" data-go="to-desk" aria-label="Crossbook home">${logo}<b>Crossbook</b></button>
    <div class="rail-caption">Research workspace</div><nav aria-label="Workspace">${navItems.map(([id,n])=>
      btn('to-'+id,icon(id,19)+`<span class="nav-full">${n}</span><span class="nav-short">${({desk:'Desk',studio:'Studio',planner:'Planner',trials:'Trials',replay:'Replay'})[id]}</span>`,'nav-item',`aria-label="${n}" ${view===id?'aria-current="page"':''}`)).join('')}</nav>
    <div class="rail-bottom">${btn('guide',icon('guide',19)+'<span>Field guide</span>','nav-item')}
      <div class="rail-session"><i></i><span>Simulation engine<b>On device</b></span></div></div>`;
  $('#top').innerHTML=`<div class="breadcrumbs">Workspace <i>/</i> <b>${navItems.find(([id])=>id===view)[1]}</b></div><div class="top-tools">${btn('share',icon('share',15)+'<span>Share session</span>','top-btn')}${btn('new',icon('plus',15)+' New session','top-solid')}</div>`;
  if(view==='desk')main.innerHTML=deskView(desk,snapshot.policy,{chartType,blotterTab,playing:timer!==null});
  if(view==='studio')main.innerHTML=studioView(studio,desk,library);
  if(view==='planner'){
    const key=JSON.stringify([m,plannerCode]);
    if(calibrationKey!==key){calibration=calibrate(m,plannerCode);calibrationKey=key;}
    timingPlan=optimize(calibration,urgency);
    main.innerHTML=plannerView(m,plannerCode,urgency,calibration,timingPlan);
  }
  if(view==='trials')main.innerHTML=trialsView(studio,study,hold,job,settings,m)+(revealed.includes(settings.code)&&study?.code!==settings.code?'<p class="page-note">This research code has already been used for validation on this device.</p>':'');
  if(view==='replay')main.innerHTML=replayView(desk,snapshot.policy,desk.tick===HORIZON?getAlternative():null,forkAt,studio,forkChoice);
  $('#footer').innerHTML=`<span>Crossbook <i>/</i> Fictional exchange simulation</span><span>${REGIMES[m.regime].name} <i>/</i> ${m.seed} <i>/</i> ${storageWorks?'Saved on this device':'Storage unavailable in this tab'}</span>`;
}
function openDialog(content) {
  pause();render();
  dialog.innerHTML=`<div class="modal-x">${btn('dismiss',icon('close',18),'mini','aria-label="Close dialog"')}</div><div class="modal-body">${content}</div>`;
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
}
function closeDialog(){if(dialog.open)dialog.close();confirmation=null;}
function confirmAction(title,text,action,label='Continue') {
  confirmation=action;
  openDialog(`<div class="overline">Workspace</div><h2 id="dialog-title">${esc(title)}</h2><p>${esc(text)}</p><div class="button-row">${btn('confirm',esc(label),'solid')}${btn('dismiss','Keep current session','secondary')}</div>`);
}
function startWork(type) {
  if(job)return;
  if(type==='train'&&(!safeCode(settings.code)||![12,24,48].includes(settings.count))){notify('Use 3 to 16 letters or numbers for the research code.');return;}
  if(type==='hold'&&(!study||hold))return;
  const input=type==='train'?{...settings,mission:clone(snapshot.mission),policy:clone(studio)}:clone(study);
  const token={type,done:0,total:type==='train'?settings.count:study.count*2,worker:null,cancelled:false};
  job=token;render();
  function receive(message) {
    if(job!==token)return;
    if(message.type==='progress'){
      token.done=message.done;token.total=message.total;
      const progress=$('.job progress');
      if(progress){progress.max=token.total;progress.value=token.done;$('.job>span').textContent=token.done+'/'+token.total+' markets';}
      return;
    }
    token.worker?.terminate();job=null;
    if(message.type==='error'){render();notify(message.message||'The experiment could not finish.');return;}
    if(type==='train'){study={...message.result,reused:revealed.includes(message.result.code)};hold=null;}
    else{hold=message.result;revealed=[...new Set([...revealed,study.code])].slice(-60);}
    saveLab();render();notify(type==='train'?'Training complete. The winning settings are frozen.':'Unseen market results are ready.');
  }
  async function fallback() {
    try{
      const runner=type==='train'?train:validate;
      const result=await runner(input,(done,total)=>receive({type:'progress',done,total}),()=>token.cancelled);
      receive({type:'done',result});
    }catch(error){receive({type:'error',message:error.message});}
  }
  try {
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    token.worker=worker;
    worker.onmessage=e=>receive(e.data);
    worker.onerror=()=>{worker.terminate();token.worker=null;if(job===token)fallback();};
    worker.postMessage({type:type==='train'?'train':'hold',input});
  } catch {fallback();}
}
function exportFills() {
  const rows=[['Time','Child','Side','Venue','Liquidity role','Shares','Price USD','Fee USD','Rule']];
  for(const f of desk.fills)rows.push([clock(f.tick),f.id,snapshot.mission.side,VENUES[f.venue].name,f.role,f.qty,f.price/100,f.fee/1000,f.rule]);
  download('crossbook-'+snapshot.mission.seed+'-fills.csv',csv(rows),'text/csv');
}
function exportTrials() {
  if(!hold)return;
  const rows=[['Cohort','Market code','Regime','Side','Target','Candidate','Policy cost bp','Even cost bp','Saving bp','Policy filled','Even filled']];
  for(const r of hold.rows)rows.push([study.code,r.seed,r.regime,study.side,study.target,study.id,r.algo.bps,r.benchmark.bps,r.benchmark.bps-r.algo.bps,r.algo.filled,r.benchmark.filled]);
  download('crossbook-'+study.code+'-holdout.csv',csv(rows),'text/csv');
}
function exportReplay() {
  const alt=getAlternative(), rows=[['Scenario','Fork interval','Time','Baseline filled','Replay filled','Baseline executed USD','Replay executed USD','Baseline net fee USD','Replay net fee USD']];
  const ha=desk.history.filter(h=>h.tick>=0),hb=alt.history.filter(h=>h.tick>=0);
  ha.forEach((h,i)=>rows.push([snapshot.mission.seed,forkAt,clock(h.tick),h.filled,hb[i].filled,h.notional/1000,hb[i].notional/1000,h.fees/1000,hb[i].fees/1000]));
  download('crossbook-'+snapshot.mission.seed+'-replay.csv',csv(rows),'text/csv');
}
function shareDialog() {
  const url=new URL(location.href);url.search='';url.hash='session='+encodeSession(snapshot);
  openDialog(`<div class="overline">Reproducible session</div><h2 id="dialog-title">Share this market</h2><p>This link recreates the same order, strategy and market up to ${clock(desk.tick)}. Each person can continue their own copy.</p><label class="field"><span>Session link</span><input id="share-url" readonly value="${esc(url.href)}"></label><div class="button-row">${btn('copy-url','Copy link','solid')}</div>`);
}
function restoreFocus(id){if(id)document.getElementById(id)?.focus({preventScroll:true});}
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='study-code'){settings.code=el.value.trim().toUpperCase();return;}
  if(el.id==='policy-name'||el.id==='policy-clip'||el.dataset.key==='threshold'){
    const next=clone(studio);
    if(el.id==='policy-name')next.name=el.value.trim();
    else if(el.id==='policy-clip')next.clip=el.valueAsNumber;
    else next.rules[Number(el.dataset.rule)].threshold=el.valueAsNumber;
    if(validStrategy(next)){setStudio(next,false);updateDecisionPreview();}
  }
});
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-go]');
  if(!el||el.disabled)return;
  const a=el.dataset.go;
  if(a.startsWith('to-')){go(a.slice(3));return;}
  if(a==='dismiss'){closeDialog();return;}
  if(a==='confirm'){const action=confirmation;closeDialog();action?.();return;}
  if(a==='guide'){openDialog(guide());return;}
  if(a==='new'){openDialog(newMission(snapshot.mission,randomCode()));return;}
  if(a==='share'){shareDialog();return;}
  if(a==='copy-url'){
    const field=$('#share-url');field.select();
    try{await navigator.clipboard.writeText(field.value);notify('Session link copied.');}
    catch{notify('The link is selected. Use Copy to share it.');}
    return;
  }
  if(a==='step'||a==='skip'||a==='close-market'){pause();tick(a==='step'?1:a==='skip'?6:HORIZON);return;}
  if(a==='auto'){if(timer!==null)pause();else if(desk.tick<HORIZON)timer=setInterval(()=>tick(1),600);render();return;}
  if(a==='chart-price'||a==='chart-progress'){chartType=a.slice(6);render();return;}
  if(a==='blotter'){blotterTab=el.dataset.tab;render();return;}
  if(a==='inspect-child'){openDialog(childView(desk,el.dataset.id));return;}
  if(a==='export-fills'){exportFills();return;}
  if(a==='export-trials'){exportTrials();return;}
  if(a==='export-replay'){exportReplay();return;}
  if(a==='apply-plan'&&timingPlan){setStudio({...studio,schedule:[...timingPlan.units]},false);go('studio');notify('Timing plan added to the studio strategy.');return;}
  if(a==='even-plan'){const next=clone(studio);delete next.schedule;setStudio(next);return;}
  if(a==='export-plan'&&timingPlan){
    const rows=[['Calibration code','Scenario regime','Side','Target','Urgency','Block','Time','Shares','Remaining shares','Estimated cost USD','Timing penalty USD']];
    timingPlan.rows.forEach((r,i)=>rows.push([plannerCode,snapshot.mission.regime,snapshot.mission.side,snapshot.mission.target,urgency,i+1,clock(i*6),r.shares,r.remaining,r.cost,r.penalty]));
    download('crossbook-'+plannerCode+'-schedule.csv',csv(rows),'text/csv');return;
  }
  if(a==='preset'){setStudio(PRESETS[el.dataset.id]);return;}
  if(a==='apply-strategy'){
    if(desk.tick)confirmAction('Start a new run on this market?','This restarts the current market from the opening bell using your studio strategy.',()=>newDesk(snapshot.mission,studio),'Start strategy run');
    else newDesk(snapshot.mission,studio);
    return;
  }
  if(a.startsWith('rule-')){
    const p=clone(studio),i=Number(el.dataset.i);
    if(a==='rule-add'&&p.rules.length<6)p.rules.push({signal:'spread',threshold:4,action:'post'});
    if(a==='rule-del')p.rules.splice(i,1);
    if(a==='rule-up'&&i>0)[p.rules[i-1],p.rules[i]]=[p.rules[i],p.rules[i-1]];
    if(a==='rule-down'&&i<p.rules.length-1)[p.rules[i+1],p.rules[i]]=[p.rules[i],p.rules[i+1]];
    setStudio(p);return;
  }
  if(a==='save-blueprint'){
    const i=library.findIndex(p=>p.name===studio.name);
    if(i<0&&library.length>=12){notify('The library holds twelve blueprints. Save under an existing name to update it.');return;}
    if(i<0)library.push(clone(studio));else library[i]=clone(studio);
    saveStudio();render();notify('Blueprint saved on this device.');return;
  }
  if(a==='export-policy'){download('crossbook-strategy.json',JSON.stringify({format:'crossbook-strategy-v1',policy:studio},null,2),'application/json');return;}
  if(a==='import-policy'){openDialog(`<div class="overline">Blueprint</div><h2 id="dialog-title">Import a strategy</h2><p>Choose a Crossbook strategy JSON file or paste its contents below.</p><label class="field"><span>Strategy file</span><input id="policy-file" type="file" accept=".json,application/json"></label><form id="import-form"><label class="field"><span>Strategy JSON</span><textarea id="policy-json" rows="6" maxlength="10000" required></textarea></label><p id="import-error" role="alert"></p><button type="submit" class="solid">Load strategy</button></form>`);return;}
  if(a==='train'){startWork('train');return;}
  if(a==='validate'){startWork('hold');return;}
  if(a==='fresh-code'){settings.code=randomCode();render();return;}
  if(a==='cancel-job'&&job){job.cancelled=true;job.worker?.terminate();job=null;render();notify('Experiment stopped.');return;}
  if(a==='inspect-market'&&hold){
    const row=hold.rows[Number(el.dataset.i)];
    confirmAction('Open this validation market?', 'This replaces the current desk with the completed test run. Your trial results stay available.',()=>newDesk({side:study.side,target:study.target,regime:row.regime,seed:row.seed},study.locked,HORIZON),'Open test market');return;
  }
  if(a==='baseline-close'){pause();tick(HORIZON);go('replay');return;}
});
document.addEventListener('change',async event=>{
  const el=event.target,id=el.id;
  if(el.dataset.rule!==undefined){
    const p=clone(studio),i=Number(el.dataset.rule),k=el.dataset.key;
    p.rules[i][k]=k==='threshold'?Number(el.value):el.value;
    if(k==='signal'){const signal=SIGNALS[el.value];p.rules[i].threshold=Math.max(signal.min,Math.min(signal.max,p.rules[i].threshold));}
    if(k==='threshold'){
      if(setStudio(p,false))updateDecisionPreview();
    }else{
      setStudio(p);main.querySelector('[data-rule="'+i+'"][data-key="'+k+'"]')?.focus({preventScroll:true});
    }
    return;
  }
  if(['policy-name','policy-route','policy-cadence','policy-clip','policy-fallback'].includes(id)){
    const p=clone(studio),k=id.slice(7);p[k]=k==='cadence'||k==='clip'?Number(el.value):el.value.trim();
    if(setStudio(p,false))updateDecisionPreview();return;
  }
  if(id==='library-choice'&&el.value!==''){setStudio(library[Number(el.value)]);return;}
  if(id==='study-code'){settings.code=el.value.trim().toUpperCase();el.value=settings.code;return;}
  if(id==='study-count'){settings.count=Number(el.value);return;}
  if(id==='plan-urgency'){urgency=Number(el.value);render();restoreFocus(id);return;}
  if(id==='plan-code'){
    const value=el.value.trim().toUpperCase();
    if(safeCode(value))plannerCode=value;else notify('Use 3 to 16 letters or numbers for the calibration code.');
    render();restoreFocus(id);return;
  }
  if(id==='fork-at'){forkAt=Number(el.value);render();restoreFocus(id);return;}
  if(id==='fork-policy'){forkChoice=el.value;render();restoreFocus(id);return;}
  if(id==='policy-file'&&el.files.length){
    const file=el.files[0];if(file.size>10000){$('#import-error').textContent='Choose a blueprint under 10 KB.';return;}
    try{$('#policy-json').value=await file.text();}catch{$('#import-error').textContent='That file could not be read.';}
  }
});
document.addEventListener('submit',event=>{
  if(event.target.id==='new-form'){
    event.preventDefault();const seed=$('#new-code').value.trim().toUpperCase();
    const m={seed,side:$('#new-side').value,target:Number($('#new-target').value),regime:$('#new-regime').value};
    if(safeCode(seed)){closeDialog();newDesk(m,studio);}
  }
  if(event.target.id==='import-form'){
    event.preventDefault();
    const data=parsed($('#policy-json').value);
    if(data?.format!=='crossbook-strategy-v1'||!validStrategy(data.policy)){$('#import-error').textContent='This file does not contain a valid Crossbook strategy.';return;}
    closeDialog();setStudio(data.policy);notify('Strategy imported into the studio.');
  }
});
dialog.addEventListener('close',()=>{confirmation=null;});
window.addEventListener('storage',e=>{if(e.key===SESSION_KEY&&e.newValue)syncOther(e.newValue);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&timer!==null){pause();render();}});
if(!lastStored)saveSession();
render();
if(location.hash.startsWith('#session=')){
  shared=decodeSession(location.hash.slice(9));
  history.replaceState(null,'',location.pathname+location.search);
  if(shared){
    if(snapshot.tick>0)confirmAction('Open the shared session?', 'This replaces the saved desk on this device with the market and decisions in the link.',()=>newDesk(shared.mission,shared.policy,shared.tick),'Open shared session');
    else newDesk(shared.mission,shared.policy,shared.tick);
  }else notify('This shared session could not be read. Your saved desk is open.');
}

