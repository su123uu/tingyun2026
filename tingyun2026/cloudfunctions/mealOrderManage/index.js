const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const IDLE_SESSION_MINUTES = 20;
const ORDERED_SESSION_HOURS = 8;
const ACTIVE_ORDER_STATUSES = ['pending_notice', 'kitchen_notified', 'preparing'];
const DEFAULT_ENV_ID = 'cloud1-d6gzs6wuu4b4e902e';
const DEFAULT_PAY_SUB_MCH_ID = '1113835285';
const PAY_CALLBACK_FUNCTION = 'payCallback';

function now() {
  return new Date();
}

function ok(data) {
  return { ok: true, data };
}

function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, code, message };
}

function assert(condition, code, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function businessTimestamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function randomCode(length = 4) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function createBusinessId(prefix) {
  return `${prefix}${businessTimestamp(now())}${randomCode(4)}`;
}

function moneyToCents(value) {
  return Math.round(toNumber(value, 0) * 100);
}

function getPaySubMchId() {
  return process.env.WECHAT_PAY_SUB_MCH_ID || DEFAULT_PAY_SUB_MCH_ID;
}

function getPayEnvId() {
  return process.env.WX_CLOUD_ENV_ID || process.env.TCB_ENV || DEFAULT_ENV_ID;
}

function getPayCallbackFunction() {
  return process.env.WECHAT_PAY_CALLBACK_FUNCTION || PAY_CALLBACK_FUNCTION;
}

async function safeCallNotification(data) {
  try {
    return await cloud.callFunction({
      name: 'notificationManage',
      data,
    });
  } catch (error) {
    console.warn('notificationManage skipped', data && data.action, error);
    return null;
  }
}

function createSessionId() {
  return `TABLE_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCloudDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return value;
}

function parseTableCode(input = {}) {
  const rawCode = cleanText(input.code || input.scene, 300);
  const code = rawCode.startsWith('scene=') ? decodeURIComponent(rawCode.slice(6)) : rawCode;
  const params = {};

  if (code.includes('&') || code.includes('=')) {
    code.split('&').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key) params[key] = decodeURIComponent(value || '');
    });
  } else {
    const match = /^TY_TABLE:([^:]+):([^:]+)$/i.exec(code);
    if (match) {
      params.t = match[1];
      params.k = match[2];
    }
  }

  const tableId = cleanText(input.table_id || params.t, 80);
  const qrToken = cleanText(input.qr_token || params.k, 120);
  assert(tableId && qrToken, 'INVALID_TABLE_CODE', '桌码无效，请扫描后台生成的桌台二维码');
  return { table_id: tableId, qr_token: qrToken };
}

async function getTableByCode(input) {
  const parsed = parseTableCode(input);
  const result = await db.collection('meal_tables')
    .where({ table_id: parsed.table_id, qr_token: parsed.qr_token, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const table = result.data && result.data[0];
  assert(table, 'INVALID_TABLE_CODE', '桌码已失效，请联系店员重新扫码');
  assert(table.table_status === 'enabled', 'TABLE_DISABLED', '该桌台已停用，请联系店员');
  return table;
}

async function getSessionById(sessionId) {
  if (!sessionId) return null;
  const result = await db.collection('meal_table_sessions')
    .where({ session_id: sessionId, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function isActiveSession(session) {
  if (!session || session.session_status === 'closed') return false;
  if (!session.expires_at) return true;
  return new Date(session.expires_at).getTime() > Date.now();
}

function idleSessionExpiresAt(session) {
  const baseValue = session.created_at || session.updated_at || session.expires_at;
  const baseTime = new Date(baseValue).getTime();
  if (!Number.isFinite(baseTime)) return 0;
  return baseTime + IDLE_SESSION_MINUTES * 60 * 1000;
}

function isIdleSessionActive(session) {
  if (!session || session.session_status === 'closed') return false;
  return idleSessionExpiresAt(session) > Date.now();
}

function sessionPublicShape(session) {
  return {
    _id: session._id,
    session_id: session.session_id,
    table_id: session.table_id,
    table_name: session.table_name || session.table_id,
    table_area: session.table_area || '',
    people_count: session.people_count || 1,
    has_order: session.has_order === true,
    created_at: normalizeCloudDate(session.created_at),
    expires_at: normalizeCloudDate(session.expires_at),
  };
}

async function sessionHasOrders(session) {
  if (!session) return false;
  if (session.has_order === true) return true;
  const orders = await listOrdersBySession(session.session_id);
  return orders.length > 0;
}

async function closeSession(session, reason = 'closed') {
  if (!session || !session._id) return;
  await db.collection('meal_table_sessions').doc(session._id).update({
    data: {
      session_status: 'closed',
      closed_reason: reason,
      closed_at: now(),
      updated_at: now(),
    },
  });
}

async function clearCurrentSession(tableId, sessionId) {
  const result = await db.collection('meal_tables')
    .where({ table_id: tableId, current_session_id: sessionId, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const table = result.data && result.data[0];
  if (!table || !table._id) return;
  await db.collection('meal_tables').doc(table._id).update({
    data: { current_session_id: '', updated_at: now() },
  });
}

async function startTableSession(input = {}, wxContext = {}) {
  const peopleCount = Math.max(1, Math.floor(toNumber(input.people_count, 1)));
  const table = await getTableByCode(input);
  await ensureUser(wxContext, { customer_type: 'guest' });
  const existing = await getSessionById(table.current_session_id);
  if (existing && existing.session_status !== 'closed') {
    const hasOrders = await sessionHasOrders(existing);
    if (hasOrders && isActiveSession(existing)) return sessionPublicShape(existing);
    if (!hasOrders && isIdleSessionActive(existing)) return sessionPublicShape(existing);
    await closeSession(existing, hasOrders ? 'expired_ordered' : 'idle_no_order');
    await clearCurrentSession(table.table_id, existing.session_id);
  }

  const sessionId = createSessionId();
  const expiresAt = new Date(Date.now() + IDLE_SESSION_MINUTES * 60 * 1000);
  const session = {
    session_id: sessionId,
    table_id: table.table_id,
    table_name: table.table_name || table.table_id,
    table_area: table.table_area || '',
    people_count: peopleCount,
    user_id: wxContext.OPENID || '',
    created_by_openid: wxContext.OPENID || '',
    session_status: 'active',
    has_order: false,
    created_at: now(),
    updated_at: now(),
    expires_at: expiresAt,
    is_deleted: false,
  };
  const addResult = await db.collection('meal_table_sessions').add({ data: session });
  await db.collection('meal_tables').doc(table._id).update({
    data: { current_session_id: sessionId, updated_at: now() },
  });
  return sessionPublicShape(Object.assign({}, session, { _id: addResult._id }));
}

async function resolveCurrentSession(input = {}) {
  const sessionId = cleanText(input.session_id, 120);
  assert(sessionId, 'TABLE_SESSION_REQUIRED', 'Please scan the table QR code first.');
  const session = await getSessionById(sessionId);
  const hasOrders = await sessionHasOrders(session);
  const active = hasOrders ? isActiveSession(session) : isIdleSessionActive(session);
  if (!active && session) {
    await closeSession(session, hasOrders ? 'expired_ordered' : 'idle_no_order');
    await clearCurrentSession(session.table_id, session.session_id);
  }
  assert(active, 'TABLE_SESSION_EXPIRED', 'Table session expired, please scan the table QR code again.');
  return session;
}
async function findMember(mobile) {
  const cleanMobile = cleanText(mobile, 20);
  if (!cleanMobile) return null;
  const result = await db.collection('members')
    .where({ mobile: cleanMobile, member_status: 'active', is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function userUpdateData(existing = {}, profile = {}) {
  const timestamp = now();
  const data = {
    last_login_at: timestamp,
    updated_at: timestamp,
    is_deleted: false,
  };
  const mobile = cleanText(profile.mobile, 20);
  const nickname = cleanText(profile.nickname || profile.customer_name, 80);
  const avatarUrl = cleanText(profile.avatar_url, 300);
  const memberId = cleanText(profile.member_id, 120);
  const customerType = cleanText(profile.customer_type, 20);

  if (mobile) data.mobile = mobile;
  if (nickname) data.nickname = nickname;
  if (avatarUrl) data.avatar_url = avatarUrl;
  if (customerType === 'member') {
    data.customer_type = 'member';
    data.member_id = memberId;
  } else if (customerType === 'guest') {
    data.customer_type = existing.customer_type === 'member' && !mobile ? existing.customer_type : 'guest';
    if (mobile || profile.clear_member === true) data.member_id = '';
  }

  return data;
}

async function ensureUser(wxContext = {}, profile = {}) {
  const openid = cleanText(wxContext.OPENID || profile.openid, 120);
  if (!openid) return null;

  const result = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get();
  const existing = result.data && result.data[0];
  const data = userUpdateData(existing || {}, profile);

  if (existing && existing._id) {
    await db.collection('users').doc(existing._id).update({ data });
    return Object.assign({}, existing, data);
  }

  const created = Object.assign({
    user_id: openid,
    openid,
    mobile: '',
    nickname: '',
    avatar_url: '',
    member_id: '',
    customer_type: 'guest',
    created_at: now(),
  }, data);
  await db.collection('users').add({ data: created });
  return created;
}

async function getCustomer(input = {}) {
  const member = await findMember(input.mobile || input.customer_mobile);
  return member
    ? {
      customer_type: 'member',
      member_id: member.member_id || '',
      customer_name: member.member_name || '',
      customer_mobile: member.mobile || '',
    }
    : {
      customer_type: 'guest',
      member_id: '',
      customer_name: cleanText(input.contact_name || input.customer_name, 80),
      customer_mobile: cleanText(input.mobile || input.customer_mobile, 20),
    };
}

async function getMenuItemsByIds(ids) {
  if (!ids.length) return [];
  const result = await db.collection('meal_items')
    .where({ item_id: _.in(ids), is_deleted: _.neq(true), is_available: true })
    .limit(100)
    .get();
  return result.data || [];
}

async function buildOrderItems(cartItems = []) {
  const merged = {};
  cartItems.forEach((entry) => {
    const itemId = cleanText(entry.item_id, 80);
    const quantity = Math.floor(toNumber(entry.quantity, 0));
    if (itemId && quantity > 0) merged[itemId] = (merged[itemId] || 0) + quantity;
  });
  const ids = Object.keys(merged);
  assert(ids.length, 'EMPTY_CART', '购物车为空');

  const menuItems = await getMenuItemsByIds(ids);
  assert(menuItems.length === ids.length, 'ITEM_NOT_AVAILABLE', '部分菜品已下架或不可售，请重新选择');
  const menuMap = {};
  menuItems.forEach((item) => { menuMap[item.item_id] = item; });
  return ids.map((itemId) => {
    const item = menuMap[itemId];
    const price = toNumber(item.price, 0);
    const quantity = merged[itemId];
    return {
      item_id: itemId,
      category_key: item.category_key || '',
      category_name: item.category_name || '',
      name: item.name || itemId,
      price,
      member_price: item.member_price === undefined || item.member_price === null ? null : toNumber(item.member_price, 0),
      image: item.image || item.image_url || '',
      quantity,
      amount: price * quantity,
    };
  });
}

async function listOrdersBySession(sessionId) {
  const result = await db.collection('meal_orders')
    .where({ session_id: sessionId, is_deleted: _.neq(true) })
    .orderBy('created_at', 'asc')
    .limit(100)
    .get();
  return result.data || [];
}

function isPrimaryOrder(order) {
  return !order.parent_order_no && !order.parent_order_id;
}

function isActiveOrder(order) {
  const values = [order.order_status, order.kitchen_status].map((value) => cleanText(value, 40));
  return values.some((value) => ACTIVE_ORDER_STATUSES.includes(value)) || !values.some((value) => ['completed', 'cancelled', 'closed'].includes(value));
}

function appendOrdersFor(order, orders) {
  const orderNo = order.order_no || order.order_id;
  return orders.filter((entry) => (entry.parent_order_no || entry.parent_order_id) === orderNo);
}

function orderPublicShape(order) {
  return Object.assign({}, order, {
    order_id: order.order_id || order.order_no,
    order_no: order.order_no || order.order_id,
    created_at: normalizeCloudDate(order.created_at),
    updated_at: normalizeCloudDate(order.updated_at),
    paid_at: normalizeCloudDate(order.paid_at),
    settled_at: normalizeCloudDate(order.settled_at),
  });
}

function hydrateOrder(order, orders) {
  const appendOrders = appendOrdersFor(order, orders).map(orderPublicShape);
  const batches = [orderPublicShape(order)].concat(appendOrders).map((entry, index) => Object.assign({}, entry, {
    batch_title: index === 0 ? '首单' : `追加菜 ${index}`,
  }));
  const totalAmount = batches.reduce((sum, entry) => sum + toNumber(entry.amount || entry.total_amount, 0), 0);
  return Object.assign(orderPublicShape(order), {
    append_orders: appendOrders,
    batches,
    all_items: batches.reduce((items, entry) => items.concat(entry.items || []), []),
    total_amount: totalAmount,
    amount: totalAmount,
    pay_amount: totalAmount,
  });
}

async function createMealOrder(input = {}, wxContext = {}) {
  const session = await resolveCurrentSession(input);
  const customer = await getCustomer(input);
  const items = await buildOrderItems(input.items || input.cart_items || []);
  const amount = items.reduce((sum, item) => sum + item.amount, 0);
  const requiresWechatPay = customer.customer_type !== 'member';
  const orders = await listOrdersBySession(session.session_id);
  const primaryOrder = orders.find((order) => isPrimaryOrder(order) && isActiveOrder(order));
  const appendCount = primaryOrder ? appendOrdersFor(primaryOrder, orders).length : 0;
  const orderNo = createBusinessId('TYMEAL');
  const primaryOrderNo = primaryOrder ? (primaryOrder.order_no || primaryOrder.order_id) : '';
  const batchNo = primaryOrder ? appendCount + 2 : 1;
  const quickRemarks = Array.isArray(input.quick_remarks) ? input.quick_remarks.map((item) => cleanText(item, 40)).filter(Boolean) : [];
  await ensureUser(wxContext, {
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    mobile: customer.customer_mobile,
    customer_name: customer.customer_name,
    clear_member: customer.customer_type === 'guest',
  });
  const data = {
    order_id: orderNo,
    order_no: orderNo,
    session_id: session.session_id,
    parent_order_no: primaryOrderNo,
    parent_order_id: primaryOrderNo,
    order_type: primaryOrder ? 'append' : 'primary',
    batch_no: batchNo,
    detail_order_no: primaryOrderNo,
    detail_order_id: primaryOrderNo,
    table_id: session.table_id,
    table_name: session.table_name || session.table_id,
    people_count: session.people_count || 1,
    user_id: wxContext.OPENID || '',
    created_by_openid: wxContext.OPENID || '',
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    customer_name: customer.customer_name,
    customer_mobile: customer.customer_mobile,
    items,
    amount,
    total_amount: amount,
    pay_amount: amount,
    points_amount: 0,
    wechat_pay_amount: requiresWechatPay ? amount : 0,
    remark: cleanText(input.remark, 200),
    quick_remarks: quickRemarks,
    kitchen_status: requiresWechatPay ? 'pending_notice' : 'kitchen_notified',
    settlement_status: requiresWechatPay ? 'pending_wechat_pay' : 'pending_offline_points',
    order_status: requiresWechatPay ? 'pending_payment' : 'kitchen_notified',
    payment_status: requiresWechatPay ? 'pending_wechat_pay' : 'pending_offline',
    admin_remark: '',
    created_at: now(),
    updated_at: now(),
    is_deleted: false,
  };
  await db.collection('meal_orders').add({ data });
  await safeCallNotification({
    action: 'registerSubscription',
    business_type: 'meal_order',
    business_no: orderNo,
    openid: wxContext.OPENID || '',
    template_keys: ['mealOrderStatus'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/order-detail/order-detail?id=${primaryOrderNo || orderNo}`,
  });
  if (!requiresWechatPay) {
    await safeCallNotification({
      action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: orderNo,
    title: primaryOrder ? '追加点餐通知' : '新点餐订单',
      payload: data,
    });
  }
  if (session._id) {
    await db.collection('meal_table_sessions').doc(session._id).update({
      data: {
        has_order: true,
        ordered_at: now(),
        expires_at: new Date(Date.now() + ORDERED_SESSION_HOURS * 60 * 60 * 1000),
        updated_at: now(),
      },
    });
  }
  return orderPublicShape(data);
}

