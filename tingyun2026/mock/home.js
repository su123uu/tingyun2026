const banners = [
  {
    banner_id: 'banner_1',
    image_url: '/images/轮播1.png',
    kicker: '停云山居',
    title: '停云待客\n茶饭皆有时',
    description: '青岛崂山 · 禅修、茶艺、美食与山居夜宿',
  },
  {
    banner_id: 'banner_2',
    image_url: '/images/轮播2.png',
    kicker: '山居夜景',
    title: '夜听松涛\n享受山居时光',
    description: '三五好友 · 月下酌酒 · 怡然自得',
  },
  {
    banner_id: 'banner_3',
    image_url: '/images/下午茶轮播.png',
    kicker: '时令餐食',
    title: '一盏清茶\n慢品山间时光',
    description: '围炉煮茶 · 茶艺体验 · 山居雅集',
  },
];

const quick_entries = [
  { entry_id: 'menu', icon: 'scan', title: '扫码点餐', description: '堂食下单 · 在线支付', action: 'menu' },
  { entry_id: 'booking', icon: 'calendar-event', title: '预约预订', description: '住宿用餐 · 提交确认', action: 'booking', tone: 'booking' },
];

const feature_cards = [
  { card_id: 'intro', image_url: '/images/山居介绍.png', title: '隐于崂山，归于自然', action: 'intro' },
  { card_id: 'activities', image_url: '/images/member-activity.png', title: '停云会员活动指南', action: 'activities' },
];

module.exports = { banner_interval: 4200, banners, quick_entries, feature_cards };
