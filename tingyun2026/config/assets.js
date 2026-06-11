const CLOUD_PREFIX = 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055';

function cloudAsset(path) {
  return `${CLOUD_PREFIX}/${path}`;
}

const assets = {
  home: {
    banner1: cloudAsset('home/banners/轮播1.png'),
    banner2: cloudAsset('home/banners/轮播2.png'),
    teaBanner: cloudAsset('home/banners/下午茶轮播.png'),
    introCard: cloudAsset('home/cards/山居介绍.png'),
    activityCard: cloudAsset('home/cards/member-activity.png'),
  },
  content: {
    introCover: cloudAsset('content-pages/山居介绍.png'),
  },
  meal: {
    teaSet: cloudAsset('meal-items/下午茶套餐.png'),
    sample: cloudAsset('meal-items/炒鸡.png'),
  },
  rooms: {
    dining: cloudAsset('rooms/兮古.png'),
    accommodation: cloudAsset('rooms/春悦.jpg'),
  },
  diningStandards: {
    sample: cloudAsset('dining-standards/餐标示例.png'),
  },
  activities: {
    hero: cloudAsset('home/cards/member-activity.png'),
    meditation: cloudAsset('activities/meditation-activity.jpg'),
    tea: cloudAsset('activities/tea-activity.jpg'),
    music: cloudAsset('activities/music-activity.jpg'),
  },
  intro: {
    cover: cloudAsset('shared/轮播3.png'),
    tea: cloudAsset('shared/tea.jpg'),
    dinner: cloudAsset('shared/dinner.jpg'),
    meditation: cloudAsset('shared/meditation.jpg'),
  },
};

module.exports = { CLOUD_PREFIX, cloudAsset, assets };