async function findOrder(orderNo) {
  const result = await db.collection('meal_orders')
    .where({ order_no: orderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function createMealPayment(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(!order.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.created_by_openid === wxContext.OPENID, 'FORBIDDEN', '无权支付该订单');
  assert(order.customer_type !== 'member', 'MEMBER_OFFLINE_PAYMENT', '会员订单请线下会员账户核对');
  assert(order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '订单已支付');

  const totalFee = moneyToCents(order.wechat_pay_amount || order.pay_amount || order.total_amount || order.amount);
  assert(totalFee > 0, 'INVALID_PAY_AMOUNT', '支付金额必须大于 0 元');
  assert(cloud.cloudPay && cloud.cloudPay.unifiedOrder, 'CLOUD_PAY_UNAVAILABLE', '当前云函数环境不支持 cloudPay.unifiedOrder');

  const payResult = await cloud.cloudPay.unifiedOrder({
    body: `停云山居扫码点餐-${order.table_name || order.table_id || ''}`.slice(0, 120),
    outTradeNo: orderNo,
    spbillCreateIp: cleanText(input.spbill_create_ip, 64) || '127.0.0.1',
    subMchId: getPaySubMchId(),
    totalFee,
    envId: getPayEnvId(),
    functionName: getPayCallbackFunction(),
    attach: 'meal_order',
  });

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      payment_status: 'paying',
      payment_trade_no: orderNo,
      payment_total_fee: totalFee,
      payment_sub_mch_id: getPaySubMchId(),
      payment_requested_at: now(),
      updated_at: now(),
    },
  });

  return {
    order_no: orderNo,
    total_fee: totalFee,
    payment: payResult.payment || payResult,
    raw_payment: payResult,
  };
}

