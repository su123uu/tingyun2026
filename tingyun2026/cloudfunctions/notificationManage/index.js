const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const TEMPLATE_IDS = {
  mealOrderStatus: process.env.WX_SUBSCRIBE_MEAL_ORDER_STATUS_TEMPLATE_ID || 'C4zcP7Aa--zKTf_hCrhfdOlHftnc235j3x83-D4PS88',
  reservationStatus: process.env.WX_SUBSCRIBE_RESERVATION_STATUS_TEMPLATE_ID || 'pxIcS6FOmd-u0Nw9p6n59FK1bqFBzEkYp39S7LmfRKk',
};

const TEMPLATE_FIELDS = {
  mealOrderStatus: {
    store: process.env.WX_SUBSCRIBE_MEAL_STORE_FIELD || 'name4',
    table: process.env.WX_SUBSCRIBE_MEAL_TABLE_FIELD || 'character_string1',
    status: process.env.WX_SUBSCRIBE_MEAL_STATUS_FIELD || 'phrase3',
    time: process.env.WX_SUBSCRIBE_MEAL_TIME_FIELD || 'time5',
    amount: process.env.WX_SUBSCRIBE_MEAL_AMOUNT_FIELD || 'amount8',
  },
  reservationStatus: {
    guest: process.env.WX_SUBSCRIBE_RESERVATION_GUEST_FIELD || 'name6',
    checkIn: process.env.WX_SUBSCRIBE_RESERVATION_CHECKIN_FIELD || 'date1',
    checkOut: process.env.WX_SUBSCRIBE_RESERVATION_CHECKOUT_FIELD || 'date2',
    room: process.env.WX_SUBSCRIBE_RESERVATION_ROOM_FIELD || 'thing8',
    result: process.env.WX_SUBSCRIBE_RESERVATION_RESULT_FIELD || 'thing5',
  },
};

const STATUS_LABELS = {
  kitchen_notified: '已接单',
  preparing: '制作中',
  completed: '已完成',
  settled: '已结算',
  pending_payment: '待支付',
  paid_pending_confirmation: '待确认',
  pending_confirmation: '待确认',
  confirmed: '已确认',
  rejected: '未通过',
  cancelled: '已取消',
  payment_expired: '支付超时',
};

function now() {
  return new Date();
}

function ok(data) {
  return { ok: true, data };
}

function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, code, message };
}

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function firstText(values, maxLength = 500) {
  for (const value of values) {
    const text = cleanText(value, maxLength);
    if (text) return text;
  }
  return '';
}

function normalizeDate(value) {
  if (!value) return now();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? now() : date;
}

function formatTime(value) {
  const date = normalizeDate(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '状态更新';
}

function getTemplateId(key) {
  return TEMPLATE_IDS[key] || '';
}

function putField(data, field, value, maxLength = 20) {
  const text = cleanText(value, maxLength);
  if (field && text) data[field] = { value: text };
}

function formatAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return String(Math.round(number * 100) / 100);
}

function mealTemplateData(values = {}) {
  const fields = TEMPLATE_FIELDS.mealOrderStatus;
  const data = {};
  putField(data, fields.store, process.env.STORE_NAME || '停云山居', 10);
  putField(data, fields.table, firstText([
    values.table_name,
    values.room_name,
    values.room_id,
    values.table_id,
    values.business_no,
  ], 32), 32);
  putField(data, fields.status, values.status_label || statusLabel(values.status || values.order_status || values.reservation_status), 10);
  putField(data, fields.time, values.time || formatTime(values.start_at || values.updated_at || values.created_at), 20);
  putField(data, fields.amount, formatAmount(values.amount || values.total_amount || values.pay_amount), 10);
  return data;
}

function reservationTemplateData(values = {}) {
  const fields = TEMPLATE_FIELDS.reservationStatus;
  const data = {};
  putField(data, fields.guest, firstText([
    values.contact_name,
    values.customer_name,
    values.member_name,
    '客人',
  ], 10), 10);
  putField(data, fields.checkIn, firstText([
    values.check_in_date,
    values.checkin_date,
    values.start_at,
    values.created_at,
  ], 20), 20);
  putField(data, fields.checkOut, firstText([
    values.check_out_date,
    values.checkout_date,
    values.end_at,
    values.check_in_date,
    values.checkin_date,
  ], 20), 20);
  putField(data, fields.room, firstText([
    values.room_name,
    Array.isArray(values.room_ids) ? values.room_ids.join(',') : '',
    '房间',
  ], 20), 20);
  putField(data, fields.result, values.status_label || statusLabel(values.status || values.reservation_status), 20);
  return data;
}

