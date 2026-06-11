const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function listEnabled(collectionName) {
  const result = await db.collection(collectionName)
    .where({ is_enabled: true, is_deleted: false })
    .orderBy('sort_order', 'asc')
    .get();
  return Array.isArray(result.data) ? result.data : [];
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

async function resolveCloudImages(items, fields) {
  const rows = Array.isArray(items) ? items : [];
  const fileIDs = [];
  rows.forEach((item) => {
    fields.forEach((field) => {
      if (isCloudFile(item[field])) fileIDs.push(item[field]);
    });
  });
  if (!fileIDs.length) return rows;

  const tempResult = await cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  const urlMap = {};
  (Array.isArray(tempResult.fileList) ? tempResult.fileList : []).forEach((file) => {
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

exports.main = async () => {
  const [rawBanners, quickEntries, rawFeatureCards] = await Promise.all([
    listEnabled('home_banners'),
    listEnabled('home_quick_entries'),
    listEnabled('home_feature_cards'),
  ]);
  const [banners, featureCards] = await Promise.all([
    resolveCloudImages(rawBanners, ['image_url']),
    resolveCloudImages(rawFeatureCards, ['image_url']),
  ]);

  return {
    ok: true,
    data: {
      banner_interval: 4200,
      banners,
      quick_entries: quickEntries,
      feature_cards: featureCards,
    },
  };
};
