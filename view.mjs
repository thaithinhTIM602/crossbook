import { clock } from './market.mjs';
export const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=v=>Math.round(v).toLocaleString('en-US');
export const dollars=m=>m===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(m/1000);
export const price=c=>c==null?'—':'$'+(c/100).toFixed(2);
export const perShare=m=>m===null?'—':'$'+(m/1000).toFixed(3);
export const bps=n=>(n>0?'+':'')+n.toFixed(2)+' bp';
export const pct=n=>(n*100).toFixed(n===0||n===1?0:1)+'%';
export const field=(label,control)=>`<label class="field"><span>${label}</span>${control}</label>`;
export const options=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${esc(key)}"${String(selected)===key?' selected':''}>${esc(label.name||label)}</option>`).join('');
export const select=(id,values,selected)=>`<select id="${id}">${options(values,selected)}</select>`;
export const btn=(action,label,klass='secondary',attrs='')=>`<button type="button" data-go="${action}" class="${klass}" ${attrs}>${label}</button>`;
export const period=n=>n===1?'1 interval':n+' intervals';
export const metric=(label,value,detail='')=>`<div class="metric"><span>${label}</span><strong>${value}</strong>${detail?`<small>${detail}</small>`:''}</div>`;
export const panelHead=(title,aside='')=>`<div class="panel-head"><h2>${title}</h2>${aside}</div>`;
export const tag=(text,klass='')=>`<span class="tag ${klass}">${text}</span>`;
const paths={
  planner:'<path d="M3 3v18h18M6 17v-4m4 4V9m4 8v-6m4 6V6"/>',
  desk:'<path d="M3 4h18v13H3zM8 21h8m-4-4v4m-6-9 3-3 3 2 5-4"/>',
  studio:'<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  trials:'<path d="M9 3h6m-5 0v6l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3m-7 12h10"/>',
  replay:'<path d="M4 9a8 8 0 1 1 0 7m0-12v5h5m4-1v5l3 2"/>',
  guide:'<path d="M3 5c4-2 7-1 9 1 2-2 5-3 9-1v14c-4-2-7-1-9 1-2-2-5-3-9-1zm9 1v14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14m8-14v14"/>',
  step:'<path d="m6 6 9 6-9 6Zm12 0v12"/>',fast:'<path d="m3 6 8 6-8 6Zm9 0 8 6-8 6Z"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 11 7-4m-7 6 7 4"/>',
  export:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',close:'<path d="m6 6 12 12m0-12L6 18"/>',
  pulse:'<path d="M2 13h5l3-8 4 15 3-9h5"/>', layers:'<path d="m3 9 9-5 9 5-9 5zm1 5 8 5 8-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  fork:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m1-3c7 0 11-2 11-6"/>',
  wallet:'<path d="M3 7V5l14-2v4M3 7h18v13H3zm13 5h5v4h-5z"/>',
  up:'<path d="m6 14 6-6 6 6"/>',down:'<path d="m6 10 6 6 6-6"/>',trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>',
};
export function icon(key,size=18) {
  return `<svg aria-hidden="true" class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[key]||''}</svg>`;
}
export const logo='<svg width="35" height="35" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#82efc9"/><path d="M6 26h7l8-14h11M7 31h9l9-15h8M6 18h6l4-7h5" stroke="#122a2a" stroke-width="3.2" stroke-linejoin="round"/></svg>';
export function heading(title,desc,aside='') {
  return `<div class="page-title"><div><h1>${title}</h1><p>${desc}</p></div>${aside}</div>`;
}
export function chart(lines,{dark=true,format=v=>v.toFixed(2),xFormat=clock,markers=[],reference=null,branch=null,label='Market chart'}={}) {
  const width=760,height=206,l=62,r=22,t=16,b=30;
  const all=lines.flatMap(s=>s.points);
  if(!all.length)return '';
  const minX=Math.min(...all.map(p=>p[0])), maxX=Math.max(minX+1,...all.map(p=>p[0]));
  const vs=all.map(p=>p[1]).concat(markers.map(m=>m.y));
  if(reference!==null)vs.push(reference);
  const min=Math.min(...vs),max=Math.max(...vs);
  const pad=Math.max((max-min)*.15,Math.abs(max)*.00012,.01);
  const low=min-pad,high=max+pad;
  const x=v=>l+(v-minX)/(maxX-minX)*(width-l-r), y=v=>t+(high-v)/(high-low)*(height-t-b);
  const grid=Array.from({length:4},(_,i)=>{
    const val=low+(high-low)*i/3;
    return `<path class="gridline" d="M${l} ${y(val)}H${width-r}"/><text x="${l-8}" y="${y(val)+4}" text-anchor="end">${format(val)}</text>`;
  });
  const xTicks=Array.from({length:5},(_,i)=>Math.round(minX+(maxX-minX)*i/4));
  const axis=[...new Set(xTicks)].map(n=>`<text x="${x(n)}" y="${height-5}" text-anchor="middle">${xFormat(n)}</text>`).join('');
  const gradient=`<defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#62dfba" stop-opacity=".26"/><stop offset="100%" stop-color="#62dfba" stop-opacity="0"/></linearGradient></defs>`;
  const series=lines.map((s,i)=>{
    const d=s.points.map(([a,v],j)=>(j?'L':'M')+x(a).toFixed(2)+' '+y(v).toFixed(2)).join(' ');
    const end=s.points.at(-1),start=s.points[0];
    return `${dark&&i===0?`<path d="${d} L${x(end[0])} ${height-b}H${x(start[0])}Z" fill="url(#area)"/>`:''}<path d="${d}" stroke="${s.color}" stroke-width="2.5" fill="none" ${s.dash?'stroke-dasharray="6 4"':''} stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(end[0])}" cy="${y(end[1])}" r="3.7" fill="${s.color}"/>`;
  }).join('');
  const ref=reference===null?'':`<path d="M${l} ${y(reference)}H${width-r}" class="refline"/>`;
  const split=branch===null?'':`<path class="refline" d="M${x(branch)} ${t}V${height-b}"/><text x="${x(branch)+4}" y="${t+9}">Fork</text>`;
  const dots=markers.map(p=>`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="3" fill="${p.color||'#ffba81'}"><title>${esc(p.text)}</title></circle>`).join('');
  return `<svg class="chart ${dark?'dark-chart':'light-chart'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" preserveAspectRatio="none">${gradient}${grid.join('')}${ref}${split}${series}${dots}${axis}</svg>`;
}
export function download(name,text,type) {
  const url=URL.createObjectURL(new Blob([text],{type})), a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

