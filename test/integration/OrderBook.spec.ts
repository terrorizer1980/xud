import { expect } from 'chai';
import uuidv1 from 'uuid/v1';
import DB from '../../lib/db/DB';
import OrderBook from '../../lib/orderbook/OrderBook';
import Pool from '../../lib/p2p/Pool';
import Swaps from '../../lib/swaps/Swaps';
import SwapClientManager from '../../lib/swaps/SwapClientManager';
import LndClient from '../../lib/lndclient/LndClient';
import SwapClient from '../../lib/swaps/SwapClient';
import OrderBookRepository from '../../lib/orderbook/OrderBookRepository';
import Logger, { Level } from '../../lib/Logger';
import * as orders from '../../lib/orderbook/types';
import { SwapClientType, XuNetwork } from '../../lib/constants/enums';
import { createOwnOrder } from '../utils';
import sinon  from 'sinon';
import Config from '../../lib/Config';

const PAIR_ID = 'LTC/BTC';
const currencies = PAIR_ID.split('/');
const loggers = Logger.createLoggers(Level.Warn);

const getMockPool = (sandbox: sinon.SinonSandbox) => {
  const pool = sandbox.createStubInstance(Pool) as any;
  pool.broadcastOrder = () => {};
  pool.broadcastOrderInvalidation = () => {};
  pool.updatePairs = () => {};
  pool.getNetwork = () => XuNetwork.SimNet;
  return pool;
};

const getMockSwaps = (sandbox: sinon.SinonSandbox) => {
  const swaps = sandbox.createStubInstance(Swaps) as any;
  const lndBTC = sandbox.createStubInstance(LndClient) as any;
  const lndLTC = sandbox.createStubInstance(LndClient) as any;
  swaps.swapClientManager = sandbox.createStubInstance(SwapClientManager) as any;
  swaps.swapClientManager['swapClients'] = new Map<string, SwapClient>();
  swaps.swapClientManager['swapClients'].set('BTC', lndBTC);
  swaps.swapClientManager['swapClients'].set('LTC', lndLTC);
  swaps.swapClientManager.get = (currency: any) => {
    const client = swaps.swapClientManager['swapClients'].get(currency);
    if (!client) {
      throw new Error('unknown swap client');
    }
    return client;
  };
  return swaps;
};

const initValues = async (db: DB) => {
  const orderBookRepository = new OrderBookRepository(db.models);

  await orderBookRepository.addCurrencies([
    { id: currencies[0], swapClient: SwapClientType.Lnd, decimalPlaces: 8 },
    { id: currencies[1], swapClient: SwapClientType.Lnd, decimalPlaces: 8 },
  ]);
  await orderBookRepository.addPairs([
    { baseCurrency: currencies[0], quoteCurrency: currencies[1] },
  ]);
};

