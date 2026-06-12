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
    const error = new Error((body && body.message) || '点餐云函数调用失败');
    error.code = (body && body.code) || 'CLOUD_FUNCTION_FAILED';
    error.fromCloudResult = true;
    throw error;
  }
  return body.data;
}

function appendOrdersFor(order, orders) {
  return orders.filter((entry) => (entry.parent_order_no || entry.parent_order_id) === (order.order_no || order.order_id));
}

function hydrateOrder(order, orders) {
  const append_orders = appendOrdersFor(order, orders);
  const batches = [order].concat(append_orders).map((entry, index) => Object.assign({}, entry, {
    batch_title: index === 0 ? '首单' : `追加菜 ${index}`,
  }));
  const total_amount = batches.reduce((sum, entry) => sum + (entry.amount || entry.total_amount || 0), 0);
  return Object.assign({}, order, {
    append_orders,
    batches,
    all_items: batches.reduce((items, entry) => items.concat(entry.items || []), []),
    total_amount,
    amount: total_amount,
    pay_amount: total_amount,
  });
}

function findPrimaryOrder(sessionId, orders) {
  return orders.find((entry) => entry.session_id === sessionId && !entry.parent_order_no && !entry.parent_order_id);
}

async function localCreateMealOrder(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  const user = await auth.getCurrentUser();
  assert(session, 'TABLE_SESSION_REQUIRED', '请先扫描桌上的二维码');
  assert(currentCart.items.length, 'EMPTY_CART', '购物车为空');
  const orders = getOrders();
  const primaryOrder = findPrimaryOrder(session.session_id, orders);
  const appendCount = primaryOrder ? appendOrdersFor(primaryOrder, orders).length : 0;
  const orderNo = createBusinessId('TYMEAL');
  const primaryOrderNo = primaryOrder ? (primaryOrder.order_no || primaryOrder.order_id) : '';
  const order = {
    order_no: orderNo,
    order_id: orderNo,
    session_id: session.session_id,
    parent_order_no: primaryOrderNo,
    parent_order_id: primaryOrderNo,
    order_type: primaryOrder ? 'append' : 'primary',
    batch_no: primaryOrder ? appendCount + 2 : 1,
    detail_order_no: primaryOrderNo,
    detail_order_id: primaryOrderNo,
    table_id: session.table_id,
    table_name: session.table_name || session.table_id,
    people_count: session.people_count,
    customer_type: user.customer_type,
    items: currentCart.items,
    amount: currentCart.total_amount,
    total_amount: currentCart.total_amount,
    pay_amount: currentCart.total_amount,
    remark: input.remark || '',
    quick_remarks: input.quick_remarks || [],
    kitchen_status: 'kitchen_notified',
    settlement_status: 'pending_offline_points',
    order_status: 'kitchen_notified',
    payment_status: 'pending_offline',
    created_at: new Date().toISOString(),
  };
  orders.push(order);
  save(orders);
  if (input.keep_cart !== true) await cart.clearCart();
  return order;
}

async function createMealOrder(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  const user = await auth.getCurrentUser();
  assert(session, 'TABLE_SESSION_REQUIRED', '请先扫描桌上的二维码');
  assert(currentCart.items.length, 'EMPTY_CART', '购物车为空');
  try {
    const order = await callMealCloud('createMealOrder', {
      session_id: session.session_id,
      items: currentCart.items.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
      remark: input.remark || '',
      quick_remarks: input.quick_remarks || [],
      mobile: user.mobile || '',
      customer_name: user.nickname || '',
      notification_subscriptions: input.notification_subscriptions || {},
    });
    if (input.keep_cart !== true) await cart.clearCart();
    return order;
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage createMealOrder fallback to local', error);
    return localCreateMealOrder(input);
  }
}

async function createMealPayment(input = {}) {
  return callMealCloud('createMealPayment', input);
}

async function simulateWechatPay(input) {
  try {
    return await callMealCloud('simulateWechatPay', input);
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage simulateWechatPay fallback to local', error);
  }
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  order.settlement_status = 'settled';
  order.payment_status = 'settled';
  order.kitchen_status = 'kitchen_notified';
  order.order_status = 'kitchen_notified';
  order.paid_at = new Date().toISOString();
  order.settled_at = order.paid_at;
  save(orders);
  return order;
}

async function listMealOrders() {
  try {
    return await callMealCloud('listMealOrders');
  } catch (error) {
    console.warn('mealOrderManage listMealOrders fallback to local', error);
    const orders = getOrders();
    return orders
      .filter((entry) => !entry.user_deleted_at && !entry.parent_order_no && !entry.parent_order_id)
      .map((order) => hydrateOrder(order, orders));
  }
}

async function getMealOrderDetail(input) {
  try {
    return await callMealCloud('getMealOrderDetail', input);
  } catch (error) {
    console.warn('mealOrderManage getMealOrderDetail fallback to local', error);
  }
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const found = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  assert(found, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const parentOrderNo = found && (found.parent_order_no || found.parent_order_id);
  const order = found && parentOrderNo
    ? orders.find((entry) => (entry.order_no || entry.order_id) === parentOrderNo)
    : found;
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(!order.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  return hydrateOrder(order, orders);
}

async function deleteMealOrder(input = {}) {
  try {
    return await callMealCloud('deleteMealOrder', input);
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage deleteMealOrder fallback to local', error);
  }
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const found = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  const parentOrderNo = found && (found.parent_order_no || found.parent_order_id);
  const primaryOrderNo = parentOrderNo || order_no;
  const deletedAt = new Date().toISOString();
  orders.forEach((entry) => {
    const entryOrderNo = entry.order_no || entry.order_id;
    if (entryOrderNo === primaryOrderNo || (entry.parent_order_no || entry.parent_order_id) === primaryOrderNo) {
      entry.user_deleted_at = deletedAt;
    }
  });
  save(orders);
  return { order_no: primaryOrderNo, user_deleted_at: deletedAt };
}

module.exports = { createMealOrder, createMealPayment, simulateWechatPay, listMealOrders, getMealOrderDetail, deleteMealOrder };
