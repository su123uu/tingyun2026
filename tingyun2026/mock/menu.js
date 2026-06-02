const categories = [
  { category_id: 'package', name: '套餐' },
  { category_id: 'cold', name: '凉菜' },
  { category_id: 'hot', name: '热菜' },
  { category_id: 'staple', name: '主食' },
  { category_id: 'drink', name: '饮品' },
];

const sampleImage = '/images/炒鸡.png';

const items = [
  { item_id: 'tea', category_id: 'package', name: '下午茶套餐', description: '山间茶席与时令茶点', specification: '1 套，含茶饮与时令茶点', details: [{ name: '崂山绿茶', quantity: '1 壶' }, { name: '时令水果', quantity: '1 盘' }, { name: '零食小吃', quantity: '1 盘' }], price: 38, member_price: null, is_available: true, image: '/images/下午茶套餐.png' },
  { item_id: 'chicken', category_id: 'package', name: '停云·林鸡野趣套餐', description: '崂山散养鸡，山野本味', specification: '1 套，建议 2-3 人享用', price: 168, member_price: null, is_available: true, image: sampleImage },
  { item_id: 'fish', category_id: 'package', name: '停云·泉鱼隐逸套餐', description: '清泉鱼鲜，淡雅入味', specification: '1 套，建议 2-3 人享用', price: 198, member_price: null, is_available: true, image: sampleImage },
  { item_id: 'double', category_id: 'package', name: '停云双鲜·鱼跃鸡鸣套餐', description: '鱼鲜与林鸡的山居合席', specification: '1 套，建议 4-6 人享用', price: 318, member_price: null, is_available: true, image: sampleImage },
  { item_id: 'cucumber', category_id: 'cold', name: '黄瓜拌', description: '脆脆的咸咸的', specification: '1 份', price: 28, member_price: 20, is_available: true, image: sampleImage },
  { item_id: 'ginseng', category_id: 'hot', name: '干煸崂山参', description: '真好吃啊', specification: '1 份', price: 48, member_price: 40, is_available: true, image: sampleImage },
  { item_id: 'dumpling', category_id: 'staple', name: '海鲜水饺', description: '没毛病你就吃吧', specification: '1 份', price: 38, member_price: 30, is_available: true, image: sampleImage },
  { item_id: 'wine', category_id: 'drink', name: '桂花酒', description: '入口', specification: '1 壶', price: 38, member_price: 30, is_available: true, image: sampleImage },
];
module.exports = { categories, items };
