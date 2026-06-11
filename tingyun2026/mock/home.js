const assets = require('../config/assets').assets;

const banners = [
  {
    banner_id: 'banner_1',
    image_url: assets.home.banner1,
    kicker: '停云山居',
    title: '停云待客\n茶饭皆有时',
    description: '青岛崂山 · 禅修、茶艺、美食与山居夜宿',
    is_enabled: true,
  },
  {
    banner_id: 'banner_2',
    image_url: assets.home.banner2,
    kicker: '山居夜景',
    title: '夜听松涛\n享受山居时光',
    description: '三五好友 · 月下酌酒 · 怡然自得',
    is_enabled: true,
  },
  {
    banner_id: 'banner_3',
    image_url: assets.home.teaBanner,
    kicker: '时令餐食',
    title: '一盏清茶\n慢品山间时光',
    description: '围炉煮茶 · 茶艺体验 · 山居雅集',
    is_enabled: true,
  },
];

const quick_entries = [
  { entry_id: 'menu', icon: 'scan', title: '扫码点餐', description: '堂食下单 · 在线支付', action: 'menu', is_enabled: true },
  { entry_id: 'booking', icon: 'calendar-event', title: '预约预订', description: '住宿用餐 · 提交确认', action: 'booking', tone: 'booking', is_enabled: true },
];

const feature_cards = [
  { card_id: 'intro', image_url: assets.home.introCard, title: '隐于崂山，归于自然', action: 'intro', is_enabled: true },
  { card_id: 'activities', image_url: assets.home.activityCard, title: '停云会员活动指南', action: 'activities', is_enabled: true },
];

module.exports = { banner_interval: 4200, banners, quick_entries, feature_cards };
