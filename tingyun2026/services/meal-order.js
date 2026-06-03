const storage = require('../utils/storage');
const createBusinessId = require('../utils/id').createBusinessId;
const assert = require('../utils/validators').assert;
const auth = require('./auth');
const cart = require('./cart');
const table = require('./table-session');

const KEY = 'meal_orders';
const getOrders = () => storage.get(KEY, []);
const save = (orders) => storage.set(KEY, orders);

function appendOrdersFor(order, orders) {
  return orders.filter((entry) => (entry.parent_order_no || entry.parent_order_id) === (order.order_no || order.order_id));
}

function hydrateOrder(order, orders) {
  const append_orders = appendOrdersFor(order, orders);
  const batches = [order].concat(append_orders).map((entry, index) => Object.assign({}, entry, {
    batch_title: index === 0 ? '首单' : `追加菜 ${index}`,
  }));
  const total_amount = batches.reduce((sum, entry) => sum + entry.amount, 0);
  return Object.assign({}, order, {
    append_orders,
    batches,
    all_items: batches.reduce((items, entry) => items.concat(entry.items || []), []),
    total_amount,
    amount: total_amount,
  });
}

function findPrimaryOrder(sessionId, orders) {
  return orders.find((entry) => entry.session_id === sessionId && !entry.parent_order_no && !entry.parent_order_id);
}

async function createMealOrder(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  const user = await auth.getCurrentUser();
  assert(session, 'TABLE_SESSION_REQUIRED', '请先扫描桌上的二维码');
  assert(currentCart.items.length, 'EMPTY_CART', '购物车为空');
  const member = user.customer_type === 'member';
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
    people_count: session.people_count,
    customer_type: user.customer_type,
    items: currentCart.items,
    amount: currentCart.total_amount,
    remark: input.remark || '',
    quick_remarks: input.quick_remarks || [],
    kitchen_status: member ? 'kitchen_notified' : 'pending_notice',
    settlement_status: member ? 'pending_offline_points' : 'pending_wechat_pay',
    created_at: new Date().toISOString(),
  };
  orders.push(order);
  save(orders);
  await cart.clearCart();
  return order;
}

async function simulateWechatPay(input) {
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.customer_type === 'guest', 'PAYMENT_NOT_REQUIRED', '会员订单由店员线下核对');
  order.settlement_status = 'settled';
  order.kitchen_status = 'kitchen_notified';
  order.paid_at = new Date().toISOString();
  save(orders);
  return order;
}

async function listMealOrders() {
  const orders = getOrders();
  return orders.filter((entry) => !entry.parent_order_no && !entry.parent_order_id).map((order) => hydrateOrder(order, orders));
}

async function getMealOrderDetail(input) {
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const found = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  const parentOrderNo = found && (found.parent_order_no || found.parent_order_id);
  const order = found && parentOrderNo
    ? orders.find((entry) => (entry.order_no || entry.order_id) === parentOrderNo)
    : found;
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  return hydrateOrder(order, orders);
}

module.exports = { createMealOrder, simulateWechatPay, listMealOrders, getMealOrderDetail };