function templateData(templateKey, values = {}) {
  if (templateKey === 'reservationStatus') return reservationTemplateData(values);
  return mealTemplateData(values);
}

function templateKeyForBusiness(type) {
  if (type === 'accommodation_reservation') return 'reservationStatus';
  return 'mealOrderStatus';
}

function defaultTemplateKeysForBusiness(type) {
  return [templateKeyForBusiness(type)];
}

function pageForBusiness(type, businessNo) {
  if (type === 'meal_order') return `pages/order-detail/order-detail?id=${encodeURIComponent(businessNo)}`;
  return `pages/reservation-detail/reservation-detail?id=${encodeURIComponent(businessNo)}`;
}

function miniProgramPage(value) {
  return cleanText(value, 200).replace(/^\/+/, '');
}

async function logNotification(data) {
  try {
    await db.collection('notification_logs').add({
      data: Object.assign({
        created_at: now(),
        is_deleted: false,
      }, data),
    });
  } catch (error) {
    const message = String(error.errMsg || error.message || '');
    if (!message.includes('collection not exists') && !message.includes('Db or Table not exist')) {
      console.warn('notification log skipped', error);
    }
  }
}

async function registerSubscription(event = {}) {
  const openid = cleanText(event.openid || event.touser, 120);
  const businessType = cleanText(event.business_type, 80);
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id, 120);
  const acceptedIds = Array.isArray(event.accepted_template_ids) ? event.accepted_template_ids.map((id) => cleanText(id, 120)).filter(Boolean) : [];
  const templateKeys = Array.isArray(event.template_keys) && event.template_keys.length
    ? event.template_keys
    : defaultTemplateKeysForBusiness(businessType);
  const rows = [];

  if (!openid || !businessType || !businessNo || !acceptedIds.length) {
    return { registered: 0 };
  }

  for (const templateKey of templateKeys) {
    const templateId = getTemplateId(templateKey);
    if (!templateId || !acceptedIds.includes(templateId)) continue;
    const row = {
      openid,
      business_type: businessType,
      business_no: businessNo,
      template_key: templateKey,
      template_id: templateId,
      page: miniProgramPage(event.page) || pageForBusiness(businessType, businessNo),
      status: 'accepted',
      remaining_count: 1,
      created_at: now(),
      updated_at: now(),
      is_deleted: false,
    };
    await db.collection('notification_subscriptions').add({ data: row });
    rows.push(row);
  }

  return { registered: rows.length };
}

