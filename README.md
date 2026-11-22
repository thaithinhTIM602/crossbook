# Crossbook

[Open the public execution research lab](https://thaithinhtim602.github.io/crossbook/)

A client asks you to buy 5,000 fictional Mica Systems shares before the closing bell. Crossbook gives you two exchanges, a programmable execution desk, and an independent testing environment. Watch how much of the order actually fills and what the timing, routing and fees cost.

## A first experiment

1. Open **Execution desk** and press **Step** or **+6 steps**. Open **Child orders** below the two exchange books and select an order to inspect its route, queue and fills.
2. Open **Strategy studio**. Rules run from top to bottom. Adjust when the strategy waits for a buyer or seller, improves its limit, takes liquidity, or sweeps the remaining order.
3. In **Execution planner**, change urgency. The planner allocates the target across twelve half hour blocks using separate calibration markets. Select **Send plan to studio**, then **Use on desk** to try that timing in a live simulation.
4. Open **Market trials**, train candidates, and then run the frozen winner on unseen markets. Expand the result table to open any individual market on the desk or download the paired results.
5. In **Decision replay**, move the switch time and select a different strategy. Inspect the cost components and compare both paths through the same outside market events.

**New session** supports buy and sell orders of 1,000, 2,500, 5,000 or 7,500 shares across four fictional market regimes. Share a link to reproduce a session from its scenario, strategy and clock position. Each recipient continues a separate local copy.

## Exchange and accounting

Each venue matches price first and then time at the same price. Market orders walk displayed levels. Limit orders can rest and fill in pieces. Routing messages and cancellations take one interval on Arc and two on Ion. Open and pending orders reserve quantities so the parent cannot be overfilled. Unexecuted orders expire at the close.

Arc pays a maker rebate of $0.001 per share and charges a taker fee of $0.003. Ion charges a maker fee of $0.001 per share and has no taker fee. These are fictional fee schedules. The smart router accounts for price, displayed size or queue depth, fees and a latency adjustment. Liquidity providers refresh quotes, public orders consume them, and cross venue arbitrage can remove crossed prices.

Prices use integer cents. Notionals and fees use integer thousandths of a dollar. A buy is scored by its executed notional less the arrival value of its executed shares, plus fees and the change in value of its unfilled shares from arrival to close. A sell reverses the price differences. Completion is reported separately. A negative cost indicates price improvement relative to the opening midpoint.

The random market tape records outside intentions independently of the strategy. The strategy can observe the current books, the clock and its own execution history. Its orders can change subsequent queues, trades and quotes. Replays preserve the history up to the switch, including outstanding messages.

## Timing and research

The planner samples twelve independent market sessions in the selected regime. For each half hour it estimates the cost of walking the displayed books in six slices and measures the typical midpoint move. A dynamic program allocates twenty equal units of the parent order across twelve blocks. Each block can trade at most five units. It minimizes estimated execution cost plus an urgency penalty proportional to the square of the inventory remaining. Prices and fills in the eventual desk run come from the matching engine.

Training evaluates up to nine combinations of order size and decision cadence on matched markets. All candidates face the even schedule benchmark against the same outside intentions. Candidates averaging at least 95% completion are ranked by mean cost. Candidates below that threshold rank by completion first. Validation uses separately named markets balanced equally across the four regimes. A paired bootstrap summarizes variation across those simulated markets. Reusing a revealed research code is labeled as repeat validation.

## Run it locally

The website is buildless and uses browser JavaScript modules. With Python installed, run `python3 -m http.server 8000` in this directory and open `http://localhost:8000/`. No API keys or package installation are required. Progress, blueprints and experiment results are stored in the browser. Scenario links and JSON blueprints can be taken to another device.

With Node.js 20 or later, run `npm test`. The suite covers exchange priority, partial fills, delayed cancellations, accounting, disjoint experimental cohorts, reproducible forks and optimal schedules. A stress test also checks every interval in 1,200 completed sessions. GitHub Actions runs the suite on changes to the main branch and on pull requests.

The simulator uses fictional orders, prices and venues. Its models have no connection to a brokerage or a live market data feed.

## Reading

* [SEC investor bulletin on order types](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14)
* [Nasdaq description of matching priority](https://nasdaqtrader.com/trader.aspx?id=tradingusequities)
* [CFA Institute on trading costs and electronic markets](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/trading-costs-and-electronic-markets)

Rubik Bold is distributed under the SIL Open Font License. The font notice and full license are in [font-license.txt](./font-license.txt).

