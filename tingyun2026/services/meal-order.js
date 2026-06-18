const storage = require('../utils/storage');
const createBusinessId = require('../utils/id').createBusinessId;
const assert = require('../utils/validators').assert;
const auth = require('./auth');
const cart = require('./cart');
const table = require('./table-session');

const KEY = 'meal_orders';
const getOrders = () => storage.get(KEY, []);
const save = (orders) => storage.set(KEY, orders);

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
}

async function callMealCloud(action, data = {}) {
  if (!canUseCloud()) {
    const error = new Error('Cloud unavailable');
    error.code = 'CLOUD_UNAVAILABLE';
    throw error;
  }
  const result = await wx.cloud.callFunction({
    name: 'mealOrderManage',
    data: Object.assign({}, data, { action }),
  });
  const body = result && result.result ? result.result : result;
  if (!body || body.ok !== true) {
    const error = new Error((body && body.message) || 'MEAL_CLOUD_FAILED');
    error.code = (body && body.code) || 'CLOUD_FUNCTION_FAILED';
    error.fromCloudResult = true;
    throw error;
  }
  return body.data;
}

function activeBatches(batches = []) {
  return batches.filter((batch) => !['cancelled', 'canceled'].includes(batch.payment_status || batch.settlement_status));
}

function batchTitle(batchNo) {
  return batchNo === 1 ? '首单' : `加菜第 ${batchNo - 1} 次`;
}

function paymentNoFor(orderNo, batchNo) {
  return `${orderNo}B${batchNo}`;
}

function totalAmount(batches = []) {
  return activeBatches(batches).reduce((sum, batch) => sum + (Number(batch.amount) || 0), 0);
}

function aggregateItems(batches = []) {
  const map = {};
  activeBatches(batches).forEach((batch) => {
    (batch.items || []).forEach((item) => {
      if (!item.item_id) return;
      if (!map[item.item_id]) map[item.item_id] = Object.assign({}, item, { quantity: 0, amount: 0 });
      map[item.item_id].quantity += Number(item.quantity) || 0;
      map[item.item_id].amount += Number(item.amount) || (Number(item.price) || 0) * (Number(item.quantity) || 0);
    });
  });
  return Object.keys(map).map((itemId) => map[itemId]);
}

function normalizeOrder(order) {
  const batches = (order.batches || []).map((batch, index) => {
    const batchNo = Number(batch.batch_no) || index + 1;
    return Object.assign({}, batch, {
      batch_no: batchNo,
      batch_type: batch.batch_type || (batchNo === 1 ? 'primary' : 'append'),
      batch_title: batch.batch_title || batchTitle(batchNo),
      payment_no: batch.payment_no || paymentNoFor(order.order_no || order.order_id, batchNo),
    });
  });
  const amount = totalAmount(batches);
  const visibleBatches = activeBatches(batches);
  return Object.assign({}, order, {
    order_id: order.order_id || order.order_no,
    order_no: order.order_no || order.order_id,
    batches: visibleBatches,
    all_items: visibleBatches.reduce((items, batch) => items.concat(batch.items || []), []),
    items: aggregateItems(batches),
    total_amount: amount,
    amount,
    pay_amount: amount,
  });
}

function findActiveOrder(sessionId, orders) {
  return orders.find((order) => (
    order.session_id === sessionId
    && !order.user_deleted_at
    && !['completed', 'cancelled', 'canceled', 'closed', 'refunded'].includes(order.order_status)
  ));
}

