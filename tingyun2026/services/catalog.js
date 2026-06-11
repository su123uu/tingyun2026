const menu = require('../mock/menu');
const rooms = require('../mock/rooms').rooms;
const standards = require('../mock/meal-standards').standards;

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
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

function normalizeItems(items) {
  return asArray(items).map(withImageAlias);
}

let cloudCatalogCache = null;

async function getCloudCatalog() {
  if (!canUseCloud()) return null;
  try {
    if (!cloudCatalogCache) cloudCatalogCache = await callCloud('catalogList');
    return cloudCatalogCache;
  } catch (error) {
    console.warn('catalogList fallback to mock', error);
    cloudCatalogCache = null;
    return null;
  }
}

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

async function listMealCategories() {
  const catalog = await getCloudCatalog();
  return catalog ? asArray(catalog.meal_categories) : buildMealCategories(menu.items);
}
async function listMealItems() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.meal_items || []) : normalizeItems(menu.items);
}
async function listDiningRooms() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.dining_rooms || []) : normalizeItems(rooms.filter((room) => room.room_type === 'dining'));
}
async function listAccommodationRooms() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.accommodation_rooms || []) : normalizeItems(rooms.filter((room) => room.room_type === 'accommodation'));
}
async function listDiningStandards() {
  const catalog = await getCloudCatalog();
  const source = catalog ? catalog.dining_standards : standards;
  return asArray(source).map(withDiningStandardDefaults);
}
async function listActivityItems() {
  const catalog = await getCloudCatalog();
  return catalog ? normalizeItems(catalog.activity_items || []) : [];
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
  listActivityItems,
  listMemberLevels,
  listMemberLevelBenefits,
  listMenuCategories: listMealCategories,
  listMenuItems: listMealItems,
  listRooms: async (type) => rooms.filter((room) => !type || room.room_type === type),
  listMealStandards: listDiningStandards,
};