describe('OrderBook', () => {
  let sandbox: sinon.SinonSandbox;
  let db: DB;
  let swaps: Swaps;
  let orderBook: OrderBook;
  let config: Config;

  before(async () => {
    config = new Config();
    sandbox = sinon.createSandbox();
    db = new DB(loggers.db);
    await db.init();

    sandbox = sinon.createSandbox();
    const pool = getMockPool(sandbox);
    await initValues(db);

    swaps = getMockSwaps(sandbox);
    orderBook = new OrderBook({
      pool,
      swaps,
      thresholds: config.orderthresholds,
      logger: loggers.orderbook,
      models: db.models,
      nosanityswaps: true,
      nobalancechecks: true,
    });
    await orderBook.init();
  });

  const getOwnOrder = (order: orders.OwnOrder): orders.OwnOrder | undefined => {
    const ownOrders = orderBook.getOwnOrders(order.pairId);
    const arr = order.isBuy ? ownOrders.buyArray : ownOrders.sellArray;

    for (const orderItem of arr) {
      if (orderItem.id === order.id) {
        return orderItem;
      }
    }

    return;
  };

  it('should have trading pairs loaded', () => {
    orderBook.pairIds.forEach((pairId) => {
      expect(orderBook.tradingPairs).to.have.key(pairId);
    });
  });

  it('should append two new ownOrder', async () => {
    const order = { pairId: PAIR_ID, quantity: 5, price: 55, isBuy: true, hold: 0 };
    const { remainingOrder } = await orderBook.placeLimitOrder({ localId: uuidv1(), ...order });
    expect(remainingOrder).to.not.be.undefined;
    expect(orderBook.getOwnOrder(remainingOrder!.id, PAIR_ID)).to.not.be.undefined;
    await orderBook.placeLimitOrder({ localId: uuidv1(), ...order });
  });

  it('should fully match new ownOrder and remove matches', async () => {
    const order = { pairId: 'LTC/BTC', localId: uuidv1(), quantity: 6, price: 55, isBuy: false, hold: 0 };
    const matches = await orderBook.placeLimitOrder(order);
    expect(matches.remainingOrder).to.be.undefined;

    const firstMatch = matches.internalMatches[0];
    const secondMatch = matches.internalMatches[1];
    expect(firstMatch).to.not.be.undefined;
    expect(secondMatch).to.not.be.undefined;

    const firstMakerOrder = getOwnOrder(firstMatch);
    const secondMakerOrder = getOwnOrder(secondMatch);
    expect(firstMakerOrder).to.be.undefined;
    expect(secondMakerOrder).to.not.be.undefined;
    expect(secondMakerOrder!.quantity).to.equal(4);
  });

  it('should partially match new market order and discard remaining order', async () => {
    const order = { pairId: 'LTC/BTC', localId: uuidv1(), quantity: 10, isBuy: false, hold: 0 };
    const result = await orderBook.placeMarketOrder(order);
    const match = result.internalMatches[0];
    expect(result.remainingOrder).to.be.undefined;
    expect(getOwnOrder(match)).to.be.undefined;
  });

  it('should create, partially match, and remove an order', async () => {
    const order: orders.OwnOrder = createOwnOrder(10, 10, true);
    await orderBook.placeLimitOrder(order);
    const takerOrder: orders.OwnMarketOrder = { pairId: 'LTC/BTC', localId: uuidv1(), quantity: 5, isBuy: false };
    await orderBook.placeMarketOrder(takerOrder);
    expect(() => orderBook.removeOwnOrderByLocalId(order.localId)).to.not.throw();
  });

  it('should not add a new own order with a duplicated localId', async () => {
    const order: orders.OwnOrder = createOwnOrder(0.01, 10, false);

    await expect(orderBook.placeLimitOrder(order)).to.be.fulfilled;

    await expect(orderBook.placeLimitOrder(order)).to.be.rejected;

    expect(() => orderBook.removeOwnOrderByLocalId(order.localId)).to.not.throw();

    expect(() => orderBook.removeOwnOrderByLocalId(order.localId)).to.throw();

    await expect(orderBook.placeLimitOrder(order)).to.be.fulfilled;

    await expect(orderBook.placeLimitOrder(order)).to.be.rejected;
  });

  it('should place order with quantity higher than min quantity', async () => {
    orderBook['thresholds'] = { minQuantity : 10000 };
    const order: orders.OwnOrder = createOwnOrder(0.01, 1000000, false);

    await expect(orderBook.placeLimitOrder(order)).to.be.fulfilled;
  });

  it('should throw error if the order quantity exceeds min quantity', async () => {
    const order: orders.OwnOrder = createOwnOrder(0.01, 100, false);

    await expect(orderBook.placeLimitOrder(order)).to.be.rejected;
  });

  after(async () => {
    await db.close();
    sandbox.restore();
  });
});

