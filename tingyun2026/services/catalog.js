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

function withImageAlias(item) {
  const imageUrls = Array.isArray(item.image_urls) ? item.image_urls.filter(Boolean) : [];
  const images = imageUrls.length ? imageUrls : [item.image || item.image_url || ''].filter(Boolean);
  return Object.assign({}, item, {
    image_urls: images,
    image: item.image || item.image_url || images[0] || '',
  });
}

function withDiningStandardDefaults(item) {
  const dishes = Array.isArray(item.dishes) ? item.dishes : [];
  return Object.assign(withImageAlias(item), { dishes });
}

function asArray(items) {
  return Array.isArray(items) ? items : [];
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function normalizeItems(items) {
  return asArray(items).map(withImageAlias);
}

let cloudCatalogCache = null;

function buildMealCategories(items) {
  const map = {};
  asArray(items).forEach((item) => {
    if (!map[item.category_key]) {
      map[item.category_key] = {
        category_key: item.category_key,
        name: item.category_name,
        sort_order: item.category_sort_order,
      };
    }
  });
  return Object.keys(map).map((key) => map[key]).sort((a, b) => a.sort_order - b.sort_order);
}

function toSortTime(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sortActivities(rows) {
  return asArray(rows).slice().sort((left, right) => {
    const leftPinned = left.is_pinned === true ? 1 : 0;
    const rightPinned = right.is_pinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    const startDiff = toSortTime(left.start_at) - toSortTime(right.start_at);
    if (startDiff !== 0) return startDiff;
    return String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hans-CN');
  });
}

async function resolveCloudImages(groups, fields) {
  const normalizedGroups = asArray(groups).map((items) => asArray(items));
  if (!wx.cloud.getTempFileURL) return normalizedGroups;
  const fileIDs = [];
  normalizedGroups.forEach((items) => {
    items.forEach((item) => {
      fields.forEach((field) => {
        const values = Array.isArray(item[field]) ? item[field] : [item[field]];
        values.forEach((value) => {
          if (isCloudFile(value)) fileIDs.push(value);
        });
      });
    });
  });
  if (!fileIDs.length) return normalizedGroups;

  const tempResult = await wx.cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  const urlMap = {};
  asArray(tempResult.fileList).forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  return normalizedGroups.map((items) => items.map((item) => {
    const next = Object.assign({}, item);
    fields.forEach((field) => {
      if (Array.isArray(next[field])) {
        next[field] = next[field].map((value) => urlMap[value] || value);
        return;
      }
      if (urlMap[next[field]]) next[field] = urlMap[next[field]];
    });
    if (Array.isArray(next.image_urls) && next.image_urls.length) next.image = next.image_urls[0];
    if (next.image_url && !next.image) next.image = next.image_url;
    return next;
  }));
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

async function list(collectionName, where, orderFields = []) {
  let query = wx.cloud.database().collection(collectionName).where(Object.assign({ is_deleted: false }, where));
  orderFields.forEach(([field, direction]) => {
    query = query.orderBy(field, direction);
  });
  return getAll(query);
}

async function optionalList(collectionName, where, orderFields = []) {
  try {
    return await list(collectionName, where, orderFields);
  } catch (error) {
    const message = String(error.errMsg || error.message || '');
    if (message.includes('collection') && (message.includes('not exist') || message.includes('不存在'))) {
      return [];
    }
    throw error;
  }
}

async function getDatabaseCatalog() {
  const _ = wx.cloud.database().command;
  const [
    rawMealItems,
    rawDiningRooms,
    rawAccommodationRooms,
    rawDiningStandards,
    rawActivityBanners,
    rawActivityItems,
    memberLevels,
    memberLevelBenefits,
  ] = await Promise.all([
    list('meal_items', { is_available: true }, [['category_sort_order', 'asc'], ['sort_order', 'asc']]),
    list('dining_rooms', { is_available: true }, [['sort_order', 'asc']]),
    list('accommodation_rooms', { is_available: true }, [['sort_order', 'asc']]),
    list('dining_standards', { is_enabled: true }, [['sort_order', 'asc']]),
    optionalList('activity_banners', { is_enabled: true }, [['sort_order', 'asc']]),
    list('activity_items', { status: _.neq('closed') }, [['start_at', 'asc']]).then(sortActivities),
    list('member_levels', { is_enabled: true }, [['sort_order', 'asc']]),
    list('member_level_benefits', { is_enabled: true }, [['sort_order', 'asc']]),
  ]);

  const [
    mealItems,
    diningRooms,
    accommodationRooms,
    diningStandards,
    activityBanners,
    activityItems,
  ] = await resolveCloudImages([
    rawMealItems,
    rawDiningRooms,
    rawAccommodationRooms,
    rawDiningStandards,
    rawActivityBanners,
    rawActivityItems,
  ], ['image_url', 'image_urls', 'intro_images', 'highlight_images', 'video_url']);

  return {
    meal_categories: buildMealCategories(mealItems),
    meal_items: mealItems,
    dining_rooms: diningRooms,
    accommodation_rooms: accommodationRooms,
    dining_standards: diningStandards,
    activity_banners: activityBanners,
    activity_items: activityItems,
    member_levels: memberLevels,
    member_level_benefits: memberLevelBenefits,
  };
}

async function getCloudCatalog() {
  if (canUseCloudDatabase()) {
    try {
      if (!cloudCatalogCache) cloudCatalogCache = await getDatabaseCatalog();
      return cloudCatalogCache;
    } catch (error) {
      console.warn('database catalog fallback to cloud function', error);
      cloudCatalogCache = null;
    }
  }
  if (!canUseCloud()) return null;
  try {
    if (!cloudCatalogCache) cloudCatalogCache = await callCloud('catalogList');
    return cloudCatalogCache;
  } catch (error) {
    console.warn('catalogList failed', error);
    cloudCatalogCache = null;
    return null;
  }
}

async function listMealCategories() {
  const catalog = await getCloudCatalog();
  return catalog ? asArray(catalog.meal_categories) : [];
}
async function listMealItems() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.meal_items || []) : [];
}
async function listDiningRooms() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.dining_rooms || []) : [];
}
async function listAccommodationRooms() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.accommodation_rooms || []) : [];
}
async function listDiningStandards() {
  const catalog = await getCloudCatalog();
  const source = catalog ? catalog.dining_standards : [];
  return asArray(source).map(withDiningStandardDefaults);
}
async function listActivityItems() {
  const catalog = await getCloudCatalog();
  return catalog ? sortActivities(normalizeItems(catalog.activity_items || [])) : [];
}
async function listActivityBanners() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.activity_banners || []) : [];
}
async function listMemberLevels() {
  const catalog = await getCloudCatalog();
  return catalog ? asArray(catalog.member_levels) : [];
}
async function listMemberLevelBenefits() {
  const catalog = await getCloudCatalog();
  return catalog ? asArray(catalog.member_level_benefits) : [];
}

module.exports = {
  listMealCategories,
  listMealItems,
  listDiningRooms,
  listAccommodationRooms,
  listDiningStandards,
  listActivityBanners,
  listActivityItems,
  listMemberLevels,
  listMemberLevelBenefits,
  listMenuCategories: listMealCategories,
  listMenuItems: listMealItems,
  listRooms: async (type) => {
    const catalog = await getCloudCatalog();
    const allRooms = catalog ? [].concat(
      asArray(catalog.dining_rooms),
      asArray(catalog.accommodation_rooms)
    ) : [];
    return allRooms.filter((room) => !type || room.room_type === type);
  },
  listMealStandards: listDiningStandards,
};
