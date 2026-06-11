const home = require('../mock/home');

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
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

function getMockHomeContent() {
  return normalizeHomeContent({
    banner_interval: home.banner_interval,
    banners: home.banners,
    quick_entries: home.quick_entries,
    feature_cards: home.feature_cards,
  });
}

async function getHomeContent() {
  if (canUseCloud()) {
    try {
      return normalizeHomeContent(await callCloud('homeContentGet'));
    } catch (error) {
      console.warn('homeContentGet fallback to mock', error);
    }
  }
  return getMockHomeContent();
}

async function getContentPage(input) {
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
