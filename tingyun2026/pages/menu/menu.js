const catalog = require('../../services/catalog');
const cartService = require('../../services/cart');
const tableService = require('../../services/table-session');

Page({
  data: { categories: [], active: 'package', items: [], cart: { items: [], total_amount: 0 }, cartGroups: [], count: 0, session: null, showCart: false, showDishDetail: false, selectedItem: null, selectedQuantity: 0, navTop: 28, navHeight: 32 },
  onLoad() { this.setNavigationMetrics(); },
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
  async onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 1 });
    const result = await Promise.all([
      catalog.listMealCategories(), catalog.listMealItems(), cartService.getCart(), tableService.getCurrentTableSession(),
    ]);
    const categories = result[0];
    const items = result[1];
    const cart = result[2];
    const session = result[3];
    this.allItems = items;
    this.setData({ categories, cart, cartGroups: this.buildCartGroups(categories, cart), session, count: this.cartCount(cart) });
    this.refresh();
  },
  cartCount(cart) { return cart.items.reduce((sum, item) => sum + item.quantity, 0); },
  quantity(id) { const item = this.data.cart.items.find((entry) => entry.item_id === id); return item ? item.quantity : 0; },
  refresh() { this.setData({ items: this.allItems.filter((item) => item.category_key === this.data.active).map((item) => Object.assign({}, item, { quantity: this.quantity(item.item_id) })) }); },
  selectCategory(e) { this.setData({ active: e.currentTarget.dataset.id }); this.refresh(); },
  async add(e) { try { this.updateCart(await cartService.addItem({ item_id: e.currentTarget.dataset.id })); } catch (error) { this.toast(error.message); } },
  async minus(e) { const id = e.currentTarget.dataset.id; const quantity = this.quantity(id); if (quantity) this.updateCart(await cartService.updateQuantity({ item_id: id, quantity: quantity - 1 })); },
  updateCart(cart) {
    const count = this.cartCount(cart);
    const selectedQuantity = this.data.selectedItem ? this.cartItemQuantity(cart, this.data.selectedItem.item_id) : 0;
    this.setData({ cart, cartGroups: this.buildCartGroups(this.data.categories, cart), count, selectedQuantity, showCart: count ? this.data.showCart : false });
    this.refresh();
  },
  showCart() {
    if (!this.data.count) return this.toast('购物车还是空的');
    this.setData({ showCart: true });
  },
  hideCart() { this.setData({ showCart: false }); },
  showDishDetail(e) {
    const selectedItem = this.allItems.find((item) => item.item_id === e.currentTarget.dataset.id);
    if (selectedItem) this.setData({ selectedItem, selectedQuantity: this.quantity(selectedItem.item_id), showDishDetail: true });
  },
  hideDishDetail() { this.setData({ showDishDetail: false, selectedItem: null, selectedQuantity: 0 }); },
  previewDishImage() {
    const image = this.data.selectedItem && this.data.selectedItem.image;
    if (!image) return;
    wx.getImageInfo({
      src: image,
      success: (result) => wx.previewImage({ current: result.path, urls: [result.path] }),
      fail: () => this.toast('图片预览失败，请稍后重试'),
    });
  },
  cartItemQuantity(cart, id) { const item = cart.items.find((entry) => entry.item_id === id); return item ? item.quantity : 0; },
  buildCartGroups(categories, cart) {
    return categories.map((category) => ({
      category_key: category.category_key,
      name: category.name,
      items: cart.items.filter((item) => item.category_key === category.category_key),
    })).filter((category) => category.items.length);
  },
  stop() {},
  simulateScan() {
    wx.showModal({ title: '模拟扫码', content: '使用测试桌码 A01，按 2 位用餐建立桌台会话。', confirmText: '开始点餐', success: async (result) => {
      if (!result.confirm) return;
      const session = await tableService.startTableSession({ code: 'TY_TABLE:A01', people_count: 2 });
      this.setData({ session }); this.toast('已识别桌号 A01', 'success');
    } });
  },
  checkout() {
    if (!this.data.count) return this.toast('请先选择菜品');
    if (!this.data.session) return this.toast('请先扫描桌上二维码');
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm' });
  },
  toast(title, icon = 'none') { wx.showToast({ title, icon }); },
});
