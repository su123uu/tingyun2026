const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const DEFAULT_ENV_ID = 'cloud1-d6gzs6wuu4b4e902e';
const DEFAULT_STORAGE_BUCKET = '636c-cloud1-d6gzs6wuu4b4e902e-1437151055';
const DEFAULT_WX_APPID = 'wxb8d9824edccbdfd1';
const RESERVATION_COLLECTIONS = ['dining_reservations', 'accommodation_reservations'];
const ADMIN_RESERVATION_STATUSES = ['confirmed', 'rejected', 'cancelled'];
const ADMIN_ACTIVITY_SIGNUP_STATUSES = ['confirmed', 'cancelled', 'completed'];
const ADMIN_MEAL_ORDER_STATUSES = ['preparing', 'completed'];
const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const VIDEO_TYPES = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const MODULES = {
  home_banners: {
    key: 'banner_id',
    sort: 'sort_order',
    imageFields: { image_url: 'home/banners' },
    fields: ['banner_id', 'image_url', 'kicker', 'title', 'description', 'link_type', 'link_target', 'sort_order', 'is_enabled', 'start_at', 'end_at'],
  },
  home_quick_entries: {
    key: 'entry_id',
    sort: 'sort_order',
    fields: ['entry_id', 'icon', 'title', 'description', 'action', 'link_target', 'tone', 'sort_order', 'is_enabled'],
  },
  home_feature_cards: {
    key: 'card_id',
    sort: 'sort_order',
    imageFields: { image_url: 'home/cards' },
    fields: ['card_id', 'card_type', 'image_url', 'title', 'subtitle', 'action', 'link_target', 'sort_order', 'is_enabled'],
  },
  content_pages: {
    key: 'page_id',
    sort: 'updated_at',
    imageFields: { cover_image_url: 'intro', content_image_url: 'intro' },
    fields: ['page_id', 'page_type', 'title', 'summary', 'cover_image_url', 'content_blocks', 'page_status', 'published_at', 'is_active', 'activated_at', 'activated_by'],
  },
  meal_items: {
    key: 'item_id',
    sort: 'sort_order',
    imageFields: { image_url: 'meal-items' },
    fields: ['item_id', 'category_key', 'category_name', 'category_sort_order', 'item_type', 'name', 'description', 'specification', 'details', 'price', 'member_price', 'is_available', 'image_url', 'sort_order'],
  },
  meal_tables: {
    key: 'table_id',
    sort: 'sort_order',
    imageFields: { qr_image_file_id: 'meal-tables' },
    fields: ['table_id', 'table_name', 'table_area', 'capacity', 'sort_order', 'table_status', 'qr_token', 'qr_version', 'qr_scene', 'qr_image_file_id', 'current_session_id'],
  },
  meal_table_sessions: {
    key: 'session_id',
    sort: 'created_at',
    fields: ['session_id', 'table_id', 'table_name', 'table_area', 'people_count', 'customer_type', 'customer_name', 'member_id', 'session_status', 'has_order', 'expires_at', 'ordered_at', 'closed_at', 'closed_reason'],
  },
  dining_rooms: {
    key: 'room_id',
    sort: 'sort_order',
    imageFields: { image_url: 'rooms' },
    fields: ['room_id', 'name', 'category', 'min_capacity', 'max_capacity', 'image_url', 'is_available', 'sort_order'],
  },
  dining_standards: {
    key: 'meal_standard_id',
    sort: 'sort_order',
    imageFields: { image_url: 'dining-standards' },
    fields: ['meal_standard_id', 'name', 'price_per_person', 'summary', 'dishes', 'image_url', 'is_enabled', 'sort_order'],
  },
  accommodation_rooms: {
    key: 'room_id',
    sort: 'sort_order',
    imageFields: { image_url: 'rooms', image_urls: 'rooms' },
    fields: ['room_id', 'name', 'category', 'bed_type', 'min_capacity', 'max_capacity', 'regular_price', 'member_price', 'image_url', 'image_urls', 'is_available', 'sort_order'],
  },
  activity_banners: {
    key: 'banner_id',
    sort: 'sort_order',
    imageFields: { image_url: 'activities/banners' },
    fields: ['banner_id', 'image_url', 'kicker', 'title', 'sort_order', 'is_enabled'],
  },
  activity_items: {
    key: 'activity_id',
    sort: 'start_at',
    imageFields: { image_url: 'activities', intro_images: 'activities', highlight_images: 'activities', qr_image_file_id: 'activities/qrcodes' },
    videoFields: { video_url: 'activities' },
      fields: ['activity_id', 'title', 'subtitle', 'intro_text', 'notice', 'image_url', 'video_url', 'intro_images', 'highlight_images', 'location', 'start_at', 'end_at', 'signup_deadline', 'signup_scope', 'is_pinned', 'guest_price', 'member_price', 'capacity', 'reserved_count', 'status', 'success_notice_remark', 'qr_scene', 'qr_version', 'qr_image_file_id'],
  },
  users: {
    key: 'user_id',
    sort: 'last_login_at',
    fields: ['user_id', 'openid', 'mobile', 'nickname', 'avatar_url', 'member_id', 'customer_type', 'last_contact_name', 'last_contact_mobile', 'last_login_at', 'created_at', 'updated_at', 'is_deleted'],
  },
  members: {
    key: 'member_id',
    sort: 'updated_at',
    fields: ['member_id', 'mobile', 'member_name', 'level_id', 'member_level', 'member_status', 'benefit_start_at', 'benefit_end_at', 'points_balance'],
  },
  member_levels: {
    key: 'level_id',
    sort: 'sort_order',
    fields: ['level_id', 'level_no', 'level_name', 'stored_amount', 'points_granted', 'valid_months', 'description', 'is_enabled', 'sort_order'],
  },
  member_level_benefits: {
    key: 'level_benefit_id',
    sort: 'sort_order',
    fields: ['level_benefit_id', 'level_id', 'benefit_key', 'benefit_name', 'benefit_type', 'total_quota', 'quota_unit', 'description', 'show_on_card', 'applies_to', 'rule', 'is_enabled', 'sort_order'],
  },
  member_benefit_accounts: {
    key: 'benefit_account_id',
    sort: 'updated_at',
    fields: ['benefit_account_id', 'member_id', 'level_id', 'benefit_key', 'benefit_name', 'benefit_type', 'total_quota', 'used_quota', 'locked_quota', 'remaining_quota', 'quota_unit', 'valid_start_at', 'valid_end_at', 'account_status'],
  },
  dining_reservations: {
    key: 'order_no',
    sort: 'created_at',
    fields: ['order_no', 'customer_type', 'member_id', 'contact_name', 'mobile', 'date', 'time_slot', 'people_count', 'room_ids', 'room_name', 'meal_standard_id', 'meal_standard_name', 'reservation_status', 'payment_status', 'created_by_openid', 'remark', 'admin_remark'],
  },
  accommodation_reservations: {
    key: 'order_no',
    sort: 'created_at',
    fields: ['order_no', 'customer_type', 'member_id', 'contact_name', 'mobile', 'check_in_date', 'check_out_date', 'people_count', 'room_ids', 'room_name', 'reservation_status', 'payment_status', 'created_by_openid', 'remark', 'admin_remark'],
  },
  activity_signups: {
    key: 'signup_id',
    sort: 'created_at',
    fields: ['signup_id', 'order_no', 'activity_id', 'activity_title', 'date', 'time', 'location', 'contact_name', 'contact_mobile', 'participant_count', 'customer_type', 'member_id', 'amount', 'signup_status', 'payment_status', 'success_notice_remark', 'created_by_openid', 'remark', 'admin_remark'],
  },
  meal_orders: {
    key: 'order_id',
    sort: 'created_at',
    fields: ['order_id', 'order_no', 'table_id', 'table_name', 'customer_type', 'customer_name', 'customer_mobile', 'checkout_customer_type', 'checkout_customer_name', 'checkout_customer_mobile', 'items', 'batches', 'total_amount', 'regular_total_amount', 'member_total_amount', 'checkout_amount', 'order_status', 'payment_status', 'created_by_openid', 'notification_openid', 'checkout_openid', 'admin_remark'],
  },
  system_settings: {
    key: 'setting_key',
    sort: 'sort_order',
    fields: ['setting_key', 'setting_name', 'setting_type', 'value', 'description', 'is_enabled', 'sort_order'],
  },
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

function requireAdmin(event) {
  const expected = process.env.ADMIN_API_TOKEN || process.env.bannerAdmin;
  if (!expected) return fail('请先配置后台口令环境变量 ADMIN_API_TOKEN。', 'ADMIN_TOKEN_NOT_CONFIGURED');
  if (!event || event.admin_token !== expected) return fail('后台口令不正确或已失效。', 'UNAUTHORIZED');
  return null;
}

function login(event) {
  const expectedPassword = process.env.ADMIN_API_TOKEN || process.env.bannerAdmin;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const username = cleanText(event.username, 80);
  const password = String(event.password || '');
  if (!expectedPassword) return fail('请先配置后台口令环境变量 ADMIN_API_TOKEN。', 'ADMIN_TOKEN_NOT_CONFIGURED');
  if (username !== expectedUser || password !== expectedPassword) {
    return fail('账号或密码不正确。', 'UNAUTHORIZED');
  }
  return ok({ username: expectedUser, token: expectedPassword });
}

function getModule(collectionName) {
  return MODULES[collectionName];
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    const message = String(error.errMsg || error.message || '');
    if (!message.includes('exist')) throw error;
  }
}

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
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

