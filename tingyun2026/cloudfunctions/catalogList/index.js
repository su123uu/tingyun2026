const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

async function resolveCloudImages(groups, fields) {
  const normalizedGroups = Array.isArray(groups) ? groups.map((items) => (Array.isArray(items) ? items : [])) : [];
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

  const tempResult = await cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  const urlMap = {};
  (Array.isArray(tempResult.fileList) ? tempResult.fileList : []).forEach((file) => {
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

async function list(collectionName, where, orderFields = []) {
  let query = db.collection(collectionName).where(Object.assign({ is_deleted: false }, where));
  orderFields.forEach(([field, direction]) => {
    query = query.orderBy(field, direction);
  });
  const result = await query.get();
  return Array.isArray(result.data) ? result.data : [];
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

function buildMealCategories(items) {
  const map = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
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

exports.main = async () => {
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
    list('activity_items', { status: _.neq('closed') }, [['start_at', 'asc']]),
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
  ], ['image_url', 'image_urls', 'video_url']);

  return {
    ok: true,
    data: {
      meal_categories: buildMealCategories(mealItems),
      meal_items: mealItems,
      dining_rooms: diningRooms,
      accommodation_rooms: accommodationRooms,
      dining_standards: diningStandards,
      activity_banners: activityBanners,
      activity_items: activityItems,
      member_levels: memberLevels,
      member_level_benefits: memberLevelBenefits,
    },
  };
};
