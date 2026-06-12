const storage = require('../utils/storage');
const catalog = require('./catalog');
const assert = require('../utils/validators').assert;
const cartTotal = require('../utils/pricing').cartTotal;

const KEY = 'cart';
const asArray = (value) => (Array.isArray(value) ? value : []);
const build = (cartItems) => {
  const items = asArray(cartItems);
  return { items, total_amount: cartTotal(items) };
};

async function getMenuItems() {
  const items = await catalog.listMealItems();
  return asArray(items);
}

async function withMenuMetadata(cartItems) {
  const items = await getMenuItems();
  return asArray(cartItems).map((entry) => {
    const item = items.find((menuItem) => menuItem.item_id === entry.item_id);
    return Object.assign({}, entry, {
      image: entry.image || (item && (item.image || item.image_url)) || '',
      category_key: entry.category_key || (item && item.category_key) || '',
      member_price: item ? item.member_price : entry.member_price,
    });
  });
}

async function getMenuItem(id) {
  const items = await getMenuItems();
  const item = items.find((entry) => entry.item_id === id);
  assert(item && item.is_available, 'ITEM_NOT_AVAILABLE', '该菜品暂不可售');
  return item;
}

async function getCart() {
  const cart = storage.get(KEY, build([]));
  return build(await withMenuMetadata(cart && cart.items));
}

async function addItem(input) {
  const item_id = input.item_id;
  const item = await getMenuItem(item_id);
  const cart = await getCart();
  const found = cart.items.find((entry) => entry.item_id === item_id);
  if (found) found.quantity += 1;
  else cart.items.push({ item_id, category_key: item.category_key, name: item.name, price: item.price, member_price: item.member_price, image: item.image || item.image_url, quantity: 1 });
  return storage.set(KEY, build(cart.items));
}

async function updateQuantity(input) {
  const item_id = input.item_id;
  const quantity = input.quantity;
  const cart = await getCart();
  const items = cart.items.filter((entry) => entry.item_id !== item_id);
  if (quantity > 0) {
    const original = cart.items.find((entry) => entry.item_id === item_id);
    assert(original, 'ITEM_NOT_IN_CART', '购物车中没有该菜品');
    items.push(Object.assign({}, original, { quantity }));
  }
  return storage.set(KEY, build(items));
}

async function clearCart() { return storage.set(KEY, build([])); }

module.exports = { getCart, addItem, updateQuantity, clearCart };