async function localCreateMealOrder(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  assert(session, 'TABLE_SESSION_REQUIRED', 'TABLE_SESSION_REQUIRED');
  assert(currentCart.items.length, 'EMPTY_CART', 'EMPTY_CART');

  const orders = getOrders();
  const primary = findActiveOrder(session.session_id, orders);
  const orderNo = primary ? primary.order_no : createBusinessId('TYMEAL');
  const customerType = session.customer_type === 'member' ? 'member' : 'guest';
  const needsPay = false;
  const batches = primary ? (primary.batches || []) : [];
  const batchNo = batches.length + 1;
  const amount = currentCart.total_amount;
  const batch = {
    batch_no: batchNo,
    batch_type: batchNo === 1 ? 'primary' : 'append',
    batch_title: batchTitle(batchNo),
    order_no: orderNo,
    payment_no: paymentNoFor(orderNo, batchNo),
    items: currentCart.items,
    amount,
    total_amount: amount,
    pay_amount: amount,
    wechat_pay_amount: needsPay ? amount : 0,
    remark: input.remark || '',
    quick_remarks: input.quick_remarks || [],
    settlement_status: 'pending_checkout',
    payment_status: 'pending_checkout',
    order_status: 'preparing',
    created_at: new Date().toISOString(),
  };

  let order;
  if (primary) {
    primary.batches = batches.concat(batch);
    primary.items = aggregateItems(primary.batches);
    primary.amount = totalAmount(primary.batches);
    primary.total_amount = primary.amount;
    primary.pay_amount = primary.amount;
    primary.payment_status = 'pending_checkout';
    primary.settlement_status = 'pending_checkout';
    primary.order_status = 'preparing';
    primary.updated_at = new Date().toISOString();
    order = primary;
  } else {
    order = {
      order_id: orderNo,
      order_no: orderNo,
      session_id: session.session_id,
      table_id: session.table_id,
      table_name: session.table_name || session.table_id,
      table_area: session.table_area || '',
      people_count: session.people_count || 1,
      customer_type: customerType,
      member_id: session.member_id || '',
      customer_name: session.customer_name || '',
      customer_mobile: session.customer_mobile || '',
      batches: [batch],
      items: currentCart.items,
      amount,
      total_amount: amount,
      pay_amount: amount,
      wechat_pay_amount: needsPay ? amount : 0,
      remark: input.remark || '',
      quick_remarks: input.quick_remarks || [],
      settlement_status: 'pending_checkout',
      payment_status: 'pending_checkout',
      order_status: batch.order_status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    orders.push(order);
  }

  save(orders);
  if (!needsPay) await table.markCurrentTableOrdered();
  if (input.keep_cart !== true) await cart.clearCart();
  return Object.assign(normalizeOrder(order), {
    batch_no: batchNo,
    batch_type: batch.batch_type,
    payment_no: batch.payment_no,
    current_batch_amount: amount,
  });
}

async function createMealOrder(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  const user = await auth.getCurrentUser();
  assert(session, 'TABLE_SESSION_REQUIRED', 'TABLE_SESSION_REQUIRED');
  assert(currentCart.items.length, 'EMPTY_CART', 'EMPTY_CART');
  try {
    const order = await callMealCloud('createMealOrder', {
      session_id: session.session_id,
      items: currentCart.items.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
      remark: input.remark || '',
      quick_remarks: input.quick_remarks || [],
      mobile: input.customer_mobile || user.mobile || '',
      customer_mobile: input.customer_mobile || user.mobile || '',
      customer_name: input.customer_name || user.nickname || '',
      member_id: input.member_id || user.member_id || '',
      notification_subscriptions: input.notification_subscriptions || {},
    });
    if (order.customer_type === 'member' || order.payment_status === 'pending_offline') {
      await table.markCurrentTableOrdered();
    }
    if (input.keep_cart !== true) await cart.clearCart();
    return order;
  } catch (error) {
    if (error.code !== 'CLOUD_UNAVAILABLE') throw error;
    console.warn('mealOrderManage createMealOrder fallback to local', error);
    return localCreateMealOrder(input);
  }
}

async function createMealOrderAndPayment(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  const user = await auth.getCurrentUser();
  assert(session, 'TABLE_SESSION_REQUIRED', 'TABLE_SESSION_REQUIRED');
  assert(currentCart.items.length, 'EMPTY_CART', 'EMPTY_CART');
  try {
    return await callMealCloud('createMealOrderAndPayment', {
      session_id: session.session_id,
      items: currentCart.items.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
      remark: input.remark || '',
      quick_remarks: input.quick_remarks || [],
      mobile: input.customer_mobile || user.mobile || '',
      customer_mobile: input.customer_mobile || user.mobile || '',
      customer_name: input.customer_name || user.nickname || '',
      member_id: input.member_id || user.member_id || '',
      notification_subscriptions: input.notification_subscriptions || {},
    });
  } catch (error) {
    if (error.code !== 'CLOUD_UNAVAILABLE') throw error;
    console.warn('mealOrderManage createMealOrderAndPayment fallback to local order only', error);
    return { order: await localCreateMealOrder(input) };
  }
}

async function createMealPayment(input = {}) {
  return callMealCloud('createMealPayment', input);
}

async function checkoutMealOrder(input = {}) {
  const user = await auth.getCurrentUser();
  return callMealCloud('checkoutMealOrder', Object.assign({}, input, {
    mobile: input.customer_mobile || user.mobile || '',
    customer_mobile: input.customer_mobile || user.mobile || '',
    customer_name: input.customer_name || user.nickname || '',
    member_id: input.member_id || user.member_id || '',
  }));
}

async function listMealOrders() {
  try {
    return await callMealCloud('listMealOrders');
  } catch (error) {
    console.warn('mealOrderManage listMealOrders fallback to local', error);
    return getOrders().filter((order) => !order.user_deleted_at).map(normalizeOrder);
  }
}

async function getMealOrderDetail(input) {
  try {
    const session = await table.getCurrentTableSession();
    return await callMealCloud('getMealOrderDetail', Object.assign({}, input, {
      session_id: input.session_id || (session && session.session_id) || '',
    }));
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage getMealOrderDetail fallback to local', error);
  }
  const orderNo = input.order_no || input.order_id;
  const found = getOrders().find((order) => (order.order_no || order.order_id) === orderNo && !order.user_deleted_at);
  assert(found, 'MEAL_ORDER_NOT_FOUND', 'MEAL_ORDER_NOT_FOUND');
  return normalizeOrder(found);
}

async function deleteMealOrder(input = {}) {
  try {
    return await callMealCloud('deleteMealOrder', input);
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage deleteMealOrder fallback to local', error);
  }
  const orderNo = input.order_no || input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => (entry.order_no || entry.order_id) === orderNo);
  const deletedAt = new Date().toISOString();
  if (order) order.user_deleted_at = deletedAt;
  save(orders);
  return { order_no: orderNo, user_deleted_at: deletedAt };
}

