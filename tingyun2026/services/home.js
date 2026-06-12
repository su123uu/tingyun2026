function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
}

function canUseCloudDatabase() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.database;
}

async function callCloud(name, data = {}) {
  const result = await wx.cloud.callFunction({ name, data });
  return result.result && result.result.data ? result.result.data : result.result;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeHomeContent(content) {
  const source = content || {};
  return {
    banner_interval: source.banner_interval || 4200,
    banners: asArray(source.banners).filter((item) => item && item.is_enabled !== false),
    quick_entries: asArray(source.quick_entries).filter((item) => item && item.is_enabled !== false),
    feature_cards: asArray(source.feature_cards).filter((item) => item && item.is_enabled !== false),
  };
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

async function resolveCloudImages(items, fields) {
  const rows = asArray(items);
  if (!wx.cloud.getTempFileURL) return rows;
  const fileIDs = [];
  rows.forEach((item) => {
    fields.forEach((field) => {
      if (isCloudFile(item[field])) fileIDs.push(item[field]);
    });
  });
  if (!fileIDs.length) return rows;

  const tempResult = await wx.cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  const urlMap = {};
  asArray(tempResult.fileList).forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  return rows.map((item) => {
    const next = Object.assign({}, item);
    fields.forEach((field) => {
      if (urlMap[next[field]]) next[field] = urlMap[next[field]];
    });
    return next;
  });
}

async function getAll(query) {
  let rows = [];
  let offset = 0;
  const pageSize = 20;
  while (true) {
    const result = await query.skip(offset).limit(pageSize).get();
    const batch = asArray(result.data);
    rows = rows.concat(batch);
    if (batch.length < pageSize) return rows;
    offset += batch.length;
  }
}

async function listEnabled(collectionName) {
  const query = wx.cloud.database().collection(collectionName)
    .where({ is_enabled: true, is_deleted: false })
    .orderBy('sort_order', 'asc');
  return getAll(query);
}

async function getDatabaseHomeContent() {
  const [rawBanners, quickEntries, rawFeatureCards] = await Promise.all([
    listEnabled('home_banners'),
    listEnabled('home_quick_entries'),
    listEnabled('home_feature_cards'),
  ]);
  const [banners, featureCards] = await Promise.all([
    resolveCloudImages(rawBanners, ['image_url']),
    resolveCloudImages(rawFeatureCards, ['image_url']),
  ]);
  return normalizeHomeContent({
    banner_interval: 4200,
    banners,
    quick_entries: quickEntries,
    feature_cards: featureCards,
  });
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
  if (!page || !wx.cloud.getTempFileURL) return page;
  const fileIDs = [];
  if (isCloudFile(page.cover_image_url)) fileIDs.push(page.cover_image_url);
  collectImageFileIDs(page.content_blocks || [], fileIDs);
  const uniqueFileIDs = Array.from(new Set(fileIDs));
  if (!uniqueFileIDs.length) return page;

  const tempResult = await wx.cloud.getTempFileURL({ fileList: uniqueFileIDs });
  const urlMap = {};
  asArray(tempResult.fileList).forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  const next = Object.assign({}, page);
  if (urlMap[next.cover_image_url]) next.cover_image_url = urlMap[next.cover_image_url];
  next.content_blocks = replaceImageUrls(next.content_blocks || [], urlMap);
  return next;
}

async function getDatabaseContentPage(input = {}) {
  const db = wx.cloud.database();
  const pageId = input.page_id || '';
  let query = db.collection('content_pages');
  if (pageId) {
    query = query.where({ page_id: pageId, page_status: 'published', is_deleted: false });
  } else {
    query = query.where({
      page_type: 'intro',
      is_active: true,
      page_status: 'published',
      is_deleted: false,
    }).orderBy('activated_at', 'desc');
  }
  const result = await query.limit(1).get();
  const page = result.data && result.data[0];
  if (!page) throw new Error('当前没有已发布的介绍内容，请在后台发布并设为当前使用。');
  return resolvePageImages(page);
}

async function getHomeContent() {
  if (canUseCloudDatabase()) {
    try {
      return await getDatabaseHomeContent();
    } catch (error) {
      console.warn('database home content failed', error);
    }
  }
  if (canUseCloud()) {
    try {
      return normalizeHomeContent(await callCloud('homeContentGet'));
    } catch (error) {
      console.warn('homeContentGet failed', error);
    }
  }
  return normalizeHomeContent(null);
}

async function getContentPage(input) {
  if (canUseCloudDatabase()) {
    try {
      return await getDatabaseContentPage(input);
    } catch (error) {
      console.warn('database content page fallback to cloud function', error);
    }
  }
  if (canUseCloud()) {
    try {
      const result = await callCloud('contentPageGet', input);
      if (result && result.ok === false) {
        throw new Error(result.message || result.code || 'content page unavailable');
      }
      return result;
    } catch (error) {
      console.warn('contentPageGet failed', error);
      throw error;
    }
  }
  throw new Error('cloud service unavailable');
}

module.exports = { getHomeContent, getContentPage };
