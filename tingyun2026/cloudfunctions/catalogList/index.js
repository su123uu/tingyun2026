const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

function toSortTime(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sortActivities(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const leftPinned = left.is_pinned === true ? 1 : 0;
    const rightPinned = right.is_pinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    const startDiff = toSortTime(left.start_at) - toSortTime(right.start_at);
    if (startDiff !== 0) return startDiff;
    return String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hans-CN');
  });
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
    optionalList('activity_items', {}, [['start_at', 'asc']]).then((rows) => (
      sortActivities(rows.filter((row) => row.status !== 'closed'))
    )),
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