function reservationBusinessType(collectionName) {
  if (collectionName === 'dining_reservations') return 'dining_reservation';
  if (collectionName === 'accommodation_reservations') return 'accommodation_reservation';
  return '';
}

async function notifyReservationStatus(collectionName, row, status, adminRemark) {
  const businessType = reservationBusinessType(collectionName);
  const businessNo = cleanText(row.order_no || row.reservation_id, 120);
  const openid = cleanText(row.checkout_openid || row.notification_openid || row.created_by_openid, 120);
  const payload = Object.assign({}, row, {
    reservation_status: status,
    status,
    admin_remark: adminRemark,
  });
  if (businessType && businessNo && openid && status === 'confirmed') {
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: businessType,
      business_no: businessNo,
      openid,
      status,
      admin_remark: adminRemark,
      payload,
    });
  }
  if (businessType && businessNo && openid && status === 'settled' && row.customer_type === 'member') {
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: businessType,
      business_no: businessNo,
      openid,
      template_key: 'memberConsumption',
      payload,
    });
  }
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: businessType,
    business_no: businessNo,
    title: '预订状态更新',
    status,
    payload,
  });
}

async function notifyMealOrderStatus(row, status, adminRemark) {
  const businessNo = cleanText(row.order_no || row.order_id, 120);
  const openid = cleanText(row.checkout_openid || row.notification_openid || row.created_by_openid, 120);
  const payload = Object.assign({}, row, {
    order_status: status,
    status,
    admin_remark: adminRemark,
  });
  const isMemberCheckout = row.checkout_customer_type === 'member';
  // 点餐状态模板在顾客提交首单/加菜时发送“制作中”并消耗一次授权。
  // 后台改为 preparing、completed 不再向顾客重复发送，避免把唯一订阅次数留给后续状态。
  if (businessNo && openid && status === 'settled' && isMemberCheckout) {
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'meal_order',
      business_no: businessNo,
      openid,
      template_key: 'memberConsumption',
      payload,
    });
  }
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: businessNo,
    title: '点餐状态更新',
    status,
    payload,
  });
}

async function notifyActivitySignupStatus(row, status, adminRemark) {
  const businessNo = cleanText(row.order_no || row.signup_id, 120);
  const openid = cleanText(row.created_by_openid, 120);
  const payload = Object.assign({}, row, {
    signup_status: status,
    status,
    admin_remark: adminRemark,
    success_notice_remark: row.success_notice_remark || adminRemark || '报名已确认',
  });
  if (businessNo && openid && status === 'confirmed') {
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'activity_signup',
      business_no: businessNo,
      openid,
      template_key: 'activitySignupSuccess',
      status,
      admin_remark: adminRemark,
      payload,
    });
  }
  if (businessNo && openid && status === 'completed' && row.customer_type === 'member') {
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'activity_signup',
      business_no: businessNo,
      openid,
      template_key: 'memberConsumption',
      payload: Object.assign({}, payload, { business_type: 'activity_signup' }),
    });
  }
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'activity_signup',
    business_no: businessNo,
    title: '活动报名状态更新',
    status,
    payload,
  });
}

function cleanValue(value) {
  if (value === undefined) return undefined;
  if (value === '') return '';
  if (typeof value === 'string') return cleanText(value, 5000);
  return value;
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatActivityDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatActivityClock(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function syncActivityDisplayTime(data, input = {}, existing = {}) {
  const startAt = Object.prototype.hasOwnProperty.call(input, 'start_at') ? data.start_at : existing.start_at;
  const endAt = Object.prototype.hasOwnProperty.call(input, 'end_at') ? data.end_at : existing.end_at;
  const dateText = formatActivityDate(startAt);
  const startText = formatActivityClock(startAt);
  const endText = formatActivityClock(endAt);
  data.date = dateText;
  data.time = startText && endText ? `${startText}-${endText}` : startText || endText || '';
}

function normalizePageId(value, fallbackPrefix = 'intro') {
  const cleaned = cleanText(value, 80)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

function buildData(moduleConfig, input, existing = {}) {
  const data = {};
  moduleConfig.fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      const value = cleanValue(input[field]);
      if (value !== undefined) data[field] = value;
    }
  });

  const key = moduleConfig.key;
    if (key && !data[key] && !existing[key]) {
      data[key] = `${key.replace(/_id$/, '')}_${Date.now()}`;
    }
    if (moduleConfig.key === 'activity_id') syncActivityDisplayTime(data, input, existing);
    data.updated_at = now();
  data.is_deleted = false;
  return data;
}

