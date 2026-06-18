const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const collections = [
  'users',
  'members',
  'member_levels',
  'member_level_benefits',
  'member_benefit_accounts',
  'member_benefit_usage_records',
  'home_banners',
  'home_quick_entries',
  'home_feature_cards',
  'content_pages',
  'meal_items',
  'meal_tables',
  'meal_table_sessions',
  'meal_orders',
  'dining_rooms',
  'dining_standards',
  'dining_reservations',
  'accommodation_rooms',
  'accommodation_reservations',
  'activity_banners',
  'activity_items',
  'activity_signups',
  'financial_transactions',
  'operation_logs',
  'notification_subscriptions',
  'notification_logs',
  'system_settings',
];

const now = () => new Date();

const memberLevelRows = [
  { level_id: 'level_1', level_no: 1, level_name: '将星会员', stored_amount: 10000, points_granted: 12000, valid_months: 12, is_enabled: true, sort_order: 10 },
  { level_id: 'level_2', level_no: 2, level_name: '辰升会员', stored_amount: 20000, points_granted: 25000, valid_months: 16, is_enabled: true, sort_order: 20 },
  { level_id: 'level_3', level_no: 3, level_name: '海尊会员', stored_amount: 30000, points_granted: 37000, valid_months: 18, is_enabled: true, sort_order: 30 },
  { level_id: 'level_4', level_no: 4, level_name: '山王会员', stored_amount: 50000, points_granted: 62000, valid_months: 24, is_enabled: true, sort_order: 40 },
  { level_id: 'level_5', level_no: 5, level_name: '云境会员', stored_amount: 100000, points_granted: 125000, valid_months: 36, is_enabled: true, sort_order: 50 },
];

const memberBenefitTemplates = [
  { benefit_key: 'member_service', benefit_name: '山居资源圈与跨界活动', benefit_type: 'service', total_quota: null, quota_unit: '', description: '会员有效期内可参与山居资源圈与跨界活动。', show_on_card: true, applies_to: ['activity', 'service'], rule: {} },
  { benefit_key: 'free_accommodation', benefit_name: '免费住宿', benefit_type: 'quota', total_quota: 10, quota_unit: '次', description: '不限房型，仍需按入住日期确认房间可用性。', show_on_card: true, applies_to: ['accommodation'], rule: { room_scope: 'all' } },
  { benefit_key: 'monthly_member_event', benefit_name: '月度会员专题活动', benefit_type: 'service', total_quota: null, quota_unit: '', description: '会员有效期内可参与月度会员专题活动。', show_on_card: true, applies_to: ['activity'], rule: {} },
  { benefit_key: 'meditation_camp', benefit_name: '禅修营', benefit_type: 'quota', total_quota: 5, quota_unit: '人次', description: '每年 5 人次，按实际参与人数核销。', show_on_card: true, applies_to: ['activity'], rule: {} },
  { benefit_key: 'children_nature_course', benefit_name: '子女自然教育课程', benefit_type: 'quota', total_quota: 5, quota_unit: '人次', description: '每年 5 人次，按实际参与人数核销。', show_on_card: true, applies_to: ['activity'], rule: {} },
  { benefit_key: 'music_concert', benefit_name: '禅修营专题音乐会', benefit_type: 'quota', total_quota: 4, quota_unit: '次', description: '每年 4 次禅修营专题音乐会权益。', show_on_card: true, applies_to: ['activity'], rule: {} },
  { benefit_key: 'butler_service', benefit_name: '山居管家服务', benefit_type: 'service', total_quota: null, quota_unit: '', description: '会员有效期内享受山居管家咨询与接待协助。', show_on_card: true, applies_to: ['service'], rule: {} },
  { benefit_key: 'anniversary_decoration', benefit_name: '私人纪念日主题布置', benefit_type: 'quota', total_quota: 3, quota_unit: '次', description: '私人纪念日主题布置 3 次。', show_on_card: true, applies_to: ['service'], rule: {} },
  { benefit_key: 'tea_room', benefit_name: '茶室', benefit_type: 'quota', total_quota: 10, quota_unit: '次', description: '茶室使用 10 次，需提前预约确认。', show_on_card: true, applies_to: ['space'], rule: {} },
  { benefit_key: 'tea_bar', benefit_name: '茶酒吧', benefit_type: 'quota', total_quota: 10, quota_unit: '次', description: '茶酒吧使用 10 次，需提前预约确认。', show_on_card: true, applies_to: ['space'], rule: {} },
  { benefit_key: 'meeting_or_meditation_room', benefit_name: '多功能会议室或禅修室', benefit_type: 'quota', total_quota: 1, quota_unit: '次', description: '多功能会议室或禅修室使用 1 次，需提前预约确认。', show_on_card: true, applies_to: ['space'], rule: {} },
  { benefit_key: 'storage_service', benefit_name: '定制储藏服务', benefit_type: 'service', total_quota: null, quota_unit: '', description: '支持存茶、存雪茄、存酒等定制储藏服务，具体规则线下确认。', show_on_card: true, applies_to: ['service'], rule: {} },
  { benefit_key: 'nature_picking', benefit_name: '果园农场自然采摘', benefit_type: 'quota', total_quota: 20, quota_unit: '人次', description: '每年 20 人次，按实际参与人数核销。', show_on_card: true, applies_to: ['activity'], rule: {} },
];

