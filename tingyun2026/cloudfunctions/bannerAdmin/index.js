const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const collection = db.collection('home_banners');

const COLLECTION_NAME = 'home_banners';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
  if (!expected) {
    return fail('请先在 bannerAdmin 云函数环境变量中配置 ADMIN_API_TOKEN。', 'ADMIN_TOKEN_NOT_CONFIGURED');
  }
  if (!event || event.admin_token !== expected) {
    return fail('后台口令不正确或已失效。', 'UNAUTHORIZED');
  }
  return null;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanOptionalText(value, maxLength) {
  if (value === undefined || value === null) return '';
  return cleanText(value, maxLength);
}

function cleanBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function cleanNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}

function cleanDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildBannerData(input, existing = {}) {
  const title = cleanText(input.title, 80);
  const imageUrl = cleanText(input.image_url, 400);

  if (!title) return { error: '请填写主标题。' };
  if (!imageUrl) return { error: '请上传或填写轮播图片。' };

  return {
    data: {
      image_url: imageUrl,
      kicker: cleanOptionalText(input.kicker, 40),
      title,
      description: cleanOptionalText(input.description, 140),
      link_type: cleanOptionalText(input.link_type || 'none', 20) || 'none',
      link_target: cleanOptionalText(input.link_target, 300),
      sort_order: cleanNumber(input.sort_order, existing.sort_order || 10),
      is_enabled: cleanBoolean(input.is_enabled, existing.is_enabled !== false),
      start_at: cleanDate(input.start_at),
      end_at: cleanDate(input.end_at),
      is_deleted: false,
      updated_at: now(),
    },
  };
}

function normalizeBanner(row) {
  return {
    _id: row._id,
    banner_id: row.banner_id,
    image_url: row.image_url || '',
    preview_url: row.preview_url || row.image_url || '',
    kicker: row.kicker || '',
    title: row.title || '',
    description: row.description || '',
    link_type: row.link_type || 'none',
    link_target: row.link_target || '',
    sort_order: row.sort_order || 0,
    is_enabled: row.is_enabled !== false,
    start_at: row.start_at || null,
    end_at: row.end_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

async function withPreviewUrls(items) {
  const fileIDs = items.map((item) => item.image_url).filter(isCloudFile);
  if (!fileIDs.length) return items;

  const tempResult = await cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  const urlMap = {};
  tempResult.fileList.forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  return items.map((item) => Object.assign({}, item, {
    preview_url: urlMap[item.image_url] || item.image_url,
  }));
}

async function listBanners() {
  const result = await collection
    .where({ is_deleted: _.neq(true) })
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'desc')
    .get();
  const rows = await withPreviewUrls(result.data);
  return ok({ banners: rows.map(normalizeBanner) });
}

async function createBanner(event) {
  const input = event.banner || {};
  const built = buildBannerData(input);
  if (built.error) return fail(built.error);

  const bannerId = cleanText(input.banner_id, 80) || `banner_${Date.now()}`;
  const existing = await collection.where({ banner_id: bannerId, is_deleted: _.neq(true) }).limit(1).get();
  if (existing.data.length) return fail('轮播图 ID 已存在，请换一个。', 'DUPLICATE_BANNER_ID');

  const data = Object.assign({}, built.data, {
    banner_id: bannerId,
    created_at: now(),
  });
  const result = await collection.add({ data });
  return ok({ _id: result._id, banner_id: bannerId });
}

async function updateBanner(event) {
  const id = cleanText(event._id, 80);
  if (!id) return fail('缺少要更新的轮播图 _id。');

  const current = await collection.doc(id).get();
  if (!current.data || current.data.is_deleted === true) return fail('轮播图不存在或已删除。', 'NOT_FOUND');

  const built = buildBannerData(event.banner || {}, current.data);
  if (built.error) return fail(built.error);

  await collection.doc(id).update({ data: built.data });
  return ok({ _id: id });
}

async function deleteBanner(event) {
  const id = cleanText(event._id, 80);
  if (!id) return fail('缺少要删除的轮播图 _id。');

  await collection.doc(id).update({
    data: {
      is_deleted: true,
      is_enabled: false,
      updated_at: now(),
    },
  });
  return ok({ _id: id });
}

async function uploadImage(event) {
  const fileName = cleanText(event.file_name, 120) || `banner-${Date.now()}.png`;
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
    .slice(0, 60) || 'banner';
  const cloudPath = `home/banners/${Date.now()}-${safeName}.${extension}`;
  const result = await cloud.uploadFile({ cloudPath, fileContent: buffer });

  return ok({ fileID: result.fileID, cloudPath });
}

exports.main = async (event = {}) => {
  const action = event.action || 'list';
  const authError = requireAdmin(event);
  if (authError) return authError;

  try {
    if (action === 'list') return await listBanners();
    if (action === 'create') return await createBanner(event);
    if (action === 'update') return await updateBanner(event);
    if (action === 'delete') return await deleteBanner(event);
    if (action === 'uploadImage') return await uploadImage(event);
    return fail(`不支持的操作：${action}`, 'UNKNOWN_ACTION');
  } catch (error) {
    console.error(`[${COLLECTION_NAME}] ${action} failed`, error);
    return fail(error.message || '后台操作失败。', 'SERVER_ERROR');
  }
};