async function validateMemberMobileUnique(data, current = {}) {
  const mobile = cleanText(data.mobile || current.mobile, 20);
  if (!mobile) return null;
  const result = await db.collection('members')
    .where({ mobile, is_deleted: _.neq(true) })
    .limit(20)
    .get();
  const conflict = (result.data || []).find((row) => (
    row._id !== current._id
    && row.member_id !== current.member_id
  ));
  if (!conflict) return null;
  return fail('该手机号已登记为其他会员，请先修改或合并原会员档案。', 'MEMBER_MOBILE_CONFLICT');
}

async function syncUsersForMember(member = {}) {
  const mobile = cleanText(member.mobile, 20);
  const memberId = cleanText(member.member_id, 120);
  if (!mobile || !memberId || member.member_status !== 'active') return;
  await db.collection('users')
    .where({ mobile, is_deleted: _.neq(true) })
    .update({
      data: {
        member_id: memberId,
        customer_type: 'member',
        nickname: cleanText(member.member_name, 80),
        updated_at: now(),
      },
    });
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toSortTime(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sortActivityRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const leftPinned = left.is_pinned === true ? 1 : 0;
    const rightPinned = right.is_pinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    const startDiff = toSortTime(left.start_at) - toSortTime(right.start_at);
    if (startDiff !== 0) return startDiff;
    return String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hans-CN');
  });
}

