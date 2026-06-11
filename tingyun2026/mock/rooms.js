const assets = require('../config/assets').assets;

const rooms = [
  { room_id: 'chunyue', room_type: 'accommodation', name: '春悦', category: '亲子房', min_capacity: 2, max_capacity: 3, regular_price: 600, member_price: 360, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'xiashe', room_type: 'accommodation', name: '夏舍', category: '大床房', min_capacity: 2, max_capacity: 2, regular_price: 500, member_price: 300, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'qiude', room_type: 'accommodation', name: '秋得', category: '标准间', min_capacity: 2, max_capacity: 2, regular_price: 500, member_price: 300, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'dongyu', room_type: 'accommodation', name: '冬裕', category: '榻榻米房', min_capacity: 3, max_capacity: 5, regular_price: 600, member_price: 360, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'gengyan', room_type: 'accommodation', name: '耕烟', category: '套房', min_capacity: 2, max_capacity: 4, regular_price: 600, member_price: 360, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'cangmiao', room_type: 'accommodation', name: '苍妙', category: '榻榻米房', min_capacity: 3, max_capacity: 5, regular_price: 600, member_price: 360, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'chancha', room_type: 'accommodation', name: '禅茶四人房', category: '禅茶房', min_capacity: 4, max_capacity: 4, regular_price: 500, member_price: 300, image_url: assets.rooms.accommodation, is_available: true },
  { room_id: 'xigu', room_type: 'dining', name: '兮古', category: '标准包间', min_capacity: 6, max_capacity: 10, image_url: assets.rooms.dining, is_available: true },
  { room_id: 'qilu', room_type: 'dining', name: '栖鹿', category: '标准包间', min_capacity: 8, max_capacity: 12, image_url: assets.rooms.dining, is_available: true },
  { room_id: 'mengtang', room_type: 'dining', name: '梦堂', category: '会议包间', min_capacity: 8, max_capacity: 12, image_url: assets.rooms.dining, is_available: true },
  { room_id: 'xinyu', room_type: 'dining', name: '心语', category: 'KTV包间', min_capacity: 8, max_capacity: 12, image_url: assets.rooms.dining, is_available: true },
];

module.exports = { rooms };
