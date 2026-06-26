const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
let miniProgramAccessTokenCache = null;

const TEMPLATE_IDS = {
  mealOrderStatus: process.env.WX_SUBSCRIBE_MEAL_ORDER_STATUS_TEMPLATE_ID || 'C4zcP7Aa--zKTf_hCrhfdBwtGt7g-NTN2V6yEQ0mJ3Q',
  reservationStatus: process.env.WX_SUBSCRIBE_RESERVATION_STATUS_TEMPLATE_ID || 'pxIcS6FOmd-u0Nw9p6n59FK1bqFBzEkYp39S7LmfRKk',
  memberConsumption: process.env.WX_SUBSCRIBE_MEMBER_CONSUMPTION_TEMPLATE_ID || 't7Ae7NshuMt3CPQkEeati0WHdRG4jNuWc0WTa301rpM',
  activitySignupSuccess: process.env.WX_SUBSCRIBE_ACTIVITY_SIGNUP_SUCCESS_TEMPLATE_ID || 'xZMhkpopzqoggQ-74qPwDsGhxEvInEAmSctDSrtBCJM',
  diningReservationStatus: process.env.WX_SUBSCRIBE_DINING_RESERVATION_STATUS_TEMPLATE_ID || 'qPXI6JBsNa70p6K-mL-8zhe8kW5xFwqJ4zZU5jwBkw4',
};

const TEMPLATE_FIELDS = {
  mealOrderStatus: {
    store: process.env.WX_SUBSCRIBE_MEAL_STORE_FIELD || 'thing7',
    table: process.env.WX_SUBSCRIBE_MEAL_TABLE_FIELD || 'character_string1',
    status: process.env.WX_SUBSCRIBE_MEAL_STATUS_FIELD || 'phrase3',
    time: process.env.WX_SUBSCRIBE_MEAL_TIME_FIELD || 'time5',
    amount: process.env.WX_SUBSCRIBE_MEAL_AMOUNT_FIELD || 'amount2',
  },
  reservationStatus: {
    guest: process.env.WX_SUBSCRIBE_RESERVATION_GUEST_FIELD || 'name6',
    checkIn: process.env.WX_SUBSCRIBE_RESERVATION_CHECKIN_FIELD || 'date1',
    checkOut: process.env.WX_SUBSCRIBE_RESERVATION_CHECKOUT_FIELD || 'date2',
    room: process.env.WX_SUBSCRIBE_RESERVATION_ROOM_FIELD || 'thing8',
    result: process.env.WX_SUBSCRIBE_RESERVATION_RESULT_FIELD || 'thing5',
  },
  memberConsumption: {
    store: process.env.WX_SUBSCRIBE_MEMBER_CONSUMPTION_STORE_FIELD || 'thing1',
    amount: process.env.WX_SUBSCRIBE_MEMBER_CONSUMPTION_AMOUNT_FIELD || 'amount2',
    time: process.env.WX_SUBSCRIBE_MEMBER_CONSUMPTION_TIME_FIELD || 'time7',
  },
  activitySignupSuccess: {
    title: process.env.WX_SUBSCRIBE_ACTIVITY_TITLE_FIELD || 'thing1',
    time: process.env.WX_SUBSCRIBE_ACTIVITY_TIME_FIELD || 'time2',
    location: process.env.WX_SUBSCRIBE_ACTIVITY_LOCATION_FIELD || 'thing3',
    remark: process.env.WX_SUBSCRIBE_ACTIVITY_REMARK_FIELD || 'thing6',
  },
  diningReservationStatus: {
    date: process.env.WX_SUBSCRIBE_DINING_DATE_FIELD || 'date1',
    name: process.env.WX_SUBSCRIBE_DINING_NAME_FIELD || 'name2',
    mealTime: process.env.WX_SUBSCRIBE_DINING_MEAL_TIME_FIELD || 'thing6',
    peopleCount: process.env.WX_SUBSCRIBE_DINING_PEOPLE_COUNT_FIELD || 'number7',
    roomName: process.env.WX_SUBSCRIBE_DINING_ROOM_NAME_FIELD || 'thing12',
  },
};