describe('nomatching OrderBook', () => {
  let db: DB;
  let sandbox: sinon.SinonSandbox;
  let pool: Pool;
  let swaps: Swaps;
  let orderBook: OrderBook;
  let config: Config;

  before(async () => {
    config = new Config();
    db = new DB(loggers.db);
    await db.init();
    sandbox = sinon.createSandbox();
    swaps = getMockSwaps(sandbox);
    pool = getMockPool(sandbox);
    await initValues(db);
  });

  beforeEach(async () => {
    orderBook = new OrderBook({
      pool,
      swaps,
      thresholds: config.orderthresholds,
      logger: loggers.orderbook,
      models: db.models,
      nomatching: true,
      nosanityswaps: true,
      nobalancechecks: true,
    });
    await orderBook.init();
  });

  it('should should not accept market orders', () => {
    const order = createOwnOrder(0.01, 10, true);
    expect(orderBook.placeMarketOrder(order)).to.be.rejected;
  });

  it('should accept but not match limit orders', async () => {
    const buyOrder = createOwnOrder(0.01, 10, true);
    const buyOrderResult = await orderBook.placeLimitOrder(buyOrder);
    expect(buyOrderResult.remainingOrder!.localId).to.be.equal(buyOrder.localId);
    expect(buyOrderResult.remainingOrder!.quantity).to.be.equal(buyOrder.quantity);

    const sellOrder = createOwnOrder(0.01, 10, false);
    const sellOrderResult = await orderBook.placeLimitOrder(sellOrder);
    expect(sellOrderResult.remainingOrder!.localId).to.be.equal(sellOrder.localId);
    expect(sellOrderResult.remainingOrder!.quantity).to.be.equal(sellOrder.quantity);
  });

  it('should not place the same order twice', async () => {
    const order = createOwnOrder(0.01, 10, true);
    await expect(orderBook.placeLimitOrder(order)).to.be.fulfilled;
    await expect(orderBook.placeLimitOrder(order)).to.be.rejected;
  });

  it('should not remove the same order twice', async () => {
    const order = createOwnOrder(0.01, 10, true);
    await expect(orderBook.placeLimitOrder(order)).to.be.fulfilled;
    expect(() => orderBook.removeOwnOrderByLocalId(order.localId)).to.not.throw();
    expect(() => orderBook.removeOwnOrderByLocalId(order.localId)).to.throw();
  });

  it('should allow own order partial removal, but should not find the order localId after it was fully removed', async () => {
    const order = createOwnOrder(0.01, 10, true);
    const { remainingOrder } = await orderBook.placeLimitOrder(order);

    orderBook['removeOwnOrder'](remainingOrder!.id, order.pairId, remainingOrder!.quantity - 1);
    orderBook['removeOwnOrder'](remainingOrder!.id, order.pairId, 1);

    expect(() => orderBook['removeOwnOrder'](remainingOrder!.id, order.pairId, 1)).to.throw;
  });

  it('should allow own order partial removal, but should not find the order id after it was fully removed', async () => {
    const order = createOwnOrder(0.01, 10, true);
    const { remainingOrder } = await orderBook.placeLimitOrder(order);

    orderBook['removeOwnOrder'](remainingOrder!.id, order.pairId, remainingOrder!.quantity - 1);
    orderBook['removeOwnOrder'](remainingOrder!.id, order.pairId, 1);

    expect(() => orderBook['removeOwnOrder'](remainingOrder!.id, order.pairId, 1)).to.throw;
  });

  describe('stampOwnOrder', () => {
    const ownOrder = () => {
      return {
        pairId: 'LTC/BTC',
        price: 0.008,
        quantity: 1000,
        isBuy: false,
        localId: '',
        hold: 0,
      };
    };

    it('has the same id and localId when localId not provided', async () => {
      const stampedOrder = orderBook['stampOwnOrder'](ownOrder());
      expect(stampedOrder.id).to.equal(stampedOrder.localId);
    });

    it('has the provided localId', async () => {
      const ownOrderWithLocalId = {
        ...ownOrder(),
        localId: uuidv1(),
      };
      const stampedOrder = orderBook['stampOwnOrder'](ownOrderWithLocalId);
      expect(stampedOrder.id).to.not.equal(stampedOrder.localId);
      expect(stampedOrder.localId).to.equal(ownOrderWithLocalId.localId);
    });

    it('throws an error when duplicate localId exists', async () => {
      const ownOrderWithLocalId = {
        ...ownOrder(),
        localId: uuidv1(),
      };
      orderBook['localIdMap'].set(ownOrderWithLocalId.localId, {
        id: ownOrderWithLocalId.localId,
        pairId: ownOrderWithLocalId.pairId,
      });
      expect(() => orderBook['stampOwnOrder'](ownOrderWithLocalId))
        .to.throw(`order with local id ${ownOrderWithLocalId.localId} already exists`);
    });
  });

  after(async () => {
    await db.close();
    sandbox.restore();
  });
});
