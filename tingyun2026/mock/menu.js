const categoryMeta = {
  package: { category_name: '套餐', category_sort_order: 1 },
  cold: { category_name: '凉菜', category_sort_order: 2 },
  hot: { category_name: '热菜', category_sort_order: 3 },
  staple: { category_name: '主食', category_sort_order: 4 },
  drink: { category_name: '饮品', category_sort_order: 5 },
};

const sampleImage = '/images/炒鸡.png';

function item(input) {
  return Object.assign({}, categoryMeta[input.category_key], input);
}

const items = [
  item({ item_id: 'tea', category_key: 'package', item_type: 'package', name: '下午茶套餐', description: '山间茶席与时令茶点', specification: '1 套，含茶饮与时令茶点', details: [{ name: '崂山绿茶', quantity: '1 壶' }, { name: '时令水果', quantity: '1 盘' }, { name: '零食小吃', quantity: '1 盘' }], price: 38, member_price: null, is_available: true, image: '/images/下午茶套餐.png', sort_order: 1 }),
  item({ item_id: 'chicken', category_key: 'package', item_type: 'package', name: '停云·林鸡野趣套餐', description: '崂山散养鸡，山野本味', specification: '1 套，建议 2-3 人享用', price: 168, member_price: null, is_available: true, image: sampleImage, sort_order: 2 }),
  item({ item_id: 'fish', category_key: 'package', item_type: 'package', name: '停云·泉鱼隐逸套餐', description: '清泉鱼鲜，淡雅入味', specification: '1 套，建议 2-3 人享用', price: 198, member_price: null, is_available: true, image: sampleImage, sort_order: 3 }),
  item({ item_id: 'double', category_key: 'package', item_type: 'package', name: '停云双鲜·鱼跃鸡鸣套餐', description: '鱼鲜与林鸡的山居合席', specification: '1 套，建议 4-6 人享用', price: 318, member_price: null, is_available: true, image: sampleImage, sort_order: 4 }),
  item({ item_id: 'cucumber', category_key: 'cold', item_type: 'single', name: '黄瓜拌', description: '脆脆的咸咸的', specification: '1 份', price: 28, member_price: 20, is_available: true, image: sampleImage, sort_order: 1 }),
  item({ item_id: 'ginseng', category_key: 'hot', item_type: 'single', name: '干煸崂山参', description: '真好吃啊', specification: '1 份', price: 48, member_price: 40, is_available: true, image: sampleImage, sort_order: 1 }),
  item({ item_id: 'dumpling', category_key: 'staple', item_type: 'single', name: '海鲜水饺', description: '没毛病你就吃吧', specification: '1 份', price: 38, member_price: 30, is_available: true, image: sampleImage, sort_order: 1 }),
  item({ item_id: 'wine', category_key: 'drink', item_type: 'single', name: '桂花酒', description: '入口', specification: '1 壶', price: 38, member_price: 30, is_available: true, image: sampleImage, sort_order: 1 }),
];

module.exports = { items };
