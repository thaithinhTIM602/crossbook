export const HORIZON = 72;
export const WARMUP = 14;
export const REGIMES = {
  balanced: { name: 'Balanced', desc: 'Two sided orders and steady depth.' },
  trend: { name: 'Directional', desc: 'A sustained buying or selling wave develops.' },
  dry: { name: 'Liquidity drought', desc: 'Liquidity providers withdraw during the middle of the session.' },
  reversal: { name: 'Reversal', desc: 'An early directional move changes course.' },
};
export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function random(seed) {
  let state = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export const safeCode = s => typeof s === 'string' && /^[A-Z0-9]{3,16}$/.test(s);
export const clock = tick => {
  const mins = 600 + tick * 5;
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
};
export const DEFAULT_MISSION = { seed:'CROSS26', side:'buy', target:5000, regime:'balanced' };
export function validMission(m) {
  return !!m && safeCode(m.seed) && ['buy','sell'].includes(m.side) && [1000,2500,5000,7500].includes(m.target) && Object.hasOwn(REGIMES,m.regime);
}

// This tape specifies outside intentions. It never contains computed trades or the desk's future fills.
export function makeTape(seed, regime) {
  const rng = random(seed + ':tape:3');
  const sign = rng() < .5 ? -1 : 1;
  let reference = 10000 + Math.round((rng()-.5)*160);
  const rows = [];
  for (let tick=-WARMUP; tick<=HORIZON; tick++) {
    let drift = .05, depth = 1, volatility = 1;
    if (regime === 'trend' && tick >= 9) drift = sign * 1.45;
    if (regime === 'dry' && tick >= 23 && tick <= 48) { depth=.29; volatility=2.6; drift=sign*.7; }
    if (regime === 'reversal' && tick >= 7) drift = sign * (tick < 38 ? 1.4 : -1.7);
    const change = ((rng()+rng()+rng()-1.5)*4.5*volatility) + drift;
    reference += change;
    const venues = [0,1].map(v => {
      const baseSpread = Math.round((v===0?1.0:1.5) + rng()*1.8 + (1-depth)*4);
      return {
        offset: Math.round((rng()-.5)*3), half:baseSpread,
        quotes: Array.from({length:4},(_,level)=>({
          bid: Math.max(10,Math.round((30+rng()*90+level*20)*depth)),
          ask: Math.max(10,Math.round((30+rng()*90+level*20)*depth)),
        })),
        postSide: rng()<.5?'buy':'sell', postOffset:1+Math.floor(rng()*5),
        postQty: Math.max(6,Math.round((20+rng()*85)*depth)),
        takeSide: rng() < .5+drift*.08 ? 'buy':'sell',
        takeQty: Math.round((12+rng()*105)*(1+.2*volatility)),
        take: rng()<.85, retire: Math.floor(rng()*3),
      };
    });
    rows.push({ tick, reference:Math.round(reference), depth, venues });
  }
  return rows;
}

