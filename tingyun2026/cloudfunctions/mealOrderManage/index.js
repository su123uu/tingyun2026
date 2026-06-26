const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const IDLE_SESSION_MINUTES = 20;
const ORDERED_SESSION_HOURS = 8;
const ACTIVE_ORDER_STATUSES = ['preparing'];
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
    String(date.getFullYear()).slice(-2),
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
  return `${prefix}${businessTimestamp(now())}${randomCode(3)}`;
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
    const result = await cloud.callFunction({
      name: 'notificationManage',
      data,
    });
    const body = result && result.result ? result.result : result;
    if (!body || body.ok !== true) {
      console.warn('notificationManage returned failure', data && data.action, body);
      return null;
    }
    return body.data;
  } catch (error) {
    console.warn('notificationManage skipped', data && data.action, error);
    return null;
  }
}

async function safePrintMealOrder(orderNo, batchNo = 0) {
  try {
    return await cloud.callFunction({
      name: 'payCallback',
      data: {
        action: 'printMealOrder',
        order_no: orderNo,
        batch_no: batchNo,
      },
    });
  } catch (error) {
    console.warn('payCallback printMealOrder skipped', orderNo, error);
    return null;
  }
}

function runBackground(task, label) {
  Promise.resolve(task).catch((error) => {
    console.warn(label || 'background task skipped', error);
  });
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

async function getTableById(tableId) {
  const cleanTableId = cleanText(tableId, 80);
  assert(cleanTableId, 'TABLE_ID_REQUIRED', '缺少桌号');
  const result = await db.collection('meal_tables')
    .where({ table_id: cleanTableId, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const table = result.data && result.data[0];
  assert(table, 'TABLE_NOT_FOUND', '未找到桌台');
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
    qr_token: session.qr_token || '',
    table_name: session.table_name || session.table_id,
    table_area: session.table_area || '',
    people_count: session.people_count || 1,
    has_order: session.has_order === true,
    active_order_no: session.active_order_no || '',
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

async function closeOrderSession(order, reason = 'checkout_settled') {
  if (!order || !order.session_id) return;
  const session = await getSessionById(order.session_id);
  if (!session || !session._id) return;
  await closeSession(session, reason);
  await clearCurrentSession(session.table_id || order.table_id, session.session_id);
}

async function startTableSession(input = {}, wxContext = {}) {
  const peopleCount = Math.max(1, Math.floor(toNumber(input.people_count, 1)));
  const table = await getTableByCode(input);
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
    qr_token: table.qr_token || '',
    table_name: table.table_name || table.table_id,
    table_area: table.table_area || '',
    people_count: peopleCount,
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

async function startTableSessionForTest(input = {}, wxContext = {}) {
  const tableId = cleanText(input.table_id, 80);
  const table = await getTableById(tableId);
  return startTableSession(Object.assign({}, input, {
    table_id: table.table_id,
    qr_token: table.qr_token,
    code: '',
  }), wxContext);
}

async function getCurrentTableSessionByCode(input = {}) {
  const table = await getTableByCode(input);
  const existing = await getSessionById(table.current_session_id);
  if (!existing || existing.session_status === 'closed') return null;

  const hasOrders = await sessionHasOrders(existing);
  const active = hasOrders ? isActiveSession(existing) : isIdleSessionActive(existing);
  if (!active) {
    await closeSession(existing, hasOrders ? 'expired_ordered' : 'idle_no_order');
    await clearCurrentSession(table.table_id, existing.session_id);
    return null;
  }

  const activeOrder = (await listOrdersBySession(existing.session_id)).find((order) => isActiveOrder(order));
  return sessionPublicShape(Object.assign({}, existing, {
    active_order_no: activeOrder ? (activeOrder.order_no || activeOrder.order_id) : '',
  }));
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
async function findMember(mobile, memberId) {
  const cleanMemberId = cleanText(memberId, 120);
  if (cleanMemberId) {
    const memberResult = await db.collection('members')
      .where({ member_id: cleanMemberId, member_status: 'active', is_deleted: _.neq(true) })
      .limit(1)
      .get();
    if (memberResult.data && memberResult.data[0]) return memberResult.data[0];
  }
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
  const member = await findMember(input.mobile || input.customer_mobile, input.member_id);
  if (member) {
    let levelName = '';
    let levelNo = '';
    if (member.level_id) {
      try {
        const levelResult = await db.collection('member_levels')
          .where({ level_id: member.level_id })
          .limit(1)
          .get();
        const level = levelResult.data && levelResult.data[0];
        if (level) {
          levelName = level.level_name || '';
          levelNo = level.level_no || '';
        }
      } catch (e) { console.warn('getMemberLevel failed', e); }
    }
    return {
      customer_type: 'member',
      member_id: member.member_id || '',
      customer_name: member.member_name || '',
      customer_mobile: member.mobile || '',
      member_level: levelName,
      member_level_no: levelNo,
    };
  }
  return {
    customer_type: 'guest',
    member_id: '',
    customer_name: cleanText(input.contact_name || input.customer_name, 80),
    customer_mobile: cleanText(input.mobile || input.customer_mobile, 20),
    member_level: '',
    member_level_no: '',
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
    const regularPrice = toNumber(item.price, 0);
    const memberPriceValue = item.member_price === undefined || item.member_price === null
      ? regularPrice
      : toNumber(item.member_price, regularPrice);
    const quantity = merged[itemId];
    return {
      item_id: itemId,
      category_key: item.category_key || '',
      category_name: item.category_name || '',
      name: item.name || itemId,
      price: regularPrice,
      regular_price: regularPrice,
      member_price: memberPriceValue,
      image: item.image || item.image_url || '',
      quantity,
      amount: regularPrice * quantity,
      regular_amount: regularPrice * quantity,
      member_amount: memberPriceValue * quantity,
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
  return Boolean(order);
}

function isActiveOrder(order) {
  const orderStatus = cleanText(order.order_status, 40);
  if (['completed', 'cancelled', 'canceled', 'closed', 'refunded'].includes(orderStatus)) return false;
  return ACTIVE_ORDER_STATUSES.includes(orderStatus);
}

function batchTitle(batchNo) {
  return batchNo === 1 ? '首单' : `加菜第 ${batchNo - 1} 次`;
}

function activeBatches(batches = []) {
  return batches.filter((batch) => !['cancelled', 'canceled'].includes(cleanText(batch.order_status, 40)));
}

function normalizeBatches(order = {}) {
  const stored = Array.isArray(order.batches) && order.batches.length
    ? order.batches.map((batch, index) => {
      const batchNo = toNumber(batch.batch_no, index + 1) || index + 1;
      const regularAmount = toNumber(batch.regular_amount, toNumber(batch.amount, 0));
      const memberAmount = toNumber(batch.member_amount, regularAmount);
      return Object.assign({}, batch, {
        batch_no: batchNo,
        batch_type: batch.batch_type || (batchNo === 1 ? 'primary' : 'append'),
        batch_title: batch.batch_title || batchTitle(batchNo),
        items: Array.isArray(batch.items) ? batch.items : [],
        amount: regularAmount,
        regular_amount: regularAmount,
        member_amount: memberAmount,
        created_at: normalizeCloudDate(batch.created_at),
      });
    })
    : [];

  return stored
    .sort((left, right) => toNumber(left.batch_no, 0) - toNumber(right.batch_no, 0))
    .map((batch) => Object.assign({}, batch, { batch_title: batch.batch_title || batchTitle(batch.batch_no) }));
}

function aggregateItemsFromBatches(batches = []) {
  const map = {};
  activeBatches(batches).forEach((batch) => {
    (batch.items || []).forEach((item) => {
      const itemId = item.item_id || item.id;
      if (!itemId) return;
      if (!map[itemId]) map[itemId] = Object.assign({}, item, { quantity: 0, amount: 0 });
      const quantity = toNumber(item.quantity, 0);
      map[itemId].quantity += quantity;
      map[itemId].amount += toNumber(item.amount, toNumber(item.price, 0) * quantity);
    });
  });
  return Object.keys(map).map((itemId) => map[itemId]);
}

function totalsFromBatches(batches = []) {
  return activeBatches(batches).reduce((totals, batch) => ({
    regular_total_amount: totals.regular_total_amount + toNumber(batch.regular_amount, toNumber(batch.amount, 0)),
    member_total_amount: totals.member_total_amount + toNumber(batch.member_amount, toNumber(batch.regular_amount, toNumber(batch.amount, 0))),
  }), { regular_total_amount: 0, member_total_amount: 0 });
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

function hydrateMealOrder(order, orders) {
  const batches = normalizeBatches(order);
  const visibleBatches = activeBatches(batches);
  const totals = totalsFromBatches(batches);
  return Object.assign(orderPublicShape(order), {
    batches: visibleBatches,
    all_items: visibleBatches.reduce((items, entry) => items.concat(entry.items || []), []),
    total_amount: totals.regular_total_amount,
    regular_total_amount: totals.regular_total_amount,
    member_total_amount: totals.member_total_amount,
  });
}

async function createMealOrder(input = {}, wxContext = {}) {
  const session = await resolveCurrentSession(input);
  const submittingCustomer = await getCustomer(input);
  const items = await buildOrderItems(input.items || input.cart_items || []);
  const regularAmount = items.reduce((sum, item) => sum + item.regular_amount, 0);
  const memberAmount = items.reduce((sum, item) => sum + item.member_amount, 0);
  const orders = await listOrdersBySession(session.session_id);
  const pendingMemberSettlement = orders.find((order) => (
    isActiveOrder(order) && order.payment_status === 'offline_pending'
  ));
  assert(!pendingMemberSettlement, 'ORDER_CHECKOUT_PENDING', '当前订单正在等待店员线下核销，暂不能继续加菜');
  const primaryOrder = orders.find((order) => (
    isPrimaryOrder(order) && isActiveOrder(order) && order.payment_status === 'unpaid'
  ));
  const orderNo = primaryOrder ? (primaryOrder.order_no || primaryOrder.order_id) : createBusinessId('TYD');
  const currentBatches = primaryOrder ? normalizeBatches(primaryOrder) : [];
  const batchNo = currentBatches.length + 1;
  const quickRemarks = Array.isArray(input.quick_remarks) ? input.quick_remarks.map((item) => cleanText(item, 40)).filter(Boolean) : [];
  const createdAt = now();
  const batch = {
    batch_no: batchNo,
    batch_type: batchNo === 1 ? 'primary' : 'append',
    batch_title: batchTitle(batchNo),
    items,
    amount: regularAmount,
    regular_amount: regularAmount,
    member_amount: memberAmount,
    remark: cleanText(input.remark, 200),
    quick_remarks: quickRemarks,
    print_status: '',
    created_at: createdAt,
    updated_at: createdAt,
  };
  await ensureUser(wxContext, {
    customer_type: submittingCustomer.customer_type,
    member_id: submittingCustomer.member_id,
    mobile: submittingCustomer.customer_mobile,
    customer_name: submittingCustomer.customer_name,
    clear_member: submittingCustomer.customer_type === 'guest',
  });

  let data;
  if (primaryOrder && primaryOrder._id) {
    const batches = currentBatches.concat(batch);
    const totals = totalsFromBatches(batches);
    data = Object.assign({}, primaryOrder, {
      batches,
      total_amount: totals.regular_total_amount,
      regular_total_amount: totals.regular_total_amount,
      member_total_amount: totals.member_total_amount,
      payment_status: 'unpaid',
      order_status: 'preparing',
      updated_at: createdAt,
    });
    await db.collection('meal_orders').doc(primaryOrder._id).update({
      data: {
        batches,
        total_amount: totals.regular_total_amount,
        regular_total_amount: totals.regular_total_amount,
        member_total_amount: totals.member_total_amount,
        payment_status: data.payment_status,
        order_status: data.order_status,
        updated_at: createdAt,
      },
    });
  } else {
    data = {
    order_no: orderNo,
    session_id: session.session_id,
    table_id: session.table_id,
    table_name: session.table_name || session.table_id,
    table_area: session.table_area || '',
    people_count: session.people_count || 1,
    notification_openid: wxContext.OPENID || '',
    customer_type: submittingCustomer.customer_type,
    member_id: submittingCustomer.member_id,
    customer_name: submittingCustomer.customer_name,
    customer_mobile: submittingCustomer.customer_mobile,
    batches: [batch],
    total_amount: regularAmount,
    regular_total_amount: regularAmount,
    member_total_amount: memberAmount,
    order_status: 'preparing',
    payment_status: 'unpaid',
    created_at: createdAt,
    updated_at: createdAt,
    is_deleted: false,
    };
    await db.collection('meal_orders').add({ data });
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
  await safeCallNotification({
    action: 'registerSubscription',
    business_type: 'meal_order',
    business_no: orderNo,
    openid: wxContext.OPENID || '',
    template_keys: ['mealOrderStatus'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/order-detail/order-detail?id=${orderNo}`,
  });
  {
    runBackground(safeCallNotification({
      action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: orderNo,
    title: primaryOrder ? '追加点餐通知' : '新点餐订单',
      // 菜品和备注属于本次点餐批次；合并后企业微信才能展示本次新增内容。
      payload: Object.assign({}, data, batch, { items }),
    }), 'sendStaffNotification');
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'meal_order',
      business_no: orderNo,
      openid: wxContext.OPENID || '',
      status: 'preparing',
      payload: Object.assign({}, data, batch, { items }),
    });
    runBackground(safePrintMealOrder(orderNo, batchNo), 'printMealOrder');
  }
  return Object.assign(orderPublicShape(data), {
    batch_no: batchNo,
    batch_type: batch.batch_type,
    current_batch_amount: regularAmount,
    current_batch_member_amount: memberAmount,
  });
}

async function findOrder(orderNo) {
  const result = await db.collection('meal_orders')
    .where({ order_no: orderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function createUnifiedMealPayment(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order && !order.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '订单已结清');
  assert(order.payment_status === 'unpaid', 'ORDER_NOT_PAYABLE', '订单当前不可结账');

  // Do not use the table opener or prior dish submitter to decide how to settle.
  // A guest checking out a table opened by a member must still be able to pay by WeChat.
  const checkoutCustomer = await getCustomer(input);
  assert(checkoutCustomer.customer_type !== 'member', 'MEMBER_OFFLINE_PAYMENT', '会员结账请线下抵扣');

  const batches = normalizeBatches(order, []);
  assert(activeBatches(batches).length, 'EMPTY_ORDER', '订单没有可结算菜品');
  const checkoutAmount = toNumber(order.regular_total_amount, toNumber(order.total_amount, 0));
  const totalFee = moneyToCents(checkoutAmount);
  assert(totalFee > 0, 'INVALID_PAY_AMOUNT', '支付金额必须大于 0');
  assert(cloud.cloudPay && cloud.cloudPay.unifiedOrder, 'CLOUD_PAY_UNAVAILABLE', '当前云函数环境不支持 cloudPay.unifiedOrder');

  const paymentNo = cleanText(input.payment_no, 120) || `${orderNo}C${randomCode(3)}`;
  const payResult = await cloud.cloudPay.unifiedOrder({
    body: `停云山居扫码点餐-${order.table_name || order.table_id || ''}`.slice(0, 120),
    outTradeNo: paymentNo,
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
      payment_method: 'wechat',
      checkout_customer_type: 'guest',
      checkout_member_id: '',
      checkout_customer_name: checkoutCustomer.customer_name,
      checkout_customer_mobile: checkoutCustomer.customer_mobile,
      checkout_openid: wxContext.OPENID || '',
      payment_trade_no: paymentNo,
      payment_total_fee: totalFee,
      payment_sub_mch_id: getPaySubMchId(),
      checkout_amount: checkoutAmount,
      payment_requested_at: now(),
      updated_at: now(),
    },
  });

  return {
    order_no: orderNo,
    payment_no: paymentNo,
    batch_no: 0,
    total_fee: totalFee,
    payment: payResult.payment || payResult,
    raw_payment: payResult,
  };
}

async function checkoutMealOrder(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order && !order.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '订单已结清');
  assert(order.payment_status === 'unpaid', 'ORDER_NOT_PAYABLE', '订单当前不可结账');

  const customer = await getCustomer(input);
  await ensureUser(wxContext, {
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    mobile: customer.customer_mobile,
    customer_name: customer.customer_name,
    clear_member: customer.customer_type === 'guest',
  });

  if (customer.customer_type !== 'member') {
    return createUnifiedMealPayment(input, wxContext);
  }

  const batches = normalizeBatches(order, []);
  assert(activeBatches(batches).length, 'EMPTY_ORDER', '订单没有可结算菜品');
  assert(input.member_checkout_confirmed === true || input.use_points === true, 'MEMBER_CHECKOUT_CONFIRM_REQUIRED', '请先确认使用会员积分抵扣。');
  const checkoutAt = now();
  const checkoutAmount = toNumber(order.member_total_amount, toNumber(order.regular_total_amount, toNumber(order.total_amount, 0)));
  const pointsDeductAmount = toNumber(input.points_deduct_amount, checkoutAmount);
  const patch = {
    order_status: 'completed',
    payment_status: 'offline_pending',
    payment_method: 'member_points',
    checkout_customer_type: 'member',
    checkout_member_id: customer.member_id,
    checkout_customer_name: customer.customer_name,
    checkout_customer_mobile: customer.customer_mobile,
    checkout_openid: wxContext.OPENID || '',
    checkout_amount: checkoutAmount,
    points_deduct_amount: pointsDeductAmount,
    points_deduct_status: 'pending_verify',
    member_checkout_confirmed: true,
    checkout_requested_at: checkoutAt,
    completed_at: checkoutAt,
    updated_at: checkoutAt,
  };

  await db.collection('meal_orders').doc(order._id).update({ data: patch });
  await closeOrderSession(Object.assign({}, order, patch), 'member_points_pending_verify');
  await safeCallNotification({
    action: 'registerSubscription',
    business_type: 'meal_order',
    business_no: orderNo,
    openid: wxContext.OPENID || '',
    template_keys: ['memberConsumption'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/order-detail/order-detail?id=${orderNo}`,
  });
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: orderNo,
    title: '会员结账待核对',
    title: '会员积分抵扣已结清',
    title: '会员积分抵扣待核销',
    payload: Object.assign({}, order, patch),
  });

  return Object.assign(orderPublicShape(Object.assign({}, order, patch)), {
    checkout_type: 'member',
    requires_payment: false,
    cleared: true,
  });
}

async function cancelMealOrder(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.checkout_openid === wxContext.OPENID, 'FORBIDDEN', '无权取消本次支付');
  assert(order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '订单已支付，不能取消');

  assert(order.payment_status === 'paying', 'ORDER_NOT_CANCELABLE', '当前订单没有进行中的支付');

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      payment_status: 'unpaid',
      payment_method: '',
      checkout_customer_type: '',
      checkout_member_id: '',
      checkout_customer_name: '',
      checkout_customer_mobile: '',
      checkout_openid: '',
      payment_cancelled_at: now(),
      updated_at: now(),
    },
  });
  return { order_no: orderNo, payment_status: 'unpaid' };
}

async function listMealOrders(input = {}, wxContext = {}) {
  const openid = wxContext.OPENID || '';
  if (!openid) {
    const result = await db.collection('meal_orders')
      .where({ is_deleted: _.neq(true) })
      .orderBy('created_at', 'desc')
      .limit(100)
      .get();
    const orders = result.data || [];
    return orders.filter((order) => !order.user_deleted_at).map((order) => hydrateMealOrder(order, orders));
  }

  const [submitterResult, checkoutResult] = await Promise.all([
    db.collection('meal_orders')
      .where({ is_deleted: _.neq(true), notification_openid: openid })
      .orderBy('created_at', 'desc')
      .limit(100)
      .get(),
    db.collection('meal_orders')
      .where({ is_deleted: _.neq(true), checkout_openid: openid })
      .orderBy('created_at', 'desc')
      .limit(100)
      .get(),
  ]);
  const ownOrders = Array.from(new Map(
    (submitterResult.data || []).concat(checkoutResult.data || [])
      .filter((order) => !order.user_deleted_at)
      .map((order) => [order._id || order.order_no, order]),
  ).values());
  const sessionIds = Array.from(new Set(ownOrders.map((order) => order.session_id).filter(Boolean)));
  if (!sessionIds.length) return [];

  const allOrders = [];
  for (let index = 0; index < sessionIds.length; index += 20) {
    const batchIds = sessionIds.slice(index, index + 20);
    const batchResult = await db.collection('meal_orders')
      .where({ is_deleted: _.neq(true), session_id: _.in(batchIds) })
      .orderBy('created_at', 'asc')
      .limit(100)
      .get();
    allOrders.push(...(batchResult.data || []));
  }

  return allOrders
    .filter((order) => !order.user_deleted_at)
    .map((order) => hydrateMealOrder(order, allOrders))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

async function getMealOrderDetail(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findOrder(orderNo);
  assert(found, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const primary = found;
  assert(primary, 'MEAL_ORDER_NOT_FOUND', '未找到点餐主订单');
  const orders = await listOrdersBySession(primary.session_id);
  const openid = wxContext.OPENID || '';
  const inputSessionId = cleanText(input.session_id, 120);
  const canViewBySession = inputSessionId && inputSessionId === primary.session_id && isActiveOrder(primary);
  const canView = !openid
    || canViewBySession
    || orders.some((order) => order.notification_openid === openid || order.checkout_openid === openid);
  assert(canView, 'FORBIDDEN', '无权查看该订单');
  assert(!primary.user_deleted_at || canView, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  return hydrateMealOrder(primary, orders);
}

async function deleteMealOrder(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findOrder(orderNo);
  assert(found, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const primary = found;
  assert(primary, 'MEAL_ORDER_NOT_FOUND', '未找到点餐主订单');
  const openid = wxContext.OPENID || '';
  assert(!openid || primary.notification_openid === openid, 'FORBIDDEN', '无权删除该订单');
  const deletedAt = now();
  const data = {
    user_deleted_at: deletedAt,
    user_deleted_by_openid: openid,
    updated_at: now(),
  };
  await db.collection('meal_orders').doc(primary._id).update({ data });
  return { order_no: primary.order_no, user_deleted_at: deletedAt.toISOString() };
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  const wxContext = cloud.getWXContext();
  try {
    if (action === 'parseTableCode') return ok(parseTableCode(event));
    if (action === 'getCurrentTableSessionByCode') return ok(await getCurrentTableSessionByCode(event));
    if (action === 'startTableSession') return ok(await startTableSession(event, wxContext));
    if (action === 'startTableSessionForTest') return ok(await startTableSessionForTest(event, wxContext));
    if (action === 'createMealOrder') return ok(await createMealOrder(event, wxContext));
    if (action === 'checkoutMealOrder') return ok(await checkoutMealOrder(event, wxContext));
    if (action === 'cancelMealOrder') return ok(await cancelMealOrder(event, wxContext));
    if (action === 'listMealOrders') return ok(await listMealOrders(event, wxContext));
    if (action === 'getMealOrderDetail') return ok(await getMealOrderDetail(event, wxContext));
    if (action === 'deleteMealOrder') return ok(await deleteMealOrder(event, wxContext));
    return fail('不支持的点餐操作', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('mealOrderManage failed', action, error);
    return fail(error.message || '点餐操作失败', error.code || 'SERVER_ERROR');
  }
};
