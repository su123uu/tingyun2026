const storage = require('../utils/storage');
const items = require('../mock/menu').items;
const assert = require('../utils/validators').assert;
const cartTotal = require('../utils/pricing').cartTotal;

const KEY = 'cart';
const build = (cartItems) => ({ items: cartItems, total_amount: cartTotal(cartItems) });

function withMenuMetadata(cartItems) {
  return cartItems.map((entry) => {
    const item = items.find((menuItem) => menuItem.item_id === entry.item_id);
    return Object.assign({}, entry, {
      image: entry.image || (item && item.image) || '',
      category_id: entry.category_id || (item && item.category_id) || '',
    });
  });
}

function getMenuItem(id) {
  const item = items.find((entry) => entry.item_id === id);
  assert(item && item.is_available, 'ITEM_NOT_AVAILABLE', '该菜品暂不可售');
  return item;
}

async function getCart() {
  const cart = storage.get(KEY, build([]));
  return build(withMenuMetadata(cart.items));
}

async function addItem(input) {
  const item_id = input.item_id;
  const item = getMenuItem(item_id);
  const cart = await getCart();
  const found = cart.items.find((entry) => entry.item_id === item_id);
  if (found) found.quantity += 1;
  else cart.items.push({ item_id, category_id: item.category_id, name: item.name, price: item.price, image: item.image, quantity: 1 });
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
