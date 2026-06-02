const storage = require('../utils/storage');
const createId = require('../utils/id').createId;
const assert = require('../utils/validators').assert;
const auth = require('./auth');
const cart = require('./cart');
const table = require('./table-session');

const KEY = 'meal_orders';
const getOrders = () => storage.get(KEY, []);
const save = (orders) => storage.set(KEY, orders);

async function createMealOrder(input = {}) {
  const session = await table.getCurrentTableSession();
  const currentCart = await cart.getCart();
  const user = await auth.getCurrentUser();
  assert(session, 'TABLE_SESSION_REQUIRED', '请先扫描桌上的二维码');
  assert(currentCart.items.length, 'EMPTY_CART', '购物车为空');
  const member = user.customer_type === 'member';
  const order = {
    order_id: createId('MEAL'),
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
  const orders = getOrders();
  orders.push(order);
  save(orders);
  await cart.clearCart();
  return order;
}

async function simulateWechatPay(input) {
  const order_id = input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => entry.order_id === order_id);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.customer_type === 'guest', 'PAYMENT_NOT_REQUIRED', '会员订单由店员线下核对');
  order.settlement_status = 'settled';
  order.kitchen_status = 'kitchen_notified';
  order.paid_at = new Date().toISOString();
  save(orders);
  return order;
}

async function listMealOrders() { return getOrders(); }

async function getMealOrderDetail(input) {
  const order_id = input.order_id;
  const order = getOrders().find((entry) => entry.order_id === order_id);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  return order;
}

module.exports = { createMealOrder, simulateWechatPay, listMealOrders, getMealOrderDetail };
