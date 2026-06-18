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

async function safePrintMealOrder(orderNo, paymentNo = '') {
  try {
    return await cloud.callFunction({
      name: 'payCallback',
      data: {
        action: 'printMealOrder',
        order_no: orderNo,
        payment_no: paymentNo,
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
    customer_type: session.customer_type || 'guest',
    member_id: session.member_id || '',
    member_level: session.member_level || '',
    member_level_no: session.member_level_no || '',
    customer_name: session.customer_name || '',
    customer_mobile: session.customer_mobile || '',
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
  await clearCurrentSession(session.table_id, session.session_id);
}

async function startTableSession(input = {}, wxContext = {}) {
  const peopleCount = Math.max(1, Math.floor(toNumber(input.people_count, 1)));
  const table = await getTableByCode(input);
  const opener = await getCustomer(input);
  await ensureUser(wxContext, {
    customer_type: opener.customer_type,
    member_id: opener.member_id,
    mobile: opener.customer_mobile,
    customer_name: opener.customer_name,
    clear_member: opener.customer_type === 'guest',
  });
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
    customer_type: opener.customer_type,
    member_id: opener.member_id,
    member_level: opener.member_level || '',
    member_level_no: opener.member_level_no || '',
    customer_name: opener.customer_name,
    customer_mobile: opener.customer_mobile,
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

function sessionCustomer(session = {}) {
  return {
    customer_type: session.customer_type === 'member' ? 'member' : 'guest',
    member_id: session.member_id || '',
    customer_name: session.customer_name || '',
    customer_mobile: session.customer_mobile || '',
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
  return Boolean(order);
}

function isActiveOrder(order) {
  const orderStatus = cleanText(order.order_status, 40);
  if (['completed', 'cancelled', 'canceled', 'closed', 'refunded'].includes(orderStatus)) return false;
  if (['pending_payment', 'pending_wechat_pay', 'paying'].includes(orderStatus)) return false;
  return ACTIVE_ORDER_STATUSES.includes(orderStatus);
}

function appendOrdersFor(order, orders) {
  return [];
}

function batchTitle(batchNo) {
  return batchNo === 1 ? '首单' : `加菜第 ${batchNo - 1} 次`;
}

function activeBatches(batches = []) {
  return batches.filter((batch) => !['cancelled', 'canceled'].includes(cleanText(batch.payment_status || batch.settlement_status, 40)));
}

function paymentNoFor(orderNo, batchNo) {
  return `${orderNo}B${batchNo}`;
}

function batchFromOrder(order = {}, batchNo = 1) {
  const orderNo = order.order_no || order.order_id || '';
  const amount = toNumber(order.amount || order.total_amount || order.pay_amount, 0);
  return {
    batch_no: toNumber(order.batch_no, batchNo) || batchNo,
    batch_type: batchNo === 1 ? 'primary' : 'append',
    batch_title: batchTitle(batchNo),
    order_no: orderNo,
    payment_no: order.payment_no || paymentNoFor(orderNo, batchNo),
    items: Array.isArray(order.items) ? order.items : [],
    amount,
    total_amount: amount,
    pay_amount: amount,
    wechat_pay_amount: toNumber(order.wechat_pay_amount, 0),
    remark: order.remark || '',
    quick_remarks: Array.isArray(order.quick_remarks) ? order.quick_remarks : [],
    settlement_status: order.settlement_status || '',
    payment_status: order.payment_status || '',
    order_status: order.order_status || '',
    created_at: normalizeCloudDate(order.created_at),
    paid_at: normalizeCloudDate(order.paid_at),
    settled_at: normalizeCloudDate(order.settled_at),
    print_status: order.print_status || '',
  };
}

function normalizeBatches(order = {}) {
  const orderNo = order.order_no || order.order_id || '';
  const stored = Array.isArray(order.batches) && order.batches.length
    ? order.batches.map((batch, index) => {
      const batchNo = toNumber(batch.batch_no, index + 1) || index + 1;
      const amount = toNumber(batch.amount || batch.total_amount || batch.pay_amount, 0);
      return Object.assign({}, batch, {
        batch_no: batchNo,
        batch_type: batch.batch_type || (batchNo === 1 ? 'primary' : 'append'),
        batch_title: batch.batch_title || batchTitle(batchNo),
        order_no: orderNo,
        payment_no: batch.payment_no || paymentNoFor(orderNo, batchNo),
        items: Array.isArray(batch.items) ? batch.items : [],
        amount,
        total_amount: amount,
        pay_amount: amount,
        created_at: normalizeCloudDate(batch.created_at),
        paid_at: normalizeCloudDate(batch.paid_at),
        settled_at: normalizeCloudDate(batch.settled_at),
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

function totalAmountFromBatches(batches = []) {
  return activeBatches(batches).reduce((sum, batch) => sum + toNumber(batch.amount || batch.total_amount || batch.pay_amount, 0), 0);
}

function hasPendingWechatBatch(batches = []) {
  return activeBatches(batches).some((batch) => ['pending_wechat_pay', 'paying'].includes(cleanText(batch.payment_status, 40)));
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
    ignored_batches: appendOrders,
    batches,
    all_items: batches.reduce((items, entry) => items.concat(entry.items || []), []),
    total_amount: totalAmount,
    amount: totalAmount,
    pay_amount: totalAmount,
  });
}

function hydrateMealOrder(order, orders) {
  const batches = normalizeBatches(order);
  const visibleBatches = activeBatches(batches);
  const totalAmount = totalAmountFromBatches(batches);
  return Object.assign(orderPublicShape(order), {
    batches: visibleBatches,
    all_items: visibleBatches.reduce((items, entry) => items.concat(entry.items || []), []),
    items: aggregateItemsFromBatches(batches),
    total_amount: totalAmount,
    amount: totalAmount,
    pay_amount: totalAmount,
  });
}

async function createMealOrder(input = {}, wxContext = {}) {
  const session = await resolveCurrentSession(input);
  const currentUserCustomer = await getCustomer(input);
  const customer = sessionCustomer(session) || currentUserCustomer;
  const items = await buildOrderItems(input.items || input.cart_items || []);
  const amount = items.reduce((sum, item) => sum + item.amount, 0);
  const orders = await listOrdersBySession(session.session_id);
  const primaryOrder = orders.find((order) => isPrimaryOrder(order) && isActiveOrder(order));
  const orderNo = primaryOrder ? (primaryOrder.order_no || primaryOrder.order_id) : createBusinessId('TYMEAL');
  const currentBatches = primaryOrder ? normalizeBatches(primaryOrder) : [];
  const batchNo = currentBatches.length + 1;
  const paymentNo = paymentNoFor(orderNo, batchNo);
  const quickRemarks = Array.isArray(input.quick_remarks) ? input.quick_remarks.map((item) => cleanText(item, 40)).filter(Boolean) : [];
  const createdAt = now();
  const batch = {
    batch_no: batchNo,
    batch_type: batchNo === 1 ? 'primary' : 'append',
    batch_title: batchTitle(batchNo),
    order_no: orderNo,
    payment_no: paymentNo,
    items,
    amount,
    total_amount: amount,
    pay_amount: amount,
    points_amount: 0,
    wechat_pay_amount: 0,
    remark: cleanText(input.remark, 200),
    quick_remarks: quickRemarks,
    settlement_status: 'pending_checkout',
    order_status: 'preparing',
    payment_status: 'pending_checkout',
    print_status: '',
    created_at: createdAt,
    updated_at: createdAt,
  };
  await ensureUser(wxContext, {
    customer_type: currentUserCustomer.customer_type,
    member_id: currentUserCustomer.member_id,
    mobile: currentUserCustomer.customer_mobile,
    customer_name: currentUserCustomer.customer_name,
    clear_member: currentUserCustomer.customer_type === 'guest',
  });

  let data;
  if (primaryOrder && primaryOrder._id) {
    const batches = currentBatches.concat(batch);
    const totalAmount = totalAmountFromBatches(batches);
    data = Object.assign({}, primaryOrder, {
      batches,
      items: aggregateItemsFromBatches(batches),
      amount: totalAmount,
      total_amount: totalAmount,
      pay_amount: totalAmount,
      wechat_pay_amount: toNumber(primaryOrder.wechat_pay_amount, 0),
      settlement_status: 'pending_checkout',
      payment_status: 'pending_checkout',
      order_status: 'preparing',
      updated_at: createdAt,
    });
    await db.collection('meal_orders').doc(primaryOrder._id).update({
      data: {
        batches,
        items: data.items,
        amount: totalAmount,
        total_amount: totalAmount,
        pay_amount: totalAmount,
        wechat_pay_amount: data.wechat_pay_amount,
        settlement_status: data.settlement_status,
        payment_status: data.payment_status,
        order_status: data.order_status,
        updated_at: createdAt,
      },
    });
  } else {
    data = {
    order_id: orderNo,
    order_no: orderNo,
    session_id: session.session_id,
    table_id: session.table_id,
    table_name: session.table_name || session.table_id,
    table_area: session.table_area || '',
    people_count: session.people_count || 1,
    user_id: wxContext.OPENID || '',
    created_by_openid: wxContext.OPENID || '',
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    customer_name: customer.customer_name,
    customer_mobile: customer.customer_mobile,
    batches: [batch],
    items,
    amount,
    total_amount: amount,
    pay_amount: amount,
    points_amount: 0,
    wechat_pay_amount: 0,
    remark: cleanText(input.remark, 200),
    quick_remarks: quickRemarks,
    settlement_status: 'pending_checkout',
    order_status: 'preparing',
    payment_status: 'pending_checkout',
    admin_remark: '',
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
    template_keys: customer.customer_type === 'member'
      ? ['mealOrderStatus', 'memberConsumption']
      : ['mealOrderStatus'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/order-detail/order-detail?id=${orderNo}`,
  });
  {
    runBackground(safeCallNotification({
      action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: orderNo,
    title: primaryOrder ? '追加点餐通知' : '新点餐订单',
      payload: data,
    }), 'sendStaffNotification');
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'meal_order',
      business_no: orderNo,
      openid: wxContext.OPENID || '',
      status: 'preparing',
      payload: Object.assign({}, data, batch, { items }),
    });
    runBackground(safePrintMealOrder(orderNo, paymentNo), 'printMealOrder');
  }
  return Object.assign(orderPublicShape(data), {
    batch_no: batchNo,
    batch_type: batch.batch_type,
    payment_no: paymentNo,
    current_batch_amount: amount,
  });
}

async function findOrder(orderNo) {
  const result = await db.collection('meal_orders')
    .where({ order_no: orderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function findBatchForPayment(order = {}, input = {}) {
  const batches = normalizeBatches(order, []);
  const paymentNo = cleanText(input.payment_no || input.out_trade_no || input.outTradeNo, 120);
  const batchNo = Math.floor(toNumber(input.batch_no, 0));
  if (paymentNo) return batches.find((batch) => batch.payment_no === paymentNo);
  if (batchNo > 0) return batches.find((batch) => toNumber(batch.batch_no, 0) === batchNo);
  return batches.find((batch) => ['pending_wechat_pay', 'paying'].includes(cleanText(batch.payment_status, 40))) || batches[0];
}

async function createUnifiedMealPayment(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order && !order.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.customer_type !== 'member', 'MEMBER_OFFLINE_PAYMENT', '会员订单请线下核对会员账户');
  assert(order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '订单已结清');

  const batches = normalizeBatches(order, []);
  assert(activeBatches(batches).length, 'EMPTY_ORDER', '订单没有可结算菜品');
  const totalAmount = totalAmountFromBatches(batches);
  const totalFee = moneyToCents(totalAmount);
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

  const nextBatches = batches.map((entry) => (
    activeBatches([entry]).length
      ? Object.assign({}, entry, {
        settlement_status: 'pending_wechat_pay',
        payment_status: 'paying',
        checkout_payment_no: paymentNo,
        updated_at: now(),
      })
      : entry
  ));

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      batches: nextBatches,
      settlement_status: 'pending_wechat_pay',
      payment_status: 'paying',
      wechat_pay_amount: totalAmount,
      payment_trade_no: paymentNo,
      payment_total_fee: totalFee,
      payment_sub_mch_id: getPaySubMchId(),
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

async function createMealPayment(input = {}, wxContext = {}) {
  return createUnifiedMealPayment(input, wxContext);
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(!order.user_deleted_at, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.created_by_openid === wxContext.OPENID, 'FORBIDDEN', '无权支付该订单');
  assert(order.customer_type !== 'member', 'MEMBER_OFFLINE_PAYMENT', '会员订单请线下核对会员账户');

  const batches = normalizeBatches(order, []);
  const batch = findBatchForPayment(order, input);
  assert(batch, 'MEAL_BATCH_NOT_FOUND', '未找到待支付的点餐批次');
  assert(batch.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '该批次已支付');
  assert(['pending_wechat_pay', 'paying'].includes(cleanText(batch.payment_status, 40)), 'ORDER_NOT_PAYABLE', '该批次当前不可支付');

  const totalFee = moneyToCents(batch.wechat_pay_amount || batch.pay_amount || batch.total_amount || batch.amount);
  assert(totalFee > 0, 'INVALID_PAY_AMOUNT', '支付金额必须大于 0');
  assert(cloud.cloudPay && cloud.cloudPay.unifiedOrder, 'CLOUD_PAY_UNAVAILABLE', '当前云函数环境不支持 cloudPay.unifiedOrder');

  const paymentNo = batch.payment_no || paymentNoFor(orderNo, batch.batch_no);
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

  const nextBatches = batches.map((entry) => (
    entry.payment_no === paymentNo
      ? Object.assign({}, entry, {
        payment_status: 'paying',
        payment_trade_no: paymentNo,
        payment_total_fee: totalFee,
        payment_sub_mch_id: getPaySubMchId(),
        payment_requested_at: now(),
        updated_at: now(),
      })
      : entry
  ));

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      batches: nextBatches,
      payment_status: 'paying',
      payment_trade_no: paymentNo,
      payment_total_fee: totalFee,
      payment_sub_mch_id: getPaySubMchId(),
      payment_requested_at: now(),
      updated_at: now(),
    },
  });

  return {
    order_no: orderNo,
    payment_no: paymentNo,
    batch_no: batch.batch_no,
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
  const settledAt = now();
  const nextBatches = batches.map((batch) => (
    activeBatches([batch]).length
      ? Object.assign({}, batch, {
        settlement_status: 'pending_offline_points',
        payment_status: 'pending_offline',
        settled_at: settledAt,
        updated_at: settledAt,
      })
      : batch
  ));
  const totalAmount = totalAmountFromBatches(nextBatches);
  const patch = {
    customer_type: 'member',
    member_id: customer.member_id,
    customer_name: customer.customer_name,
    customer_mobile: customer.customer_mobile,
    batches: nextBatches,
    items: aggregateItemsFromBatches(nextBatches),
    amount: totalAmount,
    total_amount: totalAmount,
    pay_amount: totalAmount,
    wechat_pay_amount: 0,
    settlement_status: 'pending_offline_points',
    payment_status: 'pending_offline',
    settled_at: settledAt,
    updated_at: settledAt,
  };

  await db.collection('meal_orders').doc(order._id).update({ data: patch });
  await closeOrderSession(Object.assign({}, order, patch), 'member_checkout');
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: orderNo,
    title: '会员结账待核对',
    payload: Object.assign({}, order, patch),
  });

  return Object.assign(orderPublicShape(Object.assign({}, order, patch)), {
    checkout_type: 'member',
    requires_payment: false,
  });
}

async function createMealOrderAndPayment(input = {}, wxContext = {}) {
  const order = await createMealOrder(input, wxContext);
  const orderNo = order.order_no || order.order_id;
  const paymentNo = order.payment_no || '';
  const batchNo = order.batch_no || 0;
  const response = {
    order,
    order_no: orderNo,
    payment_no: paymentNo,
    batch_no: batchNo,
  };

  const needsWechatPay = order.customer_type !== 'member'
    && ['pending_wechat_pay', 'paying'].includes(cleanText(order.payment_status, 40));
  if (!needsWechatPay) return response;

  const paymentResult = await createMealPayment({
    order_no: orderNo,
    payment_no: paymentNo,
    batch_no: batchNo,
    spbill_create_ip: input.spbill_create_ip,
  }, wxContext);

  return Object.assign({}, response, paymentResult, { order });
}

async function cancelMealOrder(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.created_by_openid === wxContext.OPENID, 'FORBIDDEN', '无权取消该订单');
  assert(order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '订单已支付，不能取消');

  const canCancel = ['pending_payment', 'pending_wechat_pay', 'paying'].includes(cleanText(order.order_status, 40))
    || ['pending_payment', 'pending_wechat_pay', 'paying'].includes(cleanText(order.payment_status, 40));
  assert(canCancel, 'ORDER_NOT_CANCELABLE', '当前订单不能取消');

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      order_status: 'cancelled',
      payment_status: 'cancelled',
      settlement_status: 'cancelled',
      cancelled_reason: cleanText(input.reason, 120) || 'payment_cancelled',
      cancelled_at: now(),
      updated_at: now(),
    },
  });

  const session = await getSessionById(order.session_id);
  if (session && session._id) {
    const sessionOrders = await listOrdersBySession(order.session_id);
    const hasActive = sessionOrders.some((entry) => (entry.order_no || entry.order_id) !== orderNo && isActiveOrder(entry));
    await db.collection('meal_table_sessions').doc(session._id).update({
      data: {
        has_order: hasActive,
        updated_at: now(),
      },
    });
  }

  return { order_no: orderNo, order_status: 'cancelled' };
}

async function cancelMealOrderV2(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  assert(order.created_by_openid === wxContext.OPENID, 'FORBIDDEN', '无权取消该订单');

  const batches = normalizeBatches(order, []);
  const batch = findBatchForPayment(order, input);
  assert(batch, 'MEAL_BATCH_NOT_FOUND', '未找到待取消的点餐批次');
  assert(['pending_payment', 'pending_wechat_pay', 'paying'].includes(cleanText(batch.order_status, 40))
    || ['pending_payment', 'pending_wechat_pay', 'paying'].includes(cleanText(batch.payment_status, 40)), 'ORDER_NOT_CANCELABLE', '当前批次不能取消');

  const cancelledAt = now();
  const nextBatches = batches.map((entry) => (
    entry.payment_no === batch.payment_no
      ? Object.assign({}, entry, {
        order_status: 'cancelled',
        payment_status: 'cancelled',
        settlement_status: 'cancelled',
        cancelled_reason: cleanText(input.reason, 120) || 'payment_cancelled',
        cancelled_at: cancelledAt,
        updated_at: cancelledAt,
      })
      : entry
  ));
  const totalAmount = totalAmountFromBatches(nextBatches);
  const active = activeBatches(nextBatches);
  const pendingWechat = hasPendingWechatBatch(nextBatches);
  const data = {
    batches: nextBatches,
    items: aggregateItemsFromBatches(nextBatches),
    amount: totalAmount,
    total_amount: totalAmount,
    pay_amount: totalAmount,
    payment_status: pendingWechat ? 'pending_wechat_pay' : (active.length ? 'settled' : 'cancelled'),
    settlement_status: pendingWechat ? 'pending_wechat_pay' : (active.length ? 'settled' : 'cancelled'),
    order_status: active.length ? 'preparing' : 'cancelled',
    updated_at: cancelledAt,
  };

  await db.collection('meal_orders').doc(order._id).update({ data });

  const session = await getSessionById(order.session_id);
  if (session && session._id) {
    const sessionOrders = await listOrdersBySession(order.session_id);
    const hasActive = sessionOrders.some((entry) => (entry.order_no || entry.order_id) !== orderNo && isActiveOrder(entry))
      || active.length > 0;
    await db.collection('meal_table_sessions').doc(session._id).update({
      data: {
        has_order: hasActive,
        updated_at: now(),
      },
    });
  }

  return { order_no: orderNo, payment_no: batch.payment_no, batch_no: batch.batch_no, order_status: data.order_status };
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

  const ownResult = await db.collection('meal_orders')
    .where({ is_deleted: _.neq(true), created_by_openid: openid })
    .orderBy('created_at', 'desc')
    .limit(100)
    .get();
  const ownOrders = (ownResult.data || []).filter((order) => !order.user_deleted_at);
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
  const canView = !openid || canViewBySession || orders.some((order) => order.created_by_openid === openid);
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
  assert(!openid || primary.created_by_openid === openid, 'FORBIDDEN', '无权删除该订单');
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
    if (action === 'createMealOrderAndPayment') return ok(await createMealOrderAndPayment(event, wxContext));
    if (action === 'createMealPayment') return ok(await createMealPayment(event, wxContext));
    if (action === 'checkoutMealOrder') return ok(await checkoutMealOrder(event, wxContext));
    if (action === 'cancelMealOrder') return ok(await cancelMealOrderV2(event, wxContext));
    if (action === 'listMealOrders') return ok(await listMealOrders(event, wxContext));
    if (action === 'getMealOrderDetail') return ok(await getMealOrderDetail(event, wxContext));
    if (action === 'deleteMealOrder') return ok(await deleteMealOrder(event, wxContext));
    return fail('不支持的点餐操作', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('mealOrderManage failed', action, error);
    return fail(error.message || '点餐操作失败', error.code || 'SERVER_ERROR');
  }
};