async function simulateWechatPay(input = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  await db.collection('meal_orders').doc(order._id).update({
    data: {
      settlement_status: 'settled',
      payment_status: 'settled',
      kitchen_status: 'kitchen_notified',
      order_status: 'kitchen_notified',
      paid_at: now(),
      settled_at: now(),
      updated_at: now(),
    },
  });
  return Object.assign(orderPublicShape(order), {
    settlement_status: 'settled',
    payment_status: 'settled',
    paid_at: now().toISOString(),
    settled_at: now().toISOString(),
  });
}

async function listMealOrders(input = {}, wxContext = {}) {
  const openid = wxContext.OPENID || '';
  let query = db.collection('meal_orders').where(Object.assign({ is_deleted: _.neq(true) }, openid ? { created_by_openid: openid } : {}));
  query = query.orderBy('created_at', 'desc').limit(100);
  const result = await query.get();
  const orders = result.data || [];
  return orders.filter((order) => !order.user_deleted_at && isPrimaryOrder(order)).map((order) => hydrateOrder(order, orders));
}

async function getMealOrderDetail(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findOrder(orderNo);
  assert(found, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const parentOrderNo = found.parent_order_no || found.parent_order_id;
  const primary = parentOrderNo ? await findOrder(parentOrderNo) : found;
  assert(primary, 'MEAL_ORDER_NOT_FOUND', '未找到点餐主订单');
  assert(!primary.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const orders = await listOrdersBySession(primary.session_id);
  const openid = wxContext.OPENID || '';
  const canView = !openid || orders.some((order) => order.created_by_openid === openid);
  assert(canView, 'FORBIDDEN', '无权查看该订单');
  return hydrateOrder(primary, orders);
}

async function deleteMealOrder(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findOrder(orderNo);
  assert(found, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const parentOrderNo = found.parent_order_no || found.parent_order_id;
  const primary = parentOrderNo ? await findOrder(parentOrderNo) : found;
  assert(primary, 'MEAL_ORDER_NOT_FOUND', '未找到点餐主订单');
  const openid = wxContext.OPENID || '';
  assert(!openid || primary.created_by_openid === openid, 'FORBIDDEN', '无权删除该订单');
  const deletedAt = now();
  const data = {
    user_deleted_at: deletedAt,
    user_deleted_by_openid: openid,
    updated_at: now(),
  };
  await db.collection('meal_orders').doc(primary._id).update({ data });
  await db.collection('meal_orders')
    .where({ parent_order_no: primary.order_no, is_deleted: _.neq(true) })
    .update({ data });
  await db.collection('meal_orders')
    .where({ parent_order_id: primary.order_no, is_deleted: _.neq(true) })
    .update({ data });
  return { order_no: primary.order_no, user_deleted_at: deletedAt.toISOString() };
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  const wxContext = cloud.getWXContext();
  try {
    if (action === 'parseTableCode') return ok(parseTableCode(event));
    if (action === 'startTableSession') return ok(await startTableSession(event, wxContext));
    if (action === 'createMealOrder') return ok(await createMealOrder(event, wxContext));
    if (action === 'createMealPayment') return ok(await createMealPayment(event, wxContext));
    if (action === 'simulateWechatPay') return ok(await simulateWechatPay(event));
    if (action === 'listMealOrders') return ok(await listMealOrders(event, wxContext));
    if (action === 'getMealOrderDetail') return ok(await getMealOrderDetail(event, wxContext));
    if (action === 'deleteMealOrder') return ok(await deleteMealOrder(event, wxContext));
    return fail('不支持的点餐操作', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('mealOrderManage failed', action, error);
    return fail(error.message || '点餐操作失败', error.code || 'SERVER_ERROR');
  }
};
