import { REGIMES } from './market.mjs';
import { esc, field, select } from './view.mjs';

export function guide() {
  return `<div class="overline">Field guide</div><h2 id="dialog-title">Your first execution</h2>
  <p>A client asks you to buy or sell a fixed number of Mica Systems shares before 16:00. Crossbook splits that large order into smaller orders and sends them to two fictional exchanges.</p>
  <ol class="guide-list"><li><b>Start on the execution desk.</b> Press Step to advance five simulated minutes. The two order books show buyers’ bids and sellers’ asking prices. The midpoint is halfway between the best bid and best ask across both venues.</li>
  <li><b>Try a trading rule.</b> In Strategy studio, “Join best price” waits in a queue. “Take liquidity” trades with available orders on arrival. Improving by one cent places a limit closer to the other side when there is room. A limit sets the worst price you will accept.</li>
  <li><b>Decide when to trade.</b> Execution planner estimates the cost of different order sizes from twelve separate markets. The urgency control puts a price on waiting. A backward calculation compares all feasible timing choices. Send the resulting schedule to the studio to test it with real queues in this simulation.</li>
  <li><b>Test what you built.</b> Market trials ranks variations on training markets. The frozen winner competes with an even schedule on a separate set of market codes. A positive saving means the strategy incurred less cost.</li>
  <li><b>Replay one decision.</b> After the close, change strategy at a chosen five minute interval. Orders already in flight still arrive. You can trace each child order and export your fills.</li></ol>
  <h3>How to read the score</h3><p>On a buy order, paying above the starting midpoint adds cost. Paying less saves money. On a sell, receiving less adds cost. Exchange fees also count. Each unfilled share is valued at the closing midpoint to measure what you missed. It remains unfilled.</p>
  <div class="example"><b>A $54 example</b><p>You want 1,000 shares at a $50 starting midpoint. You buy 600 at $50.02 and pay $2 in fees. If the market closes at $50.10, the extra purchase cost is $12 and the missed move on 400 shares is $40. Total cost is $54. Completion is 60%.</p></div>
  <p>A basis point (bp) is 0.01%. Crossbook divides total cost by the value of the entire order at arrival, then expresses it in basis points. Negative cost means an improvement relative to that starting value.</p>
  <h3>Inside these exchanges</h3><p>Best price trades first. At a given price, the older resting order trades first. An order can fill in pieces. Arc takes one interval to receive a message and charges a taker fee. Ion takes two intervals and charges no taker fee. Cancellation requests have the same travel time.</p>
  <p>Each interval begins with the desk’s decision. Outside participants then update their orders, followed by due desk messages. Public orders may fill your resting bid while a cancellation is on its way. The smart router weighs displayed prices, fees, depth or queue size, and a latency penalty. These are rules of the simulation.</p>
  <p>Book pressure compares displayed buying and selling size across the first two levels at both venues, measured from the perspective of your order. The last two intervals allow a final rule check regardless of cadence.</p>
  <h3>Further reading</h3><ul class="references">
  <li><a target="_blank" rel="noopener" href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14">SEC · Understanding Order Types</a></li>
  <li><a target="_blank" rel="noopener" href="https://nasdaqtrader.com/trader.aspx?id=tradingusequities">Nasdaq · Price and time priority</a></li>
  <li><a target="_blank" rel="noopener" href="https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/trading-costs-and-electronic-markets">CFA Institute · Trading Costs and Electronic Markets</a></li></ul>`;
}
export function newMission(m,seed) {
  return `<div class="overline">Session setup</div><h2 id="dialog-title">New market session</h2><p>Set your client’s instruction and the market you want to face. The desk will use your current studio strategy.</p><form id="new-form"><div class="form-grid">
    ${field('Buy or sell',select('new-side',{buy:'Buy shares',sell:'Sell shares'},m.side))}
    ${field('Parent order',select('new-target',{1000:'1,000 shares',2500:'2,500 shares',5000:'5,000 shares',7500:'7,500 shares'},m.target))}
    ${field('Market conditions',select('new-regime',REGIMES,m.regime))}
    ${field('Scenario code',`<input id="new-code" maxlength="16" pattern="[A-Za-z0-9]{3,16}" value="${esc(seed)}" required>`)}
    </div><p class="footnote">A code of 3 to 16 letters or numbers repeats the same outside market. Starting a session replaces the current desk run. Saved blueprints and trials remain available.</p>
    <button class="solid" type="submit">Start session</button></form>`;
}

