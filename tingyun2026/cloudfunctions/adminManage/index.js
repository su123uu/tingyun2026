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
const ADMIN_KITCHEN_STATUSES = ['kitchen_notified', 'preparing', 'completed'];
const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
    fields: ['session_id', 'table_id', 'table_name', 'table_area', 'people_count', 'session_status', 'has_order', 'expires_at', 'ordered_at', 'closed_at', 'closed_reason'],
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
    fields: ['room_id', 'name', 'category', 'min_capacity', 'max_capacity', 'regular_price', 'member_price', 'image_url', 'image_urls', 'is_available', 'sort_order'],
  },
  activity_items: {
    key: 'activity_id',
    sort: 'sort_order',
    imageFields: { image_url: 'activities' },
    fields: ['activity_id', 'title', 'description', 'list_description', 'detail_summary', 'intro', 'notice', 'image_url', 'date', 'time', 'location', 'start_at', 'end_at', 'signup_deadline', 'signup_scope', 'fee_type', 'guest_price', 'member_price', 'capacity', 'reserved_count', 'status', 'status_tone', 'sort_order'],
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
    key: 'reservation_id',
    sort: 'created_at',
    fields: ['reservation_id', 'order_no', 'customer_name', 'customer_mobile', 'reservation_date', 'reservation_time', 'guest_count', 'room_id', 'room_name', 'meal_standard_id', 'meal_standard_name', 'reservation_status', 'remark', 'admin_remark'],
  },
  accommodation_reservations: {
    key: 'reservation_id',
    sort: 'created_at',
    fields: ['reservation_id', 'order_no', 'customer_name', 'customer_mobile', 'checkin_date', 'checkout_date', 'guest_count', 'room_id', 'room_name', 'reservation_status', 'remark', 'admin_remark'],
  },
  activity_signups: {
    key: 'signup_id',
    sort: 'created_at',
    fields: ['signup_id', 'order_no', 'activity_id', 'activity_title', 'contact_name', 'contact_mobile', 'participant_count', 'signup_status', 'remark', 'admin_remark'],
  },
  meal_orders: {
    key: 'order_id',
    sort: 'created_at',
    fields: ['order_id', 'order_no', 'table_id', 'table_name', 'customer_name', 'customer_mobile', 'items', 'total_amount', 'pay_amount', 'order_status', 'payment_status', 'remark', 'admin_remark'],
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
  const openid = cleanText(row.created_by_openid, 120);
  const payload = Object.assign({}, row, {
    reservation_status: status,
    status,
    admin_remark: adminRemark,
  });
  if (businessType && businessNo && openid) {
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
  const openid = cleanText(row.created_by_openid, 120);
  const payload = Object.assign({}, row, {
    order_status: status,
    kitchen_status: status,
    status,
    admin_remark: adminRemark,
  });
  if (businessNo && openid) {
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'meal_order',
      business_no: businessNo,
      openid,
      status,
      admin_remark: adminRemark,
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

function cleanValue(value) {
  if (value === undefined) return undefined;
  if (value === '') return '';
  if (typeof value === 'string') return cleanText(value, 5000);
  return value;
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
  data.updated_at = now();
  data.is_deleted = false;
  return data;
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
  const result = await db.collection(event.collection)
    .where({ is_deleted: _.neq(true) })
    .orderBy(moduleConfig.sort || 'updated_at', moduleConfig.sort === 'created_at' || moduleConfig.sort === 'updated_at' ? 'desc' : 'asc')
    .limit(pageSize)
    .get();
  const rows = await attachPreviewUrls(result.data, moduleConfig);
  return ok({ rows, module: event.collection });
}

async function create(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  const input = event.data || {};
  const data = Object.assign(buildData(moduleConfig, input), { created_at: now() });
  const result = await db.collection(event.collection).add({ data });
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
  if (event.collection === 'content_pages' && data.is_active === true) {
    data.page_status = 'published';
    data.activated_at = now();
    data.activated_by = cleanText(event.admin_user || event.username || 'admin', 80);
  }
  await db.collection(event.collection).doc(id).update({ data });
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
    && ADMIN_KITCHEN_STATUSES.includes(data.order_status)) {
    await notifyMealOrderStatus(Object.assign({}, current.data, data), data.order_status, data.admin_remark || '');
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
  if (!ADMIN_RESERVATION_STATUSES.includes(status)) {
    return fail('预约状态仅支持 confirmed、rejected、cancelled。', 'INVALID_RESERVATION_STATUS');
  }

  const found = await findReservationRecord(event);
  if (!found) return fail('预约记录不存在或已删除。', 'NOT_FOUND');

  const data = {
    reservation_status: status,
    admin_remark: cleanText(event.admin_remark || event.remark, 500),
    updated_at: now(),
  };
  if (status === 'confirmed') data.confirmed_at = now();
  if (status === 'rejected') data.rejected_at = now();
  if (status === 'cancelled') data.cancelled_at = now();
  if (status === 'rejected' || status === 'cancelled') {
    data.lock_expires_at = null;
    if (found.collectionName === 'accommodation_reservations') {
      await releaseAccommodationBenefit(found.row);
    }
  }

  await db.collection(found.collectionName).doc(found.id).update({ data });
  await notifyReservationStatus(found.collectionName, Object.assign({}, found.row, data), status, data.admin_remark || '');
  return ok({ _id: found.id, collection: found.collectionName, reservation_status: status });
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

async function mealOrderStatusUpdate(event) {
  const found = await findMealOrderRecord(event);
  if (!found) return fail('点餐订单不存在或已删除。', 'NOT_FOUND');

  const data = {
    admin_remark: cleanText(event.admin_remark || event.remark, 500),
    updated_at: now(),
  };
  const kitchenStatus = cleanText(event.kitchen_status || event.order_status, 40);
  if (kitchenStatus) {
    if (!ADMIN_KITCHEN_STATUSES.includes(kitchenStatus)) {
      return fail('厨房状态仅支持 kitchen_notified、preparing、completed。', 'INVALID_KITCHEN_STATUS');
    }
    data.kitchen_status = kitchenStatus;
    data.order_status = kitchenStatus;
    if (kitchenStatus === 'preparing') data.preparing_at = now();
    if (kitchenStatus === 'completed') data.completed_at = now();
  }

  const settle = event.settle === true || cleanText(event.settlement_status || event.payment_status, 40) === 'settled';
  if (settle) {
    data.settlement_status = 'settled';
    data.payment_status = 'settled';
    data.settled_at = now();
  }

  if (!kitchenStatus && !settle) return fail('请提供要更新的厨房状态或结算状态。', 'EMPTY_UPDATE');

  await db.collection('meal_orders').doc(found.id).update({ data });
  await notifyMealOrderStatus(Object.assign({}, found.row, data), kitchenStatus || 'settled', data.admin_remark || '');
  return ok({ _id: found.id, kitchen_status: data.kitchen_status, settlement_status: data.settlement_status });
}

async function uploadImage(event) {
  const moduleConfig = getModule(event.collection);
  if (!moduleConfig) return fail('不支持的管理集合。', 'UNKNOWN_COLLECTION');

  const field = cleanText(event.field, 80);
  const folder = moduleConfig.imageFields && moduleConfig.imageFields[field];
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

  const cloudPath = `meal-tables/${safeCloudFileName(tableName, tableId)}.png`;
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
    if (event.action === 'previewImage') return await previewImage(event);
    if (event.action === 'duplicateContentPage') return await duplicateContentPage(event);
    if (event.action === 'activateContentPage') return await activateContentPage(event);
    if (event.action === 'generateTableQrCode') return await generateTableQrCode(event);
    if (event.action === 'reservationStatusUpdate') return await reservationStatusUpdate(event);
    if (event.action === 'mealOrderStatusUpdate') return await mealOrderStatusUpdate(event);
    if (event.action === 'modules') return ok({ modules: Object.keys(MODULES) });
    return fail('不支持的操作。', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('adminManage failed', event.action, event.collection, error);
    return fail(error.message || '后台操作失败。', 'SERVER_ERROR');
  }
};
