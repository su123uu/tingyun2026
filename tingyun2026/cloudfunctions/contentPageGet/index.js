const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function collectImageFileIDs(value, fileIDs = []) {
  if (!value || typeof value !== 'object') return fileIDs;
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageFileIDs(item, fileIDs));
    return fileIDs;
  }
  if (isCloudFile(value.image_url)) fileIDs.push(value.image_url);
  Object.keys(value).forEach((key) => {
    if (key !== 'image_url') collectImageFileIDs(value[key], fileIDs);
  });
  return fileIDs;
}

function replaceImageUrls(value, urlMap) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => replaceImageUrls(item, urlMap));
  const next = Object.assign({}, value);
  if (urlMap[next.image_url]) next.image_url = urlMap[next.image_url];
  Object.keys(next).forEach((key) => {
    if (key !== 'image_url') next[key] = replaceImageUrls(next[key], urlMap);
  });
  return next;
}

async function resolvePageImages(page) {
  if (!page) return page;
  const fileIDs = [];
  if (isCloudFile(page.cover_image_url)) fileIDs.push(page.cover_image_url);
  collectImageFileIDs(page.content_blocks || [], fileIDs);
  const uniqueFileIDs = Array.from(new Set(fileIDs));
  if (!uniqueFileIDs.length) return page;

  const tempResult = await cloud.getTempFileURL({ fileList: uniqueFileIDs });
  const urlMap = {};
  (Array.isArray(tempResult.fileList) ? tempResult.fileList : []).forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  const next = Object.assign({}, page);
  if (urlMap[next.cover_image_url]) next.cover_image_url = urlMap[next.cover_image_url];
  next.content_blocks = replaceImageUrls(next.content_blocks || [], urlMap);
  return next;
}

async function getActiveIntroPage() {
  const result = await db.collection('content_pages')
    .where({
      page_type: 'intro',
      is_active: true,
      page_status: 'published',
      is_deleted: false,
    })
    .orderBy('activated_at', 'desc')
    .limit(1)
    .get();
  return result.data && result.data[0];
}

async function getPageById(pageId) {
  const result = await db.collection('content_pages')
    .where({ page_id: pageId, page_status: 'published', is_deleted: false })
    .limit(1)
    .get();
  return result.data && result.data[0];
}

exports.main = async (event = {}) => {
  const pageId = event.page_id || '';
  const page = pageId ? await getPageById(pageId) : await getActiveIntroPage();

  if (!page) {
    return {
      ok: false,
      code: 'CONTENT_PAGE_NOT_FOUND',
      message: '当前没有已启用的介绍内容，请在后台发布并设为当前使用。',
    };
  }

  return { ok: true, data: await resolvePageImages(page) };
};