async function cancelMealOrder(input = {}) {
  try {
    return await callMealCloud('cancelMealOrder', input);
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage cancelMealOrder fallback to local', error);
  }
  const orderNo = input.order_no || input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => (entry.order_no || entry.order_id) === orderNo);
  if (!order) return { order_no: orderNo, order_status: 'cancelled' };
  const paymentNo = input.payment_no;
  const batchNo = Number(input.batch_no);
  order.batches = (order.batches || []).map((batch) => {
    const match = paymentNo ? batch.payment_no === paymentNo : Number(batch.batch_no) === batchNo;
    return match ? Object.assign({}, batch, {
      order_status: 'cancelled',
      payment_status: 'cancelled',
      settlement_status: 'cancelled',
      cancelled_reason: input.reason || 'payment_cancelled',
      cancelled_at: new Date().toISOString(),
    }) : batch;
  });
  order.items = aggregateItems(order.batches);
  order.amount = totalAmount(order.batches);
  order.total_amount = order.amount;
  order.pay_amount = order.amount;
  if (!activeBatches(order.batches).length) {
    order.order_status = 'cancelled';
    order.payment_status = 'cancelled';
    order.settlement_status = 'cancelled';
  }
  save(orders);
  return { order_no: orderNo, order_status: order.order_status };
}

module.exports = { createMealOrder, createMealOrderAndPayment, createMealPayment, checkoutMealOrder, listMealOrders, getMealOrderDetail, deleteMealOrder, cancelMealOrder };
