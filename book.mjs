export const VENUES = [
  { id: 'arc', name: 'Arc Exchange', short: 'Arc', latency: 1, maker: -1, taker: 3, color: '#62ebc7' },
  { id: 'ion', name: 'Ion Exchange', short: 'Ion', latency: 2, maker: 1, taker: 0, color: '#a7b8ff' },
];
export const opposite = side => side === 'buy' ? 'sell' : 'buy';
export const direction = side => side === 'buy' ? 1 : -1;

// Prices are integer cents. Fees and currency accounting are integer thousandths of a dollar.
export class Book {
  constructor(venue) {
    this.venue = venue;
    this.sides = { buy: [], sell: [] };
  }

  best(side) { return this.sides[side][0]?.price ?? null; }

  levels(side, depth = 6) {
    const result = [];
    for (const order of this.sides[side]) {
      let level = result.at(-1);
      if (!level || level.price !== order.price) {
        if (result.length >= depth) break;
        level = { price: order.price, qty: 0, own: 0, count: 0 };
        result.push(level);
      }
      level.qty += order.qty;
      level.count++;
      if (order.child) level.own += order.qty;
    }
    return result;
  }

  cancel(id) {
    for (const side of ['buy', 'sell']) {
      const list = this.sides[side];
      const at = list.findIndex(o => o.id === id);
      if (at >= 0) return list.splice(at, 1)[0];
    }
    return null;
  }

  withdraw(test) {
    for (const side of ['buy','sell']) this.sides[side] = this.sides[side].filter(o => !test(o));
  }

  ahead(id, side) {
    const list = this.sides[side];
    const at = list.findIndex(o => o.id === id);
    if (at < 0) return 0;
    const price = list[at].price;
    return list.slice(0, at).reduce((sum, o) => sum + (o.price === price ? o.qty : 0), 0);
  }

  // An unpriced or IOC order may sweep several levels. Equal price joins the end of its queue.
  submit(order, onTrade = () => {}) {
    if (!['buy','sell'].includes(order.side) || !Number.isSafeInteger(order.qty) || order.qty <= 0 ||
        (order.price !== null && (!Number.isSafeInteger(order.price) || order.price <= 0))) {
      throw new Error('Invalid exchange order');
    }
    const sign = direction(order.side);
    const other = this.sides[opposite(order.side)];
    while (order.qty && other.length) {
      const maker = other[0];
      if (order.price !== null && sign * (maker.price - order.price) > 0) break;
      const qty = Math.min(order.qty, maker.qty);
      order.qty -= qty;
      maker.qty -= qty;
      onTrade({ venue: this.venue, price: maker.price, qty, maker, taker: order });
      if (!maker.qty) other.shift();
    }
    if (order.qty && order.price !== null && !order.ioc) {
      const own = this.sides[order.side];
      const firstWorse = own.findIndex(o => sign * (order.price - o.price) > 0);
      if (firstWorse < 0) own.push(order); else own.splice(firstWorse, 0, order);
      return true;
    }
    return false;
  }
}

export function consolidated(books) {
  const bids = books.map(b => b.best('buy')).filter(Number.isInteger);
  const asks = books.map(b => b.best('sell')).filter(Number.isInteger);
  if (!bids.length || !asks.length) throw new Error('The market needs a two sided quote.');
  const bid = Math.max(...bids), ask = Math.min(...asks);
  return { bid, ask, mid: (bid + ask) * 5, spread: ask - bid };
}

export function expectedSweep(book, side, qty) {
  let remaining = qty, notional = 0, last = 0;
  for (const resting of book.sides[opposite(side)]) {
    const count = Math.min(resting.qty, remaining);
    notional += count * resting.price * 10;
    remaining -= count; last = resting.price;
    if (!remaining) break;
  }
  if (!last) return Infinity;
  // Use a disclosed depth penalty for an amount the displayed book cannot fill.
  return direction(side) * (notional + remaining * last * 10) / qty + (remaining / qty) * 300 + VENUES[book.venue].taker;
}