async function findSubscription(event, templateKey) {
  const openid = cleanText(event.openid || event.touser, 120);
  const businessType = cleanText(event.business_type, 80);
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id, 120);
  if (!openid || !businessType || !businessNo) return null;

  const result = await db.collection('notification_subscriptions')
    .where({
      openid,
      business_type: businessType,
      business_no: businessNo,
      template_key: templateKey,
      status: _.in(['accepted', 'failed']),
      remaining_count: _.gt(0),
      is_deleted: _.neq(true),
    })
    .orderBy('created_at', 'asc')
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function sendSubscribeNotification(event = {}) {
  const businessType = cleanText(event.business_type, 80);
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id, 120);
  const templateKey = cleanText(event.template_key, 80) || templateKeyForBusiness(businessType);
  const templateId = getTemplateId(templateKey);
  const openid = cleanText(event.openid || event.touser, 120);

  if (!templateId) return { sent: false, reason: 'template_not_configured' };
  if (!openid || !businessType || !businessNo) return { sent: false, reason: 'missing_target' };

  const subscription = await findSubscription(event, templateKey);
  if (!subscription) return { sent: false, reason: 'subscription_not_found' };

  const values = Object.assign({}, event.payload || {}, {
    business_no: businessNo,
    status: event.status,
    status_label: event.status_label,
    admin_remark: event.admin_remark,
    updated_at: event.updated_at || now(),
  });

  try {
    const response = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      page: miniProgramPage(event.page || subscription.page || pageForBusiness(businessType, businessNo)),
      miniprogramState: process.env.WX_SUBSCRIBE_MINIPROGRAM_STATE || 'formal',
      lang: 'zh_CN',
      data: templateData(templateKey, values),
    });
    await db.collection('notification_subscriptions').doc(subscription._id).update({
      data: {
        status: 'used',
        remaining_count: 0,
        sent_at: now(),
        updated_at: now(),
      },
    });
    await logNotification({
      channel: 'wechat_subscribe',
      business_type: businessType,
      business_no: businessNo,
      openid,
      template_key: templateKey,
      template_id: templateId,
      status: 'sent',
      response,
    });
    return { sent: true, response };
  } catch (error) {
    await db.collection('notification_subscriptions').doc(subscription._id).update({
      data: {
        fail_reason: cleanText(error.message, 500),
        last_failed_at: now(),
        updated_at: now(),
      },
    });
    await logNotification({
      channel: 'wechat_subscribe',
      business_type: businessType,
      business_no: businessNo,
      openid,
      template_key: templateKey,
      template_id: templateId,
      status: 'failed',
      error_message: cleanText(error.message, 500),
    });
    return { sent: false, reason: error.message };
  }
}