const STATUS_LABELS = {
  kitchen_notified: '订单已提交',
  preparing: '制作中',
  completed: '已完成',
  settled: '已结算',
  offline_pending: '待会员核销',
  pending_payment: '待支付',
  pending_notice: '订单已提交',
  paid_pending_confirmation: '待确认',
  pending_confirmation: '待确认',
  confirmed: '已确认',
  rejected: '未通过',
  cancelled: '已取消',
  payment_expired: '未完成支付',
  refunding: '退款处理中',
  refunded: '已退款',
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

function cleanCharacterString(value, maxLength = 32) {
  return cleanText(value, maxLength * 2).replace(/[^\w-]/g, '').slice(0, maxLength);
}

function firstText(values, maxLength = 500) {
  for (const value of values) {
    const text = cleanText(value, maxLength);
    if (text) return text;
  }
  return '';
}

function firstCharacterString(values, maxLength = 32) {
  for (const value of values) {
    const text = cleanCharacterString(value, maxLength);
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
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '状态更新';
}

function getTemplateId(key) {
  return TEMPLATE_IDS[key] || '';
}

function shouldFallbackToHttpApi(error) {
  const message = String((error && (error.errMsg || error.message)) || '');
  const code = Number(error && error.errCode);
  return message.includes('INVALID_WX_ACCESS_TOKEN')
    || message.includes('invalid wx openapi access_token')
    || message.includes('function has no permission')
    || code === -604101;
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

function mealStoreName(values = {}) {
  const tableArea = cleanText(values.table_area, 12);
  return tableArea ? `停云山居-${tableArea}` : '停云山居';
}

function mealTemplateData(values = {}) {
  const fields = TEMPLATE_FIELDS.mealOrderStatus;
  const data = {};
  putField(data, fields.store, process.env.STORE_NAME || mealStoreName(values), 20);
  putField(data, fields.table, firstCharacterString([
    values.table_id,
    Array.isArray(values.room_ids) ? values.room_ids.join('-') : '',
    values.room_id,
    values.table_name,
    values.business_no,
  ], 32), 32);
  putField(data, fields.status, values.status_label || statusLabel(values.status || values.order_status || values.reservation_status), 10);
  putField(data, fields.time, values.time || formatTime(values.start_at || values.updated_at || values.created_at), 20);
  putField(data, fields.amount, formatAmount(values.amount || values.total_amount), 10);
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

function memberConsumptionTemplateData(values = {}) {
  const fields = TEMPLATE_FIELDS.memberConsumption;
  const data = {};
  const businessType = cleanText(values.business_type, 80);
  const storeName = businessType === 'meal_order' ? '停云山居-扫码点餐'
    : businessType === 'accommodation_reservation' ? '停云山居-预订住宿'
    : businessType === 'dining_reservation' ? '停云山居-预定用餐'
    : businessType === 'activity_signup' ? '停云山居-活动报名'
    : '停云山居';
  putField(data, fields.store, storeName, 20);
  putField(data, fields.amount, formatAmount(values.amount || values.total_amount), 10);
  putField(data, fields.time, formatTime(values.completed_at || values.settled_at || values.updated_at || values.created_at || now()), 20);
  return data;
}

function extractActivityDateTime(values = {}) {
  const candidates = [
    cleanText(values.activity_time, 30),
    [cleanText(values.date, 20), cleanText(values.time, 20)].filter(Boolean).join(' '),
  ];
  for (const text of candidates) {
    if (!text) continue;
    // 微信 time 类型参数只接受 YYYY-MM-DD HH:mm 格式，不能包含时间范围（如 09:00-11:00）
    // 如果包含 "-" 且前面有时间部分，说明可能是时间范围格式，需要提取起始时间
    const trimmed = text.trim();
    // 尝试匹配标准日期时间格式 YYYY-MM-DD HH:mm 或 YYYY-MM-DD H:mm
    if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
    // 匹配带时间范围的格式：YYYY-MM-dd HH:mm-HH:mm 或 YYYY-MM-dd HH:mm~HH:mm，提取起始部分
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})[~-]/);
    if (match) return match[1];
    // 纯日期格式，补零时零分
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed} 00:00`;
  }
  return '';
}

function activitySignupTemplateData(values = {}) {
  const fields = TEMPLATE_FIELDS.activitySignupSuccess;
  const data = {};
  const activityTime = extractActivityDateTime(values) || formatTime(values.start_at || values.updated_at || values.created_at);
  putField(data, fields.title, firstText([
    values.activity_title,
    values.title,
    values.name,
    '活动',
  ], 20), 20);
  putField(data, fields.time, activityTime || formatTime(values.updated_at || values.created_at), 20);
  putField(data, fields.location, firstText([
    values.location,
    values.activity_location,
    '停云山居',
  ], 20), 20);
  putField(data, fields.remark, firstText([
    values.success_notice_remark,
    values.admin_remark,
    values.remark,
    '报名已确认',
  ], 20), 20);
  return data;
}

function diningReservationTemplateData(values = {}) {
  const fields = TEMPLATE_FIELDS.diningReservationStatus;
  const data = {};
  // date1: 日期 - 微信 date 类型，格式 YYYY-MM-DD
  const dateText = firstText([
    values.date,
    values.reservation_date,
  ], 20);
  if (dateText) {
    // 确保 date 类型格式正确：取 YYYY-MM-DD 部分
    const dateMatch = String(dateText).match(/^(\d{4}-\d{2}-\d{2})/);
    putField(data, fields.date, dateMatch ? dateMatch[1] : dateText, 20);
  }
  // name2: 预订人
  putField(data, fields.name, firstText([
    values.contact_name,
    values.customer_name,
    values.member_name,
    '客人',
  ], 10), 10);
  // thing6: 餐次 - 格式如 "午餐 - 养云套餐"
  const timeSlot = cleanText(values.time_slot || values.reservation_time, 20);
  const slotLabel = timeSlot === 'lunch' ? '午餐' : timeSlot === 'dinner' ? '晚餐' : timeSlot;
  const standardName = cleanText(values.meal_standard_name, 20);
  const mealTimeText = slotLabel && standardName ? `${slotLabel} - ${standardName}` : slotLabel || standardName || '用餐';
  putField(data, fields.mealTime, mealTimeText, 20);
  // number7: 人数
  const peopleCount = Number(values.people_count || values.guest_count || 0);
  if (Number.isFinite(peopleCount) && peopleCount > 0) {
    data[fields.peopleCount] = { value: peopleCount };
  }
  // thing12: 包厢名称
  putField(data, fields.roomName, firstText([
    values.room_name,
    '未指定',
  ], 20), 20);
  return data;
}

function templateData(templateKey, values = {}) {
  if (templateKey === 'reservationStatus') return reservationTemplateData(values);
  if (templateKey === 'memberConsumption') return memberConsumptionTemplateData(values);
  if (templateKey === 'activitySignupSuccess') return activitySignupTemplateData(values);
  if (templateKey === 'diningReservationStatus') return diningReservationTemplateData(values);
  return mealTemplateData(values);
}

function templateKeyForBusiness(type) {
  if (type === 'activity_signup') return 'activitySignupSuccess';
  if (type === 'dining_reservation') return 'diningReservationStatus';
  if (type === 'accommodation_reservation') return 'reservationStatus';
  return 'mealOrderStatus';
}

function defaultTemplateKeysForBusiness(type) {
  return [templateKeyForBusiness(type)];
}

function pageForBusiness(type, businessNo) {
  if (type === 'meal_order') return `pages/order-detail/order-detail?id=${encodeURIComponent(businessNo)}`;
  if (type === 'activity_signup') return 'pages/activity-list/activity-list';
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

async function logSubscribeSkipped(event = {}, templateKey, reason) {
  await logNotification({
    channel: 'wechat_subscribe',
    business_type: cleanText(event.business_type, 80),
    business_no: cleanText(event.business_no || event.order_no || event.order_id, 120),
    openid: cleanText(event.openid || event.touser, 120),
    template_key: cleanText(templateKey, 80),
    status: 'skipped',
    error_message: cleanText(reason, 500),
  });
}

async function sendSubscribeNotification(event = {}) {
  const businessType = cleanText(event.business_type, 80);
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id, 120);
  const templateKey = cleanText(event.template_key, 80) || templateKeyForBusiness(businessType);
  const templateId = getTemplateId(templateKey);
  const openid = cleanText(event.openid || event.touser, 120);

  if (!templateId) {
    await logSubscribeSkipped(event, templateKey, 'template_not_configured');
    return { sent: false, reason: 'template_not_configured' };
  }
  if (!openid || !businessType || !businessNo) {
    await logSubscribeSkipped(event, templateKey, 'missing_target');
    return { sent: false, reason: 'missing_target' };
  }

  const subscription = await findSubscription(event, templateKey);
  if (!subscription) {
    await logSubscribeSkipped(event, templateKey, 'subscription_not_found');
    return { sent: false, reason: 'subscription_not_found' };
  }

  const values = Object.assign({}, event.payload || {}, {
    business_no: businessNo,
    status: event.status,
    status_label: event.status_label,
    admin_remark: event.admin_remark,
    updated_at: event.updated_at || now(),
  });

  try {
    const sendOptions = {
      touser: openid,
      templateId,
      page: miniProgramPage(event.page || subscription.page || pageForBusiness(businessType, businessNo)),
      miniprogramState: process.env.WX_SUBSCRIBE_MINIPROGRAM_STATE || 'formal',
      lang: 'zh_CN',
      data: templateData(templateKey, values),
    };
    const response = await sendSubscribeMessage(sendOptions);
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

async function sendSubscribeMessage(options) {
  try {
    return await cloud.openapi.subscribeMessage.send(options);
  } catch (error) {
    if (!shouldFallbackToHttpApi(error)) throw error;
    console.warn('cloud openapi subscribeMessage failed, fallback to http api', error);
    return sendSubscribeMessageByHttpApi(options);
  }
}

async function getMiniProgramAccessToken() {
  if (miniProgramAccessTokenCache && miniProgramAccessTokenCache.expiresAt > Date.now() + 60000) {
    return miniProgramAccessTokenCache.accessToken;
  }

  const appid = process.env.WX_APPID || process.env.MINIPROGRAM_APPID || 'wxb8d9824edccbdfd1';
  const secret = process.env.WX_APP_SECRET || process.env.WECHAT_APP_SECRET || process.env.MINIPROGRAM_APP_SECRET;
  if (!appid || !secret) {
    throw new Error('cloud.openapi 获取 access_token 失败，请在 notificationManage 环境变量配置 WX_APP_SECRET');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const data = await requestJson('GET', url);
  if (!data.access_token) {
    throw new Error(data.errmsg || `微信 access_token 获取失败：${data.errcode || 'UNKNOWN'}`);
  }
  miniProgramAccessTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 7200) - 300) * 1000,
  };
  return miniProgramAccessTokenCache.accessToken;
}

async function sendSubscribeMessageByHttpApi(options) {
  const accessToken = await getMiniProgramAccessToken();
  const response = await requestJson('POST', `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`, {
    touser: options.touser,
    template_id: options.templateId,
    page: options.page,
    data: options.data,
    miniprogram_state: options.miniprogramState,
    lang: options.lang || 'zh_CN',
  });
  if (response.errcode && response.errcode !== 0) {
    throw new Error(response.errmsg || `订阅消息发送失败：${response.errcode}`);
  }
  return response;
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
      return [name, spec ? `(${spec})` : '', `x ${quantity}`].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join('\n');
}

function staffRemarkText(payload = {}) {
  const quickRemarks = Array.isArray(payload.quick_remarks)
    ? payload.quick_remarks.map((item) => cleanText(item, 40)).filter(Boolean)
    : [];
  const remark = cleanText(payload.remark, 200);
  return quickRemarks.concat(remark ? [remark] : []).join('，');
}

function buildRoomConfirmMessage(payload = {}) {
  const contactName = cleanText(payload.contact_name || payload.customer_name, 40) || '您';
  const roomName = cleanText(payload.room_name, 40);
  const checkInDate = cleanText(payload.check_in_date || payload.date, 20);
  const checkOutDate = cleanText(payload.check_out_date, 20);
  const storeAddress = process.env.STORE_ADDRESS || '';
  const storePhone = process.env.STORE_PHONE || '';

  const msgLines = [
    `【停云山居】`,
    `山里人${contactName}，您好！`,
    roomName ? `已为您预定${roomName} 房间` : '已为您预定房间',
    ' ',
    checkInDate ? `入住：${checkInDate}` : '入住：',
    checkOutDate ? `离店：${checkOutDate}` : '离店：',
    roomName ? `房间：${roomName}` : '房间：',
    storeAddress ? `地址：${storeAddress}` : '地址：',
    storePhone ? `电话：${storePhone}` : '电话：',
    ' ',
    '山居夜宿 枕山而眠',
  ];
  return msgLines.join('\n');
}

function buildDiningConfirmMessage(payload = {}) {
  const contactName = cleanText(payload.contact_name || payload.customer_name, 40) || '您';
  const standardName = cleanText(payload.meal_standard_name, 40);
  const dateText = cleanText(payload.date || payload.reservation_date, 20);
  const timeSlot = cleanText(payload.time_slot || payload.reservation_time, 20);
  const mealLabel = timeSlot === 'lunch' ? '午餐' : timeSlot === 'dinner' ? '晚餐' : timeSlot;
  const roomName = cleanText(payload.room_name, 40);
  const storeAddress = process.env.STORE_ADDRESS || '';
  const storePhone = process.env.STORE_PHONE || '';

  const msgLines = [
    `【停云山居】`,
    `山里人${contactName}，您好！`,
    standardName ? `已为您预定${standardName}套餐` : '已为您预定用餐套餐',
    ' ',
    dateText ? `日期：${dateText}` : '日期：',
    mealLabel ? `餐别：${mealLabel}` : '餐别：午餐/晚餐',
    roomName ? `房间：${roomName}` : '房间：',
    storeAddress ? `地址：${storeAddress}` : '地址：',
    storePhone ? `电话：${storePhone}` : '电话：',
    ' ',
    '时令入味 慢享山中一席',
    '停云山居恭候您的光临！',
  ];
  return msgLines.join('\n');
}

function buildStaffMessage(event = {}) {
  const payload = event.payload || {};
  const businessType = cleanText(event.business_type, 80);
  const title = cleanText(event.title, 80) || '停云山居通知';
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id || payload.order_no, 120);
  const itemsText = mealItemsText(payload.items);
  const remarkText = staffRemarkText(payload);
  const activityTitle = cleanText(payload.activity_title || payload.title, 80);
  const lines = [
    title,
    businessNo ? `单号：${businessNo}` : '',
    activityTitle ? `活动：${activityTitle}` : '',
    payload.contact_name || payload.customer_name ? `联系人：${payload.contact_name || payload.customer_name}` : '',
    payload.mobile || payload.customer_mobile ? `电话：${payload.mobile || payload.customer_mobile}` : '',
  ];
  let customerText = null;
  // 用餐预定专用字段
  if (businessType === 'dining_reservation') {
    const peopleCount = payload.people_count || payload.guest_count;
    if (peopleCount) lines.push(`人数：${peopleCount}`);
    if (payload.room_name) lines.push(`包间：${payload.room_name}`);
    const dateText = payload.date || payload.reservation_date;
    if (dateText) lines.push(`日期：${dateText}`);
    const timeSlot = payload.time_slot || payload.reservation_time;
    if (timeSlot) lines.push(`时段：${timeSlot === 'lunch' ? '午餐' : timeSlot === 'dinner' ? '晚餐' : timeSlot}`);
    if (payload.meal_standard_name) lines.push(`餐标：${payload.meal_standard_name}`);
    if (payload.amount !== undefined) lines.push(`金额：${payload.amount}`);
    if (event.status) lines.push(`状态：${statusLabel(event.status)}`);
    if (remarkText) lines.push(`备注：${remarkText}`);
    if (event.status === 'confirmed') customerText = buildDiningConfirmMessage(payload);
  } else if (businessType === 'accommodation_reservation') {
    // 住宿预定专用字段
    const peopleCount = payload.people_count || payload.guest_count;
    if (peopleCount) lines.push(`人数：${peopleCount}`);
    if (payload.room_name) lines.push(`房间：${payload.room_name}`);
    const checkInDate = payload.check_in_date || payload.date;
    const checkOutDate = payload.check_out_date;
    if (checkInDate) lines.push(`入住日期：${checkInDate}`);
    if (checkOutDate) lines.push(`离店日期：${checkOutDate}`);
    if (payload.amount !== undefined) lines.push(`金额：${payload.amount}`);
    if (event.status) lines.push(`状态：${statusLabel(event.status)}`);
    if (remarkText) lines.push(`备注：${remarkText}`);
    if (event.status === 'confirmed') customerText = buildRoomConfirmMessage(payload);
  } else {
    // 其他业务类型保持原有逻辑
    if (payload.table_name) lines.push(`桌台：${payload.table_name}`);
    if (payload.room_name) lines.push(`房间：${payload.room_name}`);
    if (itemsText) lines.push(`菜品：\n${itemsText}`);
    if (payload.amount !== undefined) lines.push(`金额：${payload.amount}`);
    if (event.status) lines.push(`状态：${statusLabel(event.status)}`);
    if (remarkText) lines.push(`备注：${remarkText}`);
  }
  return { staff: lines.filter(Boolean).join('\n'), customer: customerText };
}

function staffMessage(event = {}) {
  return buildStaffMessage(event).staff;
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
    const businessType = cleanText(event.business_type, 80);
    const businessNo = cleanText(event.business_no || event.order_no || event.order_id, 120);

    const { staff, customer } = buildStaffMessage(event);
    const basePayload = { msgtype: 'text', agentid: agentId, safe: 0 };
    if (touser) basePayload.touser = touser;
    if (toparty) basePayload.toparty = toparty;
    if (totag) basePayload.totag = totag;

    const results = [];
    // 第1条：订单详情（给店员看）
    const r1 = await requestJson('POST', `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`, { ...basePayload, text: { content: staff } });
    await logNotification({ channel: 'wecom', business_type: businessType, business_no: businessNo, status: r1.errcode === 0 ? 'sent' : 'failed', response: r1 });
    results.push(r1);
    // 第2条：客户确认短信（方便店员复制）
    if (customer) {
      const r2 = await requestJson('POST', `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`, { ...basePayload, text: { content: customer } });
      await logNotification({ channel: 'wecom', business_type: businessType, business_no: businessNo, status: r2.errcode === 0 ? 'sent' : 'failed', response: r2 });
      results.push(r2);
    }
    return { sent: results.every((r) => r.errcode === 0), responses: results };
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
  const businessType = cleanText(event.business_type, 80);
  const businessNo = cleanText(event.business_no || event.order_no || event.order_id, 120);
  const { staff, customer } = buildStaffMessage(event);
  try {
    const results = [];
    // 第1条：订单详情（给店员看）
    const r1 = await requestJson('POST', process.env.WECOM_WEBHOOK_URL, { msgtype: 'text', text: { content: staff } });
    await logNotification({ channel: 'wecom_webhook', business_type: businessType, business_no: businessNo, status: r1.errcode === 0 ? 'sent' : 'failed', response: r1 });
    results.push(r1);
    // 第2条：客户确认短信（方便店员复制）
    if (customer) {
      const r2 = await requestJson('POST', process.env.WECOM_WEBHOOK_URL, { msgtype: 'text', text: { content: customer } });
      await logNotification({ channel: 'wecom_webhook', business_type: businessType, business_no: businessNo, status: r2.errcode === 0 ? 'sent' : 'failed', response: r2 });
      results.push(r2);
    }
    return { sent: results.every((r) => r.errcode === 0), responses: results };
  } catch (error) {
    await logNotification({
      channel: 'wecom_webhook',
      business_type: businessType,
      business_no: businessNo,
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
