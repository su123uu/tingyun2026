const storage = require('../utils/storage');
const createId = require('../utils/id').createId;
const assert = require('../utils/validators').assert;
const auth = require('./auth');

const KEY = 'table_session';
const IDLE_SESSION_MINUTES = 20;

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

function parseTableCode(input) {
  const value = String((input && input.code) || '').trim();
  const params = {};
  if (value.includes('&') || value.includes('=')) {
    value.split('&').forEach((pair) => {
      const parts = pair.split('=');
      if (parts[0]) params[parts[0]] = decodeURIComponent(parts[1] || '');
    });
  } else {
    const match = /^TY_TABLE:([^:]+):([^:]+)$/i.exec(value);
    if (match) {
      params.t = match[1];
      params.k = match[2];
    }
  }
  assert(params.t && params.k, 'INVALID_TABLE_CODE', '桌码无效，请扫描后台生成的桌台二维码');
  return { table_id: params.t, qr_token: params.k };
}

async function localStartTableSession(input, user = {}) {
  const parsed = parseTableCode({ code: input.code });
  const peopleCount = input.people_count;
  assert(Number.isInteger(peopleCount) && peopleCount > 0, 'INVALID_PEOPLE_COUNT', '请输入正确的用餐人数');
  return storage.set(KEY, {
    session_id: createId('TABLE'),
    table_id: parsed.table_id,
    qr_token: parsed.qr_token,
    table_name: parsed.table_id,
    table_area: '',
    people_count: peopleCount,
    customer_type: user.customer_type || 'guest',
    member_id: user.member_id || '',
    member_level: user.member_level || '',
    member_level_no: user.member_level_no || '',
    customer_name: user.nickname || '',
    customer_mobile: user.mobile || '',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + IDLE_SESSION_MINUTES * 60 * 1000).toISOString(),
    has_order: false,
  });
}

async function startTableSession(input) {
  const user = await auth.getCurrentUser();
  try {
    const session = await callMealCloud('startTableSession', Object.assign({}, input, {
      mobile: user.mobile || '',
      customer_name: user.nickname || '',
      customer_type: user.customer_type || 'guest',
      member_id: user.member_id || '',
      member_level: user.member_level || '',
      member_level_no: user.member_level_no || '',
    }));
    return storage.set(KEY, session);
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage startTableSession fallback to local', error);
    return localStartTableSession(input, user);
  }
}

async function startTableSessionForTest(input) {
  const user = await auth.getCurrentUser();
  try {
    const session = await callMealCloud('startTableSessionForTest', Object.assign({}, input, {
      mobile: user.mobile || '',
      customer_name: user.nickname || '',
      customer_type: user.customer_type || 'guest',
      member_id: user.member_id || '',
      member_level: user.member_level || '',
      member_level_no: user.member_level_no || '',
    }));
    return storage.set(KEY, session);
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage startTableSessionForTest fallback to local', error);
    return localStartTableSession({ code: 't=' + (input.table_id || 'A01') + '&k=test', people_count: input.people_count }, user);
  }
}

async function getCurrentTableSessionByCode(input) {
  try {
    const session = await callMealCloud('getCurrentTableSessionByCode', input);
    if (session) return storage.set(KEY, session);
    return null;
  } catch (error) {
    if (error.fromCloudResult) throw error;
    console.warn('mealOrderManage getCurrentTableSessionByCode fallback to local', error);
    return null;
  }
}

async function getCurrentTableSession() {
  return storage.get(KEY, null);
}

async function updateCurrentTableSession(patch = {}) {
  const session = await getCurrentTableSession();
  if (!session) return null;
  return storage.set(KEY, Object.assign({}, session, patch));
}

async function setCurrentTableSession(session = {}) {
  if (!session || !session.session_id) return null;
  return storage.set(KEY, session);
}

async function clearCurrentTableSession() {
  storage.remove(KEY);
  return null;
}

async function markCurrentTableOrdered() {
  return updateCurrentTableSession({ has_order: true });
}

module.exports = {
  parseTableCode,
  startTableSession,
  startTableSessionForTest,
  getCurrentTableSessionByCode,
  getCurrentTableSession,
  updateCurrentTableSession,
  setCurrentTableSession,
  clearCurrentTableSession,
  markCurrentTableOrdered,
};