function buildMemberLevelBenefits() {
  return memberLevelRows.flatMap((level, levelIndex) => memberBenefitTemplates.map((template, benefitIndex) => Object.assign({}, template, {
    level_benefit_id: `${level.level_id}_${template.benefit_key}`,
    level_id: level.level_id,
    is_enabled: true,
    sort_order: (levelIndex + 1) * 100 + (benefitIndex + 1) * 10,
  })));
}

const seedData = {
  home_banners: {
    key: 'banner_id',
    rows: [
      {
        banner_id: 'banner_1',
        image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/home/banners/轮播1.png',
        kicker: '停云山居',
        title: '停云待客\n茶饭皆有时',
        description: '青岛崂山 · 禅修、茶艺、美食与山居夜宿',
        link_type: 'none',
        link_target: '',
        sort_order: 10,
        is_enabled: true,
      },
      {
        banner_id: 'banner_2',
        image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/home/banners/轮播2.png',
        kicker: '山居夜景',
        title: '夜听松涛\n享受山居时光',
        description: '三五好友 · 月下酌酒 · 怡然自得',
        link_type: 'none',
        link_target: '',
        sort_order: 20,
        is_enabled: true,
      },
      {
        banner_id: 'banner_3',
        image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/home/banners/下午茶轮播.png',
        kicker: '时令餐食',
        title: '一盏清茶\n慢品山间时光',
        description: '围炉煮茶 · 茶艺体验 · 山居雅集',
        link_type: 'none',
        link_target: '',
        sort_order: 30,
        is_enabled: true,
      },
    ],
  },
  home_quick_entries: {
    key: 'entry_id',
    rows: [
      {
        entry_id: 'menu',
        icon: 'scan',
        title: '扫码点餐',
        description: '堂食下单 · 在线支付',
        action: 'menu',
        link_target: '',
        sort_order: 10,
        is_enabled: true,
      },
      {
        entry_id: 'booking',
        icon: 'calendar-event',
        title: '预约预订',
        description: '住宿用餐 · 提交确认',
        action: 'booking',
        link_target: '',
        tone: 'booking',
        sort_order: 20,
        is_enabled: true,
      },
    ],
  },
  home_feature_cards: {
    key: 'card_id',
    rows: [
      {
        card_id: 'intro',
        card_type: 'intro',
        image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/home/cards/山居介绍.png',
        title: '隐于崂山，归于自然',
        subtitle: '',
        action: 'intro',
        link_target: 'shanju_intro',
        sort_order: 10,
        is_enabled: true,
      },
      {
        card_id: 'activities',
        card_type: 'activity_entry',
        image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/home/cards/member-activity.png',
        title: '停云会员活动指南',
        subtitle: '',
        action: 'activities',
        link_target: '',
        sort_order: 20,
        is_enabled: true,
      },
    ],
  },
  content_pages: {
    key: 'page_id',
    rows: [
      {
        page_id: 'shanju_intro',
        page_type: 'intro',
        title: '停云山居',
        summary: '山里请，云上坐。崂山首创云端社交私享空间，融合山海之灵秀，缔造尊养雅境。',
        cover_image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/hero.webp',
        content_blocks: [
          { type: 'lead', text: '停云山居坐落于青岛崂山区，隐于崂山山脉之间。这里不止是一处场地，更是一套覆盖活动、宴请、住宿、禅养与私享服务的山居体验。' },
          { type: 'image', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/brand.webp' },
          { type: 'section_title', text: '我们能提供什么' },
          { type: 'paragraph', text: '比起单纯的空间租赁，停云山居更关注一场活动从筹备到落地的完整体验。我们提供多类型场地、全配套设施、自然氛围、会员资源与管家式服务，让主办方少操心，让来宾更投入。' },
          {
            type: 'feature_grid',
            items: [
              { title: '多类型场地', text: '适配沙龙、培训、路演、团建、宴请等不同场景。' },
              { title: '全配套设施', text: '会议区配备 LED 大屏、多媒体系统、茶饮设备与活动所需基础配置。' },
              { title: '自然氛围', text: '窗外是幽静山景，室内是简约雅致的空间，适合专注交流。' },
              { title: '管家服务', text: '从布置、设备调试到餐饮住宿安排，专属管家全程跟进。' },
            ],
          },
          { type: 'section_title', text: '两大空间，四位一体' },
          { type: 'image', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/spaces.webp' },
          {
            type: 'space_list',
            items: [
              { title: '会客区', text: '温馨放松，适合小型交流、茶叙与私享会谈。' },
              { title: '宴客区', text: '宽敞明亮，窗外山景入席，适合宴请与主题聚会。' },
              { title: '会议区', text: '配备高清 LED 大屏与多媒体会议系统，适合培训、路演与发布会。' },
              { title: '住宿区', text: '隐于山水之间，全明户型与观景落地窗，适合夜宿休整。' },
              { title: '团建区', text: '自然景观与户外休憩空间结合，承接疗愈互动与团建体验。' },
              { title: '存茶/存酒/雪茄区', text: '为会员提供定制化收藏、品鉴与私享社交空间。' },
            ],
          },
          { type: 'section_title', text: '适合哪些活动' },
          {
            type: 'list',
            items: [
              '行业主题沙龙、政策解读会、经验分享会',
              '企业内部培训、技能提升课程、员工团建活动',
              '创业项目路演、产品发布会、资源对接会',
              '高端客户答谢会、商务宴请、跨界交流派对',
              '其他追求品质体验、符合合规要求的活动',
            ],
          },
          { type: 'section_title', text: '为什么选择停云山居' },
          { type: 'paragraph', text: '我们深耕自然禅养与高端服务多年，这里不仅有专业场地与设备，也有自然疗愈、自然采摘、非遗体验等特色项目作为活动配套。' },
          { type: 'quote', text: '我们不止于场地，更是高品质体验的保障。' },
          { type: 'image', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/story.webp' },
          { type: 'contact', title: '欢迎咨询', text: '山里人私人管家：成龙\n电话：18253287888\n地址：青岛市崂山区停云山居', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/contact.webp' },
        ],
        page_status: 'published',
        is_active: true,
        activated_at: now(),
        activated_by: 'seed',
        published_at: now(),
      },
    ],
  },
  meal_items: {
    key: 'item_id',
    rows: [
      { item_id: 'tea', category_key: 'package', category_name: '套餐', category_sort_order: 1, item_type: 'package', name: '下午茶套餐', description: '山间茶席与时令茶点', specification: '1 套，含茶饮与时令茶点', details: [{ name: '崂山绿茶', quantity: '1 壶' }, { name: '时令水果', quantity: '1 盘' }, { name: '零食小吃', quantity: '1 盘' }], price: 38, member_price: null, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/下午茶套餐.png', sort_order: 1 },
      { item_id: 'chicken', category_key: 'package', category_name: '套餐', category_sort_order: 1, item_type: 'package', name: '停云·林鸡野趣套餐', description: '崂山散养鸡，山野本味', specification: '1 套，建议 2-3 人享用', details: [], price: 168, member_price: null, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 2 },
      { item_id: 'fish', category_key: 'package', category_name: '套餐', category_sort_order: 1, item_type: 'package', name: '停云·泉鱼隐逸套餐', description: '清泉鱼鲜，淡雅入味', specification: '1 套，建议 2-3 人享用', details: [], price: 198, member_price: null, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 3 },
      { item_id: 'double', category_key: 'package', category_name: '套餐', category_sort_order: 1, item_type: 'package', name: '停云双鲜·鱼跃鸡鸣套餐', description: '鱼鲜与林鸡的山居合席', specification: '1 套，建议 4-6 人享用', details: [], price: 318, member_price: null, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 4 },
      { item_id: 'cucumber', category_key: 'cold', category_name: '凉菜', category_sort_order: 2, item_type: 'single', name: '黄瓜拌', description: '脆脆的咸咸的', specification: '1 份', details: [], price: 28, member_price: 20, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 1 },
      { item_id: 'ginseng', category_key: 'hot', category_name: '热菜', category_sort_order: 3, item_type: 'single', name: '干煸崂山参', description: '真好吃啊', specification: '1 份', details: [], price: 48, member_price: 40, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 1 },
      { item_id: 'dumpling', category_key: 'staple', category_name: '主食', category_sort_order: 4, item_type: 'single', name: '海鲜水饺', description: '没毛病你就吃吧', specification: '1 份', details: [], price: 38, member_price: 30, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 1 },
      { item_id: 'wine', category_key: 'drink', category_name: '饮品', category_sort_order: 5, item_type: 'single', name: '桂花酒', description: '入口', specification: '1 壶', details: [], price: 38, member_price: 30, is_available: true, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/meal-items/炒鸡.png', sort_order: 1 },
    ],
  },
  meal_tables: {
    key: 'table_id',
    rows: [
      { table_id: 'A01', table_name: 'A01', table_area: '前露台', capacity: 4, sort_order: 10, table_status: 'enabled', qr_token: 'seed_a01', qr_version: 1, qr_scene: 't=A01&v=1&k=seed_a01', qr_image_file_id: '', current_session_id: '' },
      { table_id: 'A02', table_name: 'A02', table_area: '前露台', capacity: 4, sort_order: 20, table_status: 'enabled', qr_token: 'seed_a02', qr_version: 1, qr_scene: 't=A02&v=1&k=seed_a02', qr_image_file_id: '', current_session_id: '' },
      { table_id: 'B01', table_name: 'B01', table_area: '露台', capacity: 6, sort_order: 30, table_status: 'enabled', qr_token: 'seed_b01', qr_version: 1, qr_scene: 't=B01&v=1&k=seed_b01', qr_image_file_id: '', current_session_id: '' },
    ],
  },
  dining_rooms: {
    key: 'room_id',
    rows: [
      { room_id: 'xigu', name: '兮古', category: '标准包间', min_capacity: 6, max_capacity: 10, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/兮古.png', is_available: true, sort_order: 10 },
      { room_id: 'qilu', name: '栖鹿', category: '标准包间', min_capacity: 8, max_capacity: 12, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/兮古.png', is_available: true, sort_order: 20 },
      { room_id: 'mengtang', name: '梦堂', category: '会议包间', min_capacity: 8, max_capacity: 12, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/兮古.png', is_available: true, sort_order: 30 },
      { room_id: 'xinyu', name: '心语', category: 'KTV包间', min_capacity: 8, max_capacity: 12, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/兮古.png', is_available: true, sort_order: 40 },
    ],
  },
  accommodation_rooms: {
    key: 'room_id',
    rows: [
      { room_id: 'chunyue', name: '春悦', category: '亲子房', bed_type: '1.5m + 1.2m', min_capacity: 2, max_capacity: 3, regular_price: 600, member_price: 360, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 10 },
      { room_id: 'xiashe', name: '夏舍', category: '大床房', bed_type: '1.5m', min_capacity: 2, max_capacity: 2, regular_price: 500, member_price: 300, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 20 },
      { room_id: 'qiude', name: '秋得', category: '标准间', bed_type: '1.2m + 1.2m', min_capacity: 2, max_capacity: 2, regular_price: 500, member_price: 300, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 30 },
      { room_id: 'dongyu', name: '冬裕', category: '榻榻米房', bed_type: '5m 榻榻米', min_capacity: 3, max_capacity: 5, regular_price: 600, member_price: 360, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 40 },
      { room_id: 'gengyan', name: '耕烟', category: '套房', bed_type: '1.5m', min_capacity: 2, max_capacity: 4, regular_price: 600, member_price: 360, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 50 },
      { room_id: 'cangmiao', name: '苍妙', category: '榻榻米房', bed_type: '5m 榻榻米', min_capacity: 3, max_capacity: 5, regular_price: 600, member_price: 360, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 60 },
      { room_id: 'chancha', name: '禅茶四人房', category: '禅茶房', bed_type: '5m 榻榻米', min_capacity: 4, max_capacity: 4, regular_price: 500, member_price: 300, image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/rooms/春悦.jpg', is_available: true, sort_order: 70 },
    ],
  },
  dining_standards: {
    key: 'meal_standard_id',
    rows: [
      { meal_standard_id: 'group_meal', name: '团餐', price_per_person: 40, summary: '家常山居风味，荤素搭配，适合多人聚餐', dishes: [{ name: '凉菜', content: '时蔬凉菜 2 道' }, { name: '热菜', content: '山居热菜 6 道，荤素搭配' }, { name: '主食', content: '米饭、时令主食' }, { name: '汤品', content: '当日例汤 1 份' }], image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/dining-standards/餐标示例.png', is_enabled: true, sort_order: 10 },
      { meal_standard_id: 'yangyun', name: '养云', price_per_person: 168, summary: '时令山珍与特色菜品搭配，适合雅聚宴请', dishes: [{ name: '凉菜', content: '山野冷盘 4 道' }, { name: '热菜', content: '特色热菜 8 道，含鸡、鱼、时蔬' }, { name: '主食', content: '手作主食、米饭' }, { name: '汤品', content: '山菌炖汤 1 份' }, { name: '茶饮', content: '山居茶饮 1 份' }], image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/dining-standards/餐标示例.png', is_enabled: true, sort_order: 20 },
      { meal_standard_id: 'guiyun', name: '归云', price_per_person: 218, summary: '山海鲜味入席，菜品丰盛，适合重要聚会', dishes: [{ name: '凉菜', content: '精致冷盘 4 道' }, { name: '热菜', content: '山居招牌菜 8 道，含鱼、虾、禽肉' }, { name: '主食', content: '手作点心、米饭' }, { name: '汤品', content: '滋补炖汤 1 份' }, { name: '果盘', content: '时令水果拼盘 1 份' }], image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/dining-standards/餐标示例.png', is_enabled: true, sort_order: 30 },
      { meal_standard_id: 'tingyun', name: '停云', price_per_person: 318, summary: '山居宴席精选，讲究食材与摆盘，适合贵宾宴请', dishes: [{ name: '凉菜', content: '迎宾冷盘 6 道' }, { name: '热菜', content: '主厨精选菜 10 道，含山珍、河鲜与特色肉菜' }, { name: '主食', content: '手作点心、米饭' }, { name: '汤品', content: '主厨炖汤 1 份' }, { name: '果盘', content: '时令水果拼盘 1 份' }, { name: '茶饮', content: '山居茶饮 1 份' }], image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/dining-standards/餐标示例.png', is_enabled: true, sort_order: 40 },
    ],
  },
  activity_banners: {
    key: 'banner_id',
    rows: [
      {
        banner_id: 'activity_main',
        image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/home/cards/member-activity.png',
        kicker: 'TINGYUN ACTIVITIES',
        title: '山中有会，茶席相逢',
        sort_order: 10,
        is_enabled: true,
      },
    ],
  },
  activity_items: {
    key: 'activity_id',
    rows: [
      { activity_id: 'meditation', title: '禅修冥想体验课', subtitle: '专业导师带领，在山间安静半日。适合首次体验禅修的会员。', intro_text: '由专业导师带领，从基础呼吸练习开始，逐步进入适合初学者的静坐体验。\n\n课程中会安排舒展与自由交流时间，建议穿着宽松舒适的衣物。', intro_images: [], highlight_images: [], notice: '仅权益有效期内会员可报名，每位会员默认最多报名 2 人。超过人数请联系客服沟通。', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/activities/meditation-activity.jpg', video_url: '', date: '2026-06-15', time: '14:00-17:00', location: '停云山居 · 禅修室', start_at: new Date('2026-06-15T14:00:00+08:00'), end_at: new Date('2026-06-15T17:00:00+08:00'), signup_deadline: new Date('2026-06-13T18:00:00+08:00'), signup_scope: 'members_only', fee_type: 'free', member_fee_required: false, guest_price: 0, member_price: 0, capacity: 12, reserved_count: 6, status: 'open', status_tone: 'green', success_notice_remark: '报名已确认，请按时到场。', sort_order: 10 },
      { activity_id: 'tea', title: '山间茶艺品鉴会', subtitle: '品茶、听山、会友。循茶香辨风味，也在席间认识同好。', intro_text: '本次茶席以崂山春茶为引，带领会员认识不同茶汤的香气、温度与回甘。\n\n活动将保留自由交流时间，可携 1 位同行者参与。', intro_images: [], highlight_images: [], notice: '仅权益有效期内会员可报名，每位会员默认最多报名 2 人。超过人数请联系客服沟通。', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/activities/tea-activity.jpg', video_url: '', date: '2026-06-20', time: '16:00-18:00', location: '停云山居 · 茶空间', start_at: new Date('2026-06-20T16:00:00+08:00'), end_at: new Date('2026-06-20T18:00:00+08:00'), signup_deadline: new Date('2026-06-18T18:00:00+08:00'), signup_scope: 'members_only', fee_type: 'paid', member_fee_required: true, guest_price: 198, member_price: 128, capacity: 12, reserved_count: 8, status: 'open', status_tone: 'gold', success_notice_remark: '茶席名额已确认。', sort_order: 20 },
      { activity_id: 'music', title: '夏至山居音乐会', subtitle: '夜色与虫鸣之间，听一场山居限定的专题音乐会。', intro_text: '以夏至为题，邀请音乐人与山居来客共度一个有风、有茶、有旋律的夜晚。\n\n现场座位有限，请按报名人数入场。', intro_images: [], highlight_images: [], notice: '本场活动已满员。如需候补或咨询后续活动安排，请联系客服。', image_url: 'cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/activities/music-activity.jpg', video_url: '', date: '2026-06-28', time: '19:00-21:00', location: '停云山居 · 山景露台', start_at: new Date('2026-06-28T19:00:00+08:00'), end_at: new Date('2026-06-28T21:00:00+08:00'), signup_deadline: new Date('2026-06-26T18:00:00+08:00'), signup_scope: 'members_only', fee_type: 'paid', member_fee_required: true, guest_price: 0, member_price: 168, capacity: 16, reserved_count: 16, status: 'full', status_tone: 'disabled', success_notice_remark: '音乐会报名已确认。', sort_order: 30 },
    ],
  },
  member_levels: {
    key: 'level_id',
    rows: memberLevelRows,
  },
  member_level_benefits: {
    key: 'level_benefit_id',
    rows: buildMemberLevelBenefits(),
  },
  member_benefit_accounts: {
    key: 'benefit_account_id',
    rows: [],
  },
  system_settings: {
    key: 'setting_key',
    rows: [
      {
        setting_key: 'meal_order_status_flow',
        setting_name: '点餐订单状态流程',
        setting_type: 'meal_order',
        value: {
          order_statuses: ['pending_payment', 'preparing', 'completed'],
          guest_unpaid_order_status: 'pending_payment',
          paid_order_status: 'preparing',
          member_settlement_status: 'pending_offline_points',
          member_payment_status: 'pending_offline',
          active_statuses: ['preparing'],
          terminal_statuses: ['completed'],
          table_actions: ['move_table', 'complete_and_clear_table'],
          deprecated_fields: ['kitchen_status'],
          legacy_statuses: ['pending_notice', 'kitchen_notified'],
        },
        description: '点餐主状态使用 order_status：未支付、制作中、已完成；会员核算仅记录在 settlement_status/payment_status；kitchen_status 仅兼容旧数据。',
        is_enabled: true,
        sort_order: 10,
      },
    ],
  },
};

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
    return { name, created: true };
  } catch (error) {
    if (String(error.errMsg || error.message || '').includes('exist')) {
      return { name, created: false };
    }
    throw error;
  }
}

async function upsertRows(collectionName, key, rows) {
  const collection = db.collection(collectionName);
  const results = [];
  for (const row of rows) {
    const value = row[key];
    const existing = await collection.where({ [key]: value }).limit(1).get();
    const data = Object.assign({}, row, { updated_at: now(), is_deleted: false });
    if (existing.data.length) {
      await collection.doc(existing.data[0]._id).update({ data });
      results.push({ collection: collectionName, key: value, action: 'updated' });
    } else {
      await collection.add({ data: Object.assign({}, data, { created_at: now() }) });
      results.push({ collection: collectionName, key: value, action: 'created' });
    }
  }
  return results;
}

function assertAdmin(event) {
  const token = (event && event.token) || (event && event.adminToken);
  const expected = process.env.ADMIN_API_TOKEN || process.env.bannerAdmin;
  if (!expected || token !== expected) {
    const error = new Error('Permission denied');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
}

exports.main = async (event = {}) => {
  assertAdmin(event);

  const collectionResults = [];
  for (const name of collections) {
    collectionResults.push(await ensureCollection(name));
  }

  const seedResults = [];
  for (const [collectionName, config] of Object.entries(seedData)) {
    const results = await upsertRows(collectionName, config.key, config.rows);
    seedResults.push(...results);
  }

  return {
    ok: true,
    collections: collectionResults,
    seeds: seedResults,
  };
};
