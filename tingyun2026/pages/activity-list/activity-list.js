const service = require('../../services/activity-signup');
const assets = require('../../config/assets').assets;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

async function resolveCloudUrls(values) {
  const fileIDs = Array.from(new Set(asArray(values).filter(isCloudFile)));
  if (!fileIDs.length || !wx.cloud || !wx.cloud.getTempFileURL) return {};
  try {
    const result = await wx.cloud.getTempFileURL({ fileList: fileIDs });
    const map = {};
    asArray(result.fileList).forEach((file) => {
      if (file.status === 0 && file.tempFileURL) map[file.fileID] = file.tempFileURL;
    });
    return map;
  } catch (error) {
    console.warn('resolve activity list images failed', error);
    return {};
  }
}

function replaceCloudUrl(value, urlMap) {
  return urlMap[value] || value || '';
}

function decorateActivity(activity) {
  const canSignup = activity.can_signup !== undefined
    ? activity.can_signup
    : activity.remaining_capacity > 0;
  return Object.assign({}, activity, {
    subtitle: activity.subtitle || '',
    is_members_only: activity.signup_scope === 'members_only',
    status_text: canSignup ? `剩余 ${activity.remaining_capacity} 席` : '报名已结束',
    status_tone: canSignup ? 'green' : 'disabled',
  });
}

Page({
  data: {
    activities: [],
    banners: [],
    hasBanners: false,
    currentBanner: 0,
    heroImage: assets.activities.hero,
    heroKicker: 'TINGYUN ACTIVITIES',
    heroTitle: '山中有会，茶席相逢',
    navTop: 28,
    navHeight: 32,
  },
  onLoad() {
    this.setNavigationMetrics();
  },
  async onShow() {
    const [activities, banners] = await Promise.all([
      service.listActivities(),
      service.listActivityBanners(),
    ]);
    const bannerList = asArray(banners).filter((item) => item && item.image_url);
    const activityList = asArray(activities).map(decorateActivity);
    const fallbackHero = assets.activities.hero;
    const urlMap = await resolveCloudUrls([
      fallbackHero,
      ...bannerList.map((item) => item.image_url),
      ...activityList.map((item) => item.image_url),
    ]);
    // 如果有 banner 则使用轮播，否则保留默认 hero
    const hasBanners = bannerList.length > 0;
    this.setData({
      activities: activityList.map((item) => Object.assign({}, item, {
        image_url: replaceCloudUrl(item.image_url, urlMap),
      })),
      banners: bannerList.map((item) => Object.assign({}, item, {
        image_url: replaceCloudUrl(item.image_url, urlMap),
      })),
      hasBanners,
      currentBanner: 0,
      heroImage: hasBanners ? '' : replaceCloudUrl(fallbackHero, urlMap),
      heroKicker: 'TINGYUN ACTIVITIES',
      heroTitle: '山中有会，茶席相逢',
    });
  },
  setNavigationMetrics() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let navTop = (windowInfo.statusBarHeight || 20) + 6;
    let navHeight = 32;
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      if (capsule && capsule.top && capsule.height) {
        navTop = capsule.top;
        navHeight = capsule.height;
      }
    } catch (error) {}
    this.setData({ navTop, navHeight });
  },
  goBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/home' }) });
  },
  onBannerChange(e) {
    this.setData({ currentBanner: e.detail.current });
  },
  detail(event) {
    wx.navigateTo({ url: `/pages/activity/activity?id=${event.currentTarget.dataset.id}` });
  },
});