function requestJson(method, url, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const request = https.request(url, {
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      } : undefined,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function getWeComAccessToken() {
  const corpId = process.env.WECOM_CORP_ID || process.env.WEWORK_CORP_ID;
  const secret = process.env.WECOM_APP_SECRET || process.env.WEWORK_APP_SECRET;
  if (!corpId || !secret) return '';
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`;
  const data = await requestJson('GET', url);
  if (!data.access_token) throw new Error(data.errmsg || '企业微信 access_token 获取失败');
  return data.access_token;
}

function mealItemsText(items = []) {
  if (!Array.isArray(items) || !items.length) return '';
  return items
    .map((item) => {
      const name = cleanText(item.name || item.item_name || item.title || item.item_id, 40);
      const quantity = Number(item.quantity || item.count || 1) || 1;
      const spec = cleanText(item.specification || item.spec || '', 30);
      return [name, spec ? `(${spec})` : '', `x${quantity}`].filter(Boolean).join('');
    })
    .filter(Boolean)
    .join('，');
}

function staffRemarkText(payload = {}) {
  const quickRemarks = Array.isArray(payload.quick_remarks)
    ? payload.quick_remarks.map((item) => cleanText(item, 40)).filter(Boolean)
    : [];
  const remark = cleanText(payload.remark, 200);
  return quickRemarks.concat(remark ? [remark] : []).join('，');
}

function buildStaffMessage(event = {}) {
  const payload = event.payload || {};
  const title = cleanText(event.title, 80) || '停云山居通知';
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id || payload.order_no, 120);
  const itemsText = mealItemsText(payload.items);
  const remarkText = staffRemarkText(payload);
  const lines = [
    title,
    businessNo ? `单号：${businessNo}` : '',
    payload.table_name ? `桌台：${payload.table_name}` : '',
    payload.room_name ? `房间：${payload.room_name}` : '',
    payload.customer_name || payload.contact_name ? `联系人：${payload.customer_name || payload.contact_name}` : '',
    payload.customer_mobile || payload.mobile ? `电话：${payload.customer_mobile || payload.mobile}` : '',
    itemsText ? `菜品：${itemsText}` : '',
    payload.amount !== undefined ? `金额：${payload.amount}` : '',
    event.status ? `状态：${statusLabel(event.status)}` : '',
    remarkText ? `备注：${remarkText}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function staffMessage(event = {}) {
  return buildStaffMessage(event);
  const payload = event.payload || {};
  const title = cleanText(event.title, 80) || '停云山居通知';
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id || payload.order_no, 120);
  const lines = [
    title,
    businessNo ? `单号：${businessNo}` : '',
    payload.table_name ? `桌台：${payload.table_name}` : '',
    payload.room_name ? `房间：${payload.room_name}` : '',
    payload.customer_name || payload.contact_name ? `联系人：${payload.customer_name || payload.contact_name}` : '',
    payload.customer_mobile || payload.mobile ? `电话：${payload.customer_mobile || payload.mobile}` : '',
    payload.amount !== undefined ? `金额：${payload.amount}` : '',
    event.status ? `状态：${statusLabel(event.status)}` : '',
    payload.remark ? `备注：${payload.remark}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

async function sendStaffNotification(event = {}) {
  if (process.env.WECOM_WEBHOOK_URL) {
    return sendWeComWebhookNotification(event);
  }

  const agentId = Number(process.env.WECOM_AGENT_ID || process.env.WEWORK_AGENT_ID || 0);
  const touser = cleanText(event.touser || process.env.WECOM_TO_USER || process.env.WEWORK_TO_USER || '@all', 1000);
  const toparty = cleanText(event.toparty || process.env.WECOM_TO_PARTY || process.env.WEWORK_TO_PARTY || '', 1000);
  const totag = cleanText(event.totag || process.env.WECOM_TO_TAG || process.env.WEWORK_TO_TAG || '', 1000);
  if (!agentId || (!touser && !toparty && !totag)) return { sent: false, reason: 'wecom_not_configured' };

  try {
    const accessToken = await getWeComAccessToken();
    if (!accessToken) return { sent: false, reason: 'wecom_not_configured' };
    const payload = {
      msgtype: 'text',
      agentid: agentId,
      text: { content: staffMessage(event) },
      safe: 0,
    };
    if (touser) payload.touser = touser;
    if (toparty) payload.toparty = toparty;
    if (totag) payload.totag = totag;

    const response = await requestJson('POST', `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`, payload);
    await logNotification({
      channel: 'wecom',
      business_type: cleanText(event.business_type, 80),
      business_no: cleanText(event.business_no || event.order_no || event.order_id, 120),
      status: response.errcode === 0 ? 'sent' : 'failed',
      response,
    });
    return { sent: response.errcode === 0, response };
  } catch (error) {
    await logNotification({
      channel: 'wecom',
      business_type: cleanText(event.business_type, 80),
      business_no: cleanText(event.business_no || event.order_no || event.order_id, 120),
      status: 'failed',
      error_message: cleanText(error.message, 500),
    });
    return { sent: false, reason: error.message };
  }
}

async function sendWeComWebhookNotification(event = {}) {
  try {
    const response = await requestJson('POST', process.env.WECOM_WEBHOOK_URL, {
      msgtype: 'text',
      text: { content: staffMessage(event) },
    });
    await logNotification({
      channel: 'wecom_webhook',
      business_type: cleanText(event.business_type, 80),
      business_no: cleanText(event.business_no || event.order_no || event.order_id, 120),
      status: response.errcode === 0 ? 'sent' : 'failed',
      response,
    });
    return { sent: response.errcode === 0, response };
  } catch (error) {
    await logNotification({
      channel: 'wecom_webhook',
      business_type: cleanText(event.business_type, 80),
      business_no: cleanText(event.business_no || event.order_no || event.order_id, 120),
      status: 'failed',
      error_message: cleanText(error.message, 500),
    });
    return { sent: false, reason: error.message };
  }
}

async function fetchOutboundIp() {
  const providers = [
    'https://api.ipify.org?format=json',
    'https://ifconfig.me/all.json',
    'https://myip.ipip.net',
  ];
  const results = [];
  for (const url of providers) {
    try {
      const data = await requestJson('GET', url);
      results.push({ url, ok: true, data });
    } catch (error) {
      results.push({ url, ok: false, error: cleanText(error.message, 300) });
    }
  }
  return { results };
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'registerSubscription') return ok(await registerSubscription(event));
    if (event.action === 'sendSubscribeNotification') return ok(await sendSubscribeNotification(event));
    if (event.action === 'sendStaffNotification') return ok(await sendStaffNotification(event));
    if (event.action === 'getOutboundIp') return ok(await fetchOutboundIp());
    return fail('不支持的通知操作', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('notificationManage failed', event.action, error);
    return fail(error.message || '通知操作失败', error.code || 'SERVER_ERROR');
  }
};