function sortAdminRows(rows, moduleConfig) {
  if (moduleConfig && moduleConfig.key === 'activity_id') return sortActivityRows(rows);
  return rows;
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function isBrowserImageUrl(value) {
  return /^(https?:\/\/|data:image\/|blob:)/i.test(String(value || '').trim());
}

function getEnvId() {
  return [process.env.TCB_ENV, process.env.SCF_NAMESPACE].find((value) => /^cloud/i.test(String(value || ''))) || DEFAULT_ENV_ID;
}

function getStorageBucket() {
  return process.env.CLOUD_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET;
}

function buildCloudFileID(cloudPath) {
  const envId = getEnvId();
  const bucket = getStorageBucket();
  if (!envId || !bucket || !cloudPath) return '';
  return `cloud://${envId}.${bucket}/${cloudPath.replace(/^\/+/, '')}`;
}

function getFileName(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const fileName = trimmed.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || '';
  try {
    return decodeURIComponent(fileName);
  } catch (error) {
    return fileName;
  }
}

function safeCloudFileName(value, fallback = 'file') {
  return cleanText(value, 80)
    .replace(/[\\/:*?"<>|#%&{}$!@+=`]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function randomToken(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function postJsonBuffer(url, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = String(response.headers['content-type'] || '');
        if (contentType.includes('application/json')) {
          try {
            const data = JSON.parse(buffer.toString('utf8'));
            reject(new Error(data.errmsg || `微信接口调用失败：${data.errcode || response.statusCode}`));
          } catch (error) {
            reject(error);
          }
          return;
        }
        resolve(buffer);
      });
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function getWxAccessToken() {
  const appid = process.env.WX_APPID || DEFAULT_WX_APPID;
  const secret = process.env.WX_APP_SECRET || process.env.WECHAT_APP_SECRET || process.env.MINIPROGRAM_APP_SECRET;
  if (!appid || !secret) {
    throw new Error('请先在 adminManage 云函数环境变量中配置 WX_APP_SECRET。');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const data = await requestJson(url);
  if (!data.access_token) {
    if (data.errcode === 40001 || /appsecret|credential/i.test(String(data.errmsg || ''))) {
      throw new Error('微信 AppSecret 无效，或与 WX_APPID 不匹配。请在 adminManage 环境变量中配置当前小程序的 WX_APP_SECRET。');
    }
    throw new Error(data.errmsg || `微信 access_token 获取失败：${data.errcode || 'UNKNOWN'}`);
  }
  return data.access_token;
}

async function getTableWxacodeBuffer(scene, page) {
  try {
    const codeResult = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page,
      checkPath: false,
      envVersion: 'release',
    });
    const buffer = codeResult.buffer || Buffer.from(codeResult.content || '', 'base64');
    if (buffer && buffer.length) return buffer;
  } catch (error) {
    console.warn('cloud openapi wxacode failed, fallback to access_token api', error);
  }

  const accessToken = await getWxAccessToken();
  return postJsonBuffer(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`, {
    scene,
    page,
    check_path: false,
    env_version: 'release',
  });
}

function getPreviewFileID(value, folder) {
  if (isCloudFile(value)) return value;
  if (isBrowserImageUrl(value)) return '';

  const fileName = getFileName(value);
  if (!/\.(jpe?g|png|webp|gif)$/i.test(fileName)) return '';
  return buildCloudFileID(`${folder}/${fileName}`);
}

function safeActivityFolderName(value, fallback = 'activity') {
  return cleanText(value, 100)
    .replace(/[\\/:*?"<>|#%&{}$!@+=`]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function uploadFolder(moduleConfig, event, field) {
  const baseFolder = (moduleConfig.imageFields && moduleConfig.imageFields[field])
    || (moduleConfig.videoFields && moduleConfig.videoFields[field])
    || '';
  if (moduleConfig.key !== 'activity_id' || baseFolder !== 'activities') return baseFolder;
  const title = safeActivityFolderName(event.record_title || event.activity_title || event.title || event.activity_id, cleanText(event.activity_id, 80) || 'activity');
  return `${baseFolder}/${title}`;
}

function collectContentImageFileIDs(value, fileIDs = []) {
  if (!value || typeof value !== 'object') return fileIDs;
  if (Array.isArray(value)) {
    value.forEach((item) => collectContentImageFileIDs(item, fileIDs));
    return fileIDs;
  }
  if (isCloudFile(value.image_url)) fileIDs.push(value.image_url);
  Object.keys(value).forEach((key) => {
    if (key !== 'image_url') collectContentImageFileIDs(value[key], fileIDs);
  });
  return fileIDs;
}

async function attachPreviewUrls(items, moduleConfig) {
  const imageFields = Object.keys(moduleConfig.imageFields || {});
  const fileIDs = [];
  items.forEach((item) => {
    imageFields.forEach((field) => {
      const values = Array.isArray(item[field]) ? item[field] : [item[field]];
      values.forEach((value) => {
        const fileID = getPreviewFileID(value, moduleConfig.imageFields[field]);
        if (fileID) fileIDs.push(fileID);
      });
    });
    if (moduleConfig.key === 'page_id') {
      collectContentImageFileIDs(item.content_blocks || [], fileIDs);
    }
  });
  if (!fileIDs.length) return items;

  let tempResult;
  try {
    tempResult = await cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  } catch (error) {
    console.warn('resolve preview urls failed', error);
    return items.map((item) => Object.assign({}, item, { _preview_urls: {} }));
  }
  const urlMap = {};
  tempResult.fileList.forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  return items.map((item) => {
    const next = Object.assign({}, item, { _preview_urls: {} });
    imageFields.forEach((field) => {
      if (Array.isArray(item[field])) {
        next._preview_urls[field] = item[field].map((value) => {
          const fileID = getPreviewFileID(value, moduleConfig.imageFields[field]);
          return urlMap[fileID] || (isBrowserImageUrl(value) ? value : '');
        });
        return;
      }
      const fileID = getPreviewFileID(item[field], moduleConfig.imageFields[field]);
      if (urlMap[fileID]) next._preview_urls[field] = urlMap[fileID];
    });
    if (moduleConfig.key === 'page_id') {
      next._content_preview_urls = {};
      collectContentImageFileIDs(item.content_blocks || []).forEach((fileID) => {
        if (urlMap[fileID]) next._content_preview_urls[fileID] = urlMap[fileID];
      });
    }
    return next;
  });
}

async function list(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  const pageSize = Math.min(Math.max(Number(event.page_size) || 100, 1), 100);
  let result;
  try {
    result = await db.collection(event.collection)
      .where({ is_deleted: _.neq(true) })
      .orderBy(moduleConfig.sort || 'updated_at', moduleConfig.sort === 'created_at' || moduleConfig.sort === 'updated_at' ? 'desc' : 'asc')
      .limit(pageSize)
      .get();
  } catch (error) {
    const message = String(error.errMsg || error.message || '');
    if (message.includes('collection') && (message.includes('not exist') || message.includes('不存在'))) {
      return ok({ rows: [], module: event.collection });
    }
    throw error;
  }
  const rows = await attachPreviewUrls(sortAdminRows(result.data || [], moduleConfig), moduleConfig);
  return ok({ rows, module: event.collection });
}

async function create(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  await ensureCollection(event.collection);
  const input = event.data || {};
  const data = Object.assign(buildData(moduleConfig, input), { created_at: now() });
  if (event.collection === 'members') {
    const conflict = await validateMemberMobileUnique(data);
    if (conflict) return conflict;
  }
  const result = await db.collection(event.collection).add({ data });
  if (event.collection === 'members') await syncUsersForMember(data);
  return ok({ _id: result._id });
}

async function update(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');
  const id = cleanText(event._id, 120);
  if (!id) return fail('缺少要更新的记录 _id。');

  const current = await db.collection(event.collection).doc(id).get();
  if (!current.data || current.data.is_deleted === true) return fail('记录不存在或已删除。', 'NOT_FOUND');

  const data = buildData(moduleConfig, event.data || {}, current.data);
  if (event.collection === 'members') {
    const conflict = await validateMemberMobileUnique(data, current.data);
    if (conflict) return conflict;
  }
  if (event.collection === 'content_pages' && data.is_active === true) {
    data.page_status = 'published';
    data.activated_at = now();
    data.activated_by = cleanText(event.admin_user || event.username || 'admin', 80);
  }
  await db.collection(event.collection).doc(id).update({ data });
  if (event.collection === 'members') await syncUsersForMember(Object.assign({}, current.data, data));
  if (event.collection === 'content_pages' && data.is_active === true) {
    await deactivateOtherIntroPages(id);
  }
  if (RESERVATION_COLLECTIONS.includes(event.collection)
    && Object.prototype.hasOwnProperty.call(data, 'reservation_status')
    && data.reservation_status !== current.data.reservation_status
    && ADMIN_RESERVATION_STATUSES.includes(data.reservation_status)) {
    await notifyReservationStatus(event.collection, Object.assign({}, current.data, data), data.reservation_status, data.admin_remark || '');
  }
  if (event.collection === 'meal_orders'
    && Object.prototype.hasOwnProperty.call(data, 'order_status')
    && data.order_status !== current.data.order_status
    && ADMIN_MEAL_ORDER_STATUSES.includes(data.order_status)) {
    await notifyMealOrderStatus(Object.assign({}, current.data, data), data.order_status, data.admin_remark || '');
  }
  if (event.collection === 'activity_signups'
    && Object.prototype.hasOwnProperty.call(data, 'signup_status')
    && data.signup_status !== current.data.signup_status
    && ADMIN_ACTIVITY_SIGNUP_STATUSES.includes(data.signup_status)) {
    await notifyActivitySignupStatus(Object.assign({}, current.data, data), data.signup_status, data.admin_remark || '');
  }
  return ok({ _id: id });
}

async function deactivateOtherIntroPages(activeId) {
  const result = await db.collection('content_pages')
    .where({
      page_type: 'intro',
      is_active: true,
      is_deleted: _.neq(true),
    })
    .limit(100)
    .get();

  for (const row of result.data || []) {
    if (row._id !== activeId) {
      await db.collection('content_pages').doc(row._id).update({
        data: {
          is_active: false,
          updated_at: now(),
        },
      });
    }
  }
}

async function duplicateContentPage(event) {
  const id = cleanText(event._id, 120);
  if (!id) return fail('缺少要复制的内容记录 _id。');

  const current = await db.collection('content_pages').doc(id).get();
  if (!current.data || current.data.is_deleted === true) {
    return fail('内容记录不存在或已删除。', 'NOT_FOUND');
  }

  const source = current.data;
  const pageId = normalizePageId(event.page_id || `${source.page_id || 'intro'}_copy_${Date.now()}`);
  const data = Object.assign({}, source, {
    _id: undefined,
    page_id: pageId,
    title: cleanText(event.title || `${source.title || '介绍内容'} 副本`, 120),
    page_status: 'draft',
    is_active: false,
    activated_at: null,
    activated_by: '',
    created_at: now(),
    updated_at: now(),
    is_deleted: false,
  });
  delete data._id;
  delete data._openid;
  const result = await db.collection('content_pages').add({ data });
  return ok({ _id: result._id, page_id: pageId });
}

async function activateContentPage(event) {
  const id = cleanText(event._id, 120);
  if (!id) return fail('缺少要启用的内容记录 _id。');

  const current = await db.collection('content_pages').doc(id).get();
  if (!current.data || current.data.is_deleted === true) {
    return fail('内容记录不存在或已删除。', 'NOT_FOUND');
  }
  if (current.data.page_type !== 'intro') {
    return fail('只有 page_type 为 intro 的内容可以设为介绍页。', 'INVALID_PAGE_TYPE');
  }

  const data = {
    page_status: 'published',
    is_active: true,
    activated_at: now(),
    activated_by: cleanText(event.admin_user || event.username || 'admin', 80),
    updated_at: now(),
    is_deleted: false,
  };
  await db.collection('content_pages').doc(id).update({ data });
  await deactivateOtherIntroPages(id);
  return ok({ _id: id });
}

async function remove(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');
  const id = cleanText(event._id, 120);
  if (!id) return fail('缺少要删除的记录 _id。');

  await db.collection(event.collection).doc(id).update({
    data: { is_deleted: true, updated_at: now() },
  });
  return ok({ _id: id });
}

async function updateMemberBenefits(event) {
  const memberId = cleanText(event.member_id, 120);
  if (!memberId) return fail('缺少会员 ID。', 'MEMBER_ID_REQUIRED');

  const rows = Array.isArray(event.benefits) ? event.benefits : [];
  const nowValue = now();
  const results = [];

  for (const row of rows) {
    const benefitKey = cleanText(row.benefit_key, 120);
    const benefitName = cleanText(row.benefit_name, 120);
    if (!benefitKey || !benefitName) continue;

    const accountId = cleanText(row.benefit_account_id, 120)
      || `MBA_${memberId}_${benefitKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const data = {
      benefit_account_id: accountId,
      member_id: memberId,
      level_id: cleanText(row.level_id || event.level_id, 120),
      benefit_key: benefitKey,
      benefit_name: benefitName,
      benefit_type: cleanText(row.benefit_type, 40) || 'service',
      total_quota: toNumber(row.total_quota, 0),
      used_quota: toNumber(row.used_quota, 0),
      locked_quota: toNumber(row.locked_quota, 0),
      remaining_quota: toNumber(row.remaining_quota, 0),
      quota_unit: cleanText(row.quota_unit, 40),
      valid_start_at: cleanText(row.valid_start_at || event.benefit_start_at, 80),
      valid_end_at: cleanText(row.valid_end_at || event.benefit_end_at, 80),
      account_status: cleanText(row.account_status, 40) || 'active',
      updated_at: nowValue,
      is_deleted: false,
    };

    const found = await db.collection('member_benefit_accounts')
      .where({ benefit_account_id: accountId, is_deleted: _.neq(true) })
      .limit(1)
      .get();

    if (found.data && found.data.length) {
      await db.collection('member_benefit_accounts').doc(found.data[0]._id).update({ data });
      results.push({ _id: found.data[0]._id, benefit_account_id: accountId, action: 'updated' });
    } else {
      const addResult = await db.collection('member_benefit_accounts').add({
        data: Object.assign({}, data, { created_at: nowValue }),
      });
      results.push({ _id: addResult._id, benefit_account_id: accountId, action: 'created' });
    }
  }

  return ok({ member_id: memberId, rows: results });
}

async function findReservationRecord(event) {
  const id = cleanText(event._id, 120);
  const orderNo = cleanText(event.order_no || event.order_id, 120);
  const requestedCollection = cleanText(event.collection, 80);
  const collections = RESERVATION_COLLECTIONS.includes(requestedCollection)
    ? [requestedCollection]
    : RESERVATION_COLLECTIONS;

  for (const collectionName of collections) {
    if (id) {
      try {
        const result = await db.collection(collectionName).doc(id).get();
        if (result.data && result.data.is_deleted !== true) {
          return { collectionName, id, row: result.data };
        }
      } catch (error) {}
    }

    if (orderNo) {
      const result = await db.collection(collectionName)
        .where({ order_no: orderNo, is_deleted: _.neq(true) })
        .limit(1)
        .get();
      if (result.data && result.data.length) {
        return { collectionName, id: result.data[0]._id, row: result.data[0] };
      }
    }
  }
  return null;
}

async function releaseAccommodationBenefit(row) {
  const benefitAccountId = cleanText(row.benefit_account_id, 120);
  const orderNo = cleanText(row.order_no, 120);
  if (!benefitAccountId || !orderNo) return;

  const usageResult = await db.collection('member_benefit_usage_records')
    .where({
      benefit_account_id: benefitAccountId,
      business_order_no: orderNo,
      usage_status: 'locked',
      is_deleted: _.neq(true),
    })
    .limit(10)
    .get();
  if (!usageResult.data || !usageResult.data.length) return;

  const accountResult = await db.collection('member_benefit_accounts')
    .where({ benefit_account_id: benefitAccountId, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  if (accountResult.data && accountResult.data.length) {
    await db.collection('member_benefit_accounts').doc(accountResult.data[0]._id).update({
      data: {
        remaining_quota: _.inc(usageResult.data.length),
        locked_quota: _.inc(-usageResult.data.length),
        updated_at: now(),
      },
    });
  }

  for (const usage of usageResult.data) {
    await db.collection('member_benefit_usage_records').doc(usage._id).update({
      data: {
        usage_status: 'released',
        released_at: now(),
        updated_at: now(),
      },
    });
  }
}

async function reservationStatusUpdate(event) {
  const status = cleanText(event.reservation_status || event.status, 40);
  const settle = event.settle === true || cleanText(event.payment_status, 40) === 'settled';
  if (status && !ADMIN_RESERVATION_STATUSES.includes(status)) {
    return fail('预约状态仅支持 confirmed、rejected、cancelled。', 'INVALID_RESERVATION_STATUS');
  }
  if (!status && !settle) return fail('EMPTY_UPDATE', 'EMPTY_UPDATE');

  const found = await findReservationRecord(event);
  if (!found) return fail('预约记录不存在或已删除。', 'NOT_FOUND');

  const data = {
    admin_remark: cleanText(event.admin_remark || event.remark, 500),
    updated_at: now(),
  };
  if (status) {
    data.reservation_status = status;
    if (status === 'confirmed') data.confirmed_at = now();
    if (status === 'rejected') data.rejected_at = now();
    if (status === 'cancelled') data.cancelled_at = now();
  }
  if (settle) {
    data.payment_status = 'settled';
    data.settled_at = now();
  }
  if (status === 'rejected' || status === 'cancelled') {
    data.lock_expires_at = null;
    if (found.collectionName === 'accommodation_reservations') {
      await releaseAccommodationBenefit(found.row);
    }
  }

  await db.collection(found.collectionName).doc(found.id).update({ data });
  await notifyReservationStatus(found.collectionName, Object.assign({}, found.row, data), status || 'settled', data.admin_remark || '');
  return ok({
    _id: found.id,
    collection: found.collectionName,
    reservation_status: data.reservation_status,
    payment_status: data.payment_status,
  });
}

async function findMealOrderRecord(event) {
  const id = cleanText(event._id, 120);
  const orderNo = cleanText(event.order_no || event.order_id, 120);
  if (id) {
    try {
      const result = await db.collection('meal_orders').doc(id).get();
      if (result.data && result.data.is_deleted !== true) return { id, row: result.data };
    } catch (error) {}
  }
  if (orderNo) {
    const result = await db.collection('meal_orders')
      .where({ order_no: orderNo, is_deleted: _.neq(true) })
      .limit(1)
      .get();
    if (result.data && result.data.length) return { id: result.data[0]._id, row: result.data[0] };
  }
  return null;
}

async function closeMemberMealOrderSession(order, reason = 'member_offline_settled') {
  const sessionId = cleanText(order && order.session_id, 120);
  let result = null;
  if (sessionId) {
    result = await db.collection('meal_table_sessions')
      .where({ session_id: sessionId, is_deleted: _.neq(true) })
      .limit(1)
      .get();
  }
  if ((!result || !result.data || !result.data[0]) && order && order.table_id) {
    result = await db.collection('meal_table_sessions')
      .where({ table_id: order.table_id, session_status: 'active', is_deleted: _.neq(true) })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
  }
  const session = result && result.data && result.data[0];
  if (!session || !session._id) return;

  const closedAt = now();
  await db.collection('meal_table_sessions').doc(session._id).update({
    data: {
      session_status: 'closed',
      closed_reason: reason,
      closed_at: closedAt,
      updated_at: closedAt,
    },
  });
  const tableResult = await db.collection('meal_tables')
    .where({
      table_id: session.table_id || order.table_id,
      current_session_id: session.session_id,
      is_deleted: _.neq(true),
    })
    .limit(1)
    .get();
  const table = tableResult.data && tableResult.data[0];
  if (table && table._id) {
    await db.collection('meal_tables').doc(table._id).update({
      data: { current_session_id: '', updated_at: closedAt },
    });
  }
}

async function completeAndClearMealTable(event) {
  const orderIds = Array.isArray(event.order_ids)
    ? event.order_ids.map((item) => cleanText(item, 120)).filter(Boolean)
    : [];
  const sessionId = cleanText(event.session_id, 120);
  const tableId = cleanText(event.table_id, 120);
  const adminRemark = cleanText(event.admin_remark || event.remark || '后台桌台总览完成并清台', 500);
  let orders = [];

  for (const id of orderIds) {
    try {
      const result = await db.collection('meal_orders').doc(id).get();
      if (result.data && result.data.is_deleted !== true) {
        orders.push(Object.assign({}, result.data, { _id: id }));
      }
    } catch (error) {}
  }
  if (!orders.length && sessionId) {
    const result = await db.collection('meal_orders')
      .where({ session_id: sessionId, is_deleted: _.neq(true) })
      .limit(100)
      .get();
    orders = result.data || [];
  }
  if (!orders.length && tableId) {
    const result = await db.collection('meal_orders')
      .where({ table_id: tableId, is_deleted: _.neq(true) })
      .orderBy('created_at', 'desc')
      .limit(100)
      .get();
    orders = (result.data || []).filter((order) => (
      !['completed', 'cancelled', 'canceled', 'closed', 'refunded'].includes(cleanText(order.order_status, 40))
      || order.payment_status !== 'settled'
    ));
  }
  if (!orders.length) return fail('当前桌台没有可完成的点餐订单。', 'NO_MEAL_ORDERS');

  const completedAt = now();
  for (const order of orders) {
    if (!order._id) continue;
    await db.collection('meal_orders').doc(order._id).update({
      data: {
        order_status: 'completed',
        payment_status: 'settled',
        settled_at: order.settled_at || completedAt,
        completed_at: order.completed_at || completedAt,
        admin_remark: adminRemark,
        updated_at: completedAt,
      },
    });
  }

  const closeSource = Object.assign({}, orders[0], {
    session_id: sessionId || orders[0].session_id,
    table_id: tableId || orders[0].table_id,
  });
  await closeMemberMealOrderSession(closeSource, 'completed_and_cleared_by_admin');

  return ok({
    order_count: orders.length,
    session_id: closeSource.session_id || '',
    table_id: closeSource.table_id || '',
    order_status: 'completed',
    payment_status: 'settled',
  });
}

async function mealOrderStatusUpdate(event) {
  const found = await findMealOrderRecord(event);
  if (!found) return fail('点餐订单不存在或已删除。', 'NOT_FOUND');

  const data = {
    admin_remark: cleanText(event.admin_remark || event.remark, 500),
    updated_at: now(),
  };
  const orderStatus = cleanText(event.order_status || event.kitchen_status, 40);
  if (orderStatus) {
    if (!ADMIN_MEAL_ORDER_STATUSES.includes(orderStatus)) {
      return fail('点餐订单状态仅支持 preparing、completed。', 'INVALID_ORDER_STATUS');
    }
    data.order_status = orderStatus;
    if (orderStatus === 'preparing') data.preparing_at = now();
    if (orderStatus === 'completed') data.completed_at = now();
  }

  const settle = event.settle === true || cleanText(event.payment_status, 40) === 'settled';
  const isMemberOfflineSettlement = settle
    && found.row.checkout_customer_type === 'member'
    && found.row.payment_status === 'offline_pending';
  if (settle) {
    data.payment_status = 'settled';
    data.settled_at = now();
  }
  if (isMemberOfflineSettlement) {
    data.order_status = 'completed';
    data.completed_at = now();
  }

  if (!orderStatus && !settle) return fail('请提供要更新的订单状态或结算状态。', 'EMPTY_UPDATE');

  await db.collection('meal_orders').doc(found.id).update({ data });
  if (isMemberOfflineSettlement) {
    await closeMemberMealOrderSession(Object.assign({}, found.row, data));
  }
  await notifyMealOrderStatus(Object.assign({}, found.row, data), settle ? 'settled' : orderStatus, data.admin_remark || '');
  return ok({ _id: found.id, order_status: data.order_status, payment_status: data.payment_status });
}

async function findActivitySignupRecord(event) {
  const id = cleanText(event._id, 120);
  const orderNo = cleanText(event.order_no || event.signup_id, 120);
  if (id) {
    try {
      const result = await db.collection('activity_signups').doc(id).get();
      if (result.data && result.data.is_deleted !== true) return { id, row: result.data };
    } catch (error) {}
  }
  if (orderNo) {
    const result = await db.collection('activity_signups')
      .where({ order_no: orderNo, is_deleted: _.neq(true) })
      .limit(1)
      .get();
    if (result.data && result.data.length) return { id: result.data[0]._id, row: result.data[0] };
  }
  return null;
}

async function activitySignupStatusUpdate(event) {
  const status = cleanText(event.signup_status || event.status, 40);
  const settle = event.settle === true || cleanText(event.payment_status, 40) === 'settled';
  if (status && !ADMIN_ACTIVITY_SIGNUP_STATUSES.includes(status)) {
    return fail('活动报名状态仅支持 confirmed、cancelled、completed。', 'INVALID_ACTIVITY_SIGNUP_STATUS');
  }
  if (!status && !settle) return fail('请提供要更新的报名状态或核销状态。', 'EMPTY_UPDATE');

  const found = await findActivitySignupRecord(event);
  if (!found) return fail('活动报名记录不存在或已删除。', 'NOT_FOUND');

  const data = {
    admin_remark: cleanText(event.admin_remark || event.remark, 500),
    updated_at: now(),
  };
  if (status) {
    data.signup_status = status;
    if (status === 'confirmed') data.confirmed_at = now();
    if (status === 'cancelled') data.cancelled_at = now();
    if (status === 'completed') data.completed_at = now();
  }
  if (settle || status === 'completed') {
    data.payment_status = 'settled';
    data.settled_at = now();
  }

  await db.collection('activity_signups').doc(found.id).update({ data });
  await notifyActivitySignupStatus(Object.assign({}, found.row, data), status || 'completed', data.admin_remark || '');
  return ok({ _id: found.id, signup_status: data.signup_status, payment_status: data.payment_status });
}

async function uploadImage(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  const field = cleanText(event.field, 80);
  const folder = uploadFolder(moduleConfig, event, field);
  if (!folder) return fail('该字段不支持图片上传。', 'UNSUPPORTED_IMAGE_FIELD');

  const fileName = cleanText(event.file_name, 120) || `image-${Date.now()}.png`;
  const contentType = cleanText(event.content_type, 80);
  const base64 = cleanText(event.base64, MAX_IMAGE_SIZE * 2);
  const extension = IMAGE_TYPES[contentType];
  if (!extension) return fail('仅支持 JPG、PNG、WebP 或 GIF 图片。', 'UNSUPPORTED_IMAGE_TYPE');
  if (!base64) return fail('缺少图片内容。');

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) return fail('图片内容无效。');
  if (buffer.length > MAX_IMAGE_SIZE) return fail('图片不能超过 5MB。', 'IMAGE_TOO_LARGE');

  const safeName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'image';
  const cloudPath = `${folder}/${Date.now()}-${safeName}.${extension}`;
  const result = await cloud.uploadFile({ cloudPath, fileContent: buffer });

  // 记录到 cloud_files 集合，供云存储选择器查询
  try {
    await db.collection('cloud_files').add({
      data: {
        fileID: result.fileID,
        cloudPath,
        folder,
        fileName: safeName,
        extension,
        contentType,
        size: buffer.length,
        uploadedAt: Date.now(),
      },
    });
  } catch (_) { /* 集合可能尚未创建，静默忽略 */ }

  return ok({ fileID: result.fileID, cloudPath });
}

async function uploadMedia(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  const field = cleanText(event.field, 80);
  const folder = uploadFolder(moduleConfig, event, field);
  if (!folder || !(moduleConfig.videoFields && moduleConfig.videoFields[field])) {
    return fail('该字段不支持视频上传。', 'UNSUPPORTED_MEDIA_FIELD');
  }

  const fileName = cleanText(event.file_name, 120) || `video-${Date.now()}.mp4`;
  const contentType = cleanText(event.content_type, 80);
  const base64 = cleanText(event.base64, 70 * 1024 * 1024);
  const extension = VIDEO_TYPES[contentType] || 'mp4';
  if (!VIDEO_TYPES[contentType]) return fail('仅支持 MP4、MOV 或 WebM 视频。', 'UNSUPPORTED_VIDEO_TYPE');
  if (!base64) return fail('缺少视频内容。');

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) return fail('视频内容无效。');
  if (buffer.length > 50 * 1024 * 1024) return fail('视频不能超过 50MB。', 'VIDEO_TOO_LARGE');

  const safeName = safeCloudFileName(fileName.replace(/\.[^.]+$/, ''), 'video');
  const cloudPath = `${folder}/${Date.now()}-${safeName}.${extension}`;
  const result = await cloud.uploadFile({ cloudPath, fileContent: buffer });

  // 记录到 cloud_files 集合
  try {
    await db.collection('cloud_files').add({
      data: {
        fileID: result.fileID,
        cloudPath,
        folder,
        fileName: safeName,
        extension,
        contentType,
        size: buffer.length,
        uploadedAt: Date.now(),
      },
    });
  } catch (_) { /* 集合可能尚未创建 */ }

  return ok({ fileID: result.fileID, cloudPath });
}

async function previewImage(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  const field = cleanText(event.field, 80);
  const folder = moduleConfig.imageFields && moduleConfig.imageFields[field];
  if (!folder) return fail('该字段不支持图片预览。', 'UNSUPPORTED_IMAGE_FIELD');

  const fileID = getPreviewFileID(event.value, folder);
  if (!fileID) return fail('请填写 cloud:// 云存储 fileID。', 'INVALID_IMAGE_FILE_ID');

  const tempResult = await cloud.getTempFileURL({ fileList: [fileID] });
  const file = tempResult.fileList && tempResult.fileList[0];
  if (!file || file.status !== 0 || !file.tempFileURL) {
    return fail('图片临时预览地址生成失败。', 'PREVIEW_URL_FAILED');
  }
  return ok({ fileID, tempFileURL: file.tempFileURL });
}

async function generateTableQrCode(event) {
  const id = cleanText(event._id, 120);
  if (!id) return fail('缺少桌台记录 _id。');

  const current = await db.collection('meal_tables').doc(id).get();
  if (!current.data || current.data.is_deleted === true) return fail('桌台不存在或已删除。', 'NOT_FOUND');

  const table = current.data;
  const tableId = cleanText(table.table_id, 80);
  const tableName = cleanText(table.table_name, 80) || tableId;
  if (!tableId) return fail('请先保存桌台 ID。');

  const token = randomToken();
  const version = (Number(table.qr_version) || 0) + 1;
  const scene = `t=${tableId}&k=${token}&v=${version}`;
  const page = 'pages/menu/menu';

  const buffer = await getTableWxacodeBuffer(scene, page);
  if (!buffer || !buffer.length) return fail('小程序码生成失败。', 'WXACODE_FAILED');

  const cloudPath = `meal-tables/${safeCloudFileName(tableName, tableId)}-v${version}-${token.slice(0, 8)}.png`;
  const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer });
  const qrImageFileId = uploadResult.fileID;

  await db.collection('meal_tables').doc(id).update({
    data: {
      qr_token: token,
      qr_version: version,
      qr_scene: scene,
      qr_image_file_id: qrImageFileId,
      updated_at: now(),
    },
  });

  let tempFileURL = '';
  try {
    const tempResult = await cloud.getTempFileURL({ fileList: [qrImageFileId] });
    const file = tempResult.fileList && tempResult.fileList[0];
    if (file && file.status === 0) tempFileURL = file.tempFileURL || '';
  } catch (error) {
    console.warn('resolve table qr temp url failed', error);
  }

  return ok({ fileID: qrImageFileId, cloudPath, tempFileURL, qr_scene: scene, qr_version: version });
}

async function generateActivityQrCode(event) {
  const id = cleanText(event._id, 120);
  if (!id) return fail('缺少活动记录 _id。', 'MISSING_ID');

  const current = await db.collection('activity_items').doc(id).get();
  if (!current.data || current.data.is_deleted === true) return fail('活动不存在或已删除。', 'NOT_FOUND');

  const activity = current.data;
  const activityId = cleanText(activity.activity_id, 80);
  const activityTitle = cleanText(activity.title, 100) || activityId;
  if (!activityId) return fail('请先保存活动 ID。', 'MISSING_ACTIVITY_ID');

  const version = (Number(activity.qr_version) || 0) + 1;
  const scene = `a=${activityId}&v=${version}`;
  const page = 'pages/activity/activity';

  const buffer = await getTableWxacodeBuffer(scene, page);
  if (!buffer || !buffer.length) return fail('活动小程序码生成失败。', 'WXACODE_FAILED');

  const cloudPath = `activities/qrcodes/${safeCloudFileName(activityTitle, activityId)}.png`;
  const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer });
  const qrImageFileId = uploadResult.fileID;

  await db.collection('activity_items').doc(id).update({
    data: {
      qr_version: version,
      qr_scene: scene,
      qr_image_file_id: qrImageFileId,
      updated_at: now(),
    },
  });

  let tempFileURL = '';
  try {
    const tempResult = await cloud.getTempFileURL({ fileList: [qrImageFileId] });
    const file = tempResult.fileList && tempResult.fileList[0];
    if (file && file.status === 0) tempFileURL = file.tempFileURL || '';
  } catch (error) {
    console.warn('resolve activity qr temp url failed', error);
  }

  return ok({ fileID: qrImageFileId, cloudPath, tempFileURL, qr_scene: scene, qr_version: version });
}

async function syncCloudFiles(event) {
  if (!Array.isArray(event.items) || !event.items.length) {
    return fail('items 必须是非空数组', 'INVALID_PARAM');
  }
  const coll = db.collection('cloud_files');
  const results = { total: event.items.length, created: 0, skipped: 0, errors: 0 };
  for (const item of event.items) {
    try {
      const fileID = cleanText(item.fileID, 512);
      const cloudPath = cleanText(item.cloudPath, 512);
      if (!fileID || !cloudPath) { results.errors++; continue; }
      // 检查是否已存在
      const exist = await coll.where({ fileID }).limit(1).get();
      if (exist.data && exist.data.length) { results.skipped++; continue; }
      const fileName = cloudPath.split('/').pop() || '';
      await coll.add({
        fileID,
        cloudPath,
        fileName,
        folder: cleanText(item.folder, 200) || cloudPath.replace(`/${fileName}`, '').split('/').pop() || '',
        extension: (fileName.split('.').pop() || '').toLowerCase(),
        contentType: item.contentType || (/\.(mp4|mov|webm)$/i.test(fileName) ? 'video' : 'image'),
        size: Number(item.size) || 0,
        uploadedAt: new Date(item.uploadedAt || Date.now()),
        createdAt: new Date(),
      });
      results.created++;
    } catch (_) { results.errors++; }
  }
  return ok(results);
}

async function listCloudFiles(event) {
  const folder = cleanText(event.folder, 200) || '';
  const limit = Math.min(Number(event.limit) || 60, 200);

  try {
    let query = db.collection('cloud_files');
    if (folder) {
      query = query.where({ folder });
    }
    const result = await query.orderBy('uploadedAt', 'desc').limit(limit).get();
    const files = (result.data || []).map((f) => ({
      fileID: f.fileID,
      cloudPath: f.cloudPath,
      fileName: f.fileName,
      extension: f.extension,
      contentType: f.contentType,
      size: f.size,
      folder: f.folder,
      uploadedAt: f.uploadedAt,
    }));

    // 批量获取预览临时链接
    if (files.length) {
      const fileIDs = files.map((f) => f.fileID).filter(Boolean);
      try {
        const tempResult = await cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
        const urlMap = {};
        (tempResult.fileList || []).forEach((f) => {
          if (f.status === 0 && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
        });
        files.forEach((f) => {
          f.previewUrl = urlMap[f.fileID] || '';
        });
      } catch (_) { /* 预览链接获取失败不影响列表 */ }
    }

    return ok({ files, total: files.length });
  } catch (_) {
    // 集合不存在时返回空列表
    return ok({ files: [], total: 0 });
  }
}

exports.main = async (event = {}) => {
  if (event.action === 'login') return login(event);

  const authError = requireAdmin(event);
  if (authError) return authError;

  try {
    if (event.action === 'list') return await list(event);
    if (event.action === 'create') return await create(event);
    if (event.action === 'update') return await update(event);
    if (event.action === 'delete') return await remove(event);
    if (event.action === 'uploadImage') return await uploadImage(event);
    if (event.action === 'uploadMedia') return await uploadMedia(event);
    if (event.action === 'previewImage') return await previewImage(event);
    if (event.action === 'duplicateContentPage') return await duplicateContentPage(event);
    if (event.action === 'activateContentPage') return await activateContentPage(event);
    if (event.action === 'generateTableQrCode') return await generateTableQrCode(event);
    if (event.action === 'generateActivityQrCode') return await generateActivityQrCode(event);
    if (event.action === 'reservationStatusUpdate') return await reservationStatusUpdate(event);
    if (event.action === 'mealOrderStatusUpdate') return await mealOrderStatusUpdate(event);
    if (event.action === 'completeAndClearMealTable') return await completeAndClearMealTable(event);
    if (event.action === 'activitySignupStatusUpdate') return await activitySignupStatusUpdate(event);
    if (event.action === 'updateMemberBenefits') return await updateMemberBenefits(event);
    if (event.action === 'syncCloudFiles') return await syncCloudFiles(event);
    if (event.action === 'listCloudFiles') return await listCloudFiles(event);
    if (event.action === 'modules') return ok({ modules: Object.keys(MODULES) });
    return fail('不支持的操作。', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('adminManage failed', event.action, event.collection, error);
    return fail(error.message || '后台操作失败。', 'SERVER_ERROR');
  }
};
