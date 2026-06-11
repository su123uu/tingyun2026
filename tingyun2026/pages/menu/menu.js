const catalog = require('../../services/catalog');
const cartService = require('../../services/cart');
const tableService = require('../../services/table-session');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCart(cart) {
  return cart && Array.isArray(cart.items) ? cart : { items: [], total_amount: 0 };
}

Page({
  data: {
    categories: [],
    active: 'package',
    items: [],
    cart: { items: [], total_amount: 0 },
    cartGroups: [],
    count: 0,
    session: null,
    sessionLabel: '',
    pendingTableCode: '',
    showPeoplePicker: false,
    peopleCount: 2,
    showCart: false,
    showDishDetail: false,
    selectedItem: null,
    selectedQuantity: 0,
    navTop: 28,
    navHeight: 32,
  },
  onLoad(options = {}) {
    this.setNavigationMetrics();
    this.handleQrScene(options);
  },
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
  async handleQrScene(options = {}) {
    const rawScene = options.scene ? decodeURIComponent(options.scene) : '';
    const tableMatch = /(?:^|&)t=([^&]+)/.exec(rawScene);
    const tokenMatch = /(?:^|&)k=([^&]+)/.exec(rawScene);
    if (!tableMatch || !tokenMatch) return;
    try {
      const tableId = decodeURIComponent(tableMatch[1]);
      const qrToken = decodeURIComponent(tokenMatch[1]);
      this.setData({
        pendingTableCode: `t=${tableId}&k=${qrToken}`,
        session: null,
        sessionLabel: '',
        showPeoplePicker: true,
        peopleCount: 2,
      });
    } catch (error) {
      this.toast(error.message || '桌台码识别失败');
    }
  },
  async onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 1 });
    const result = await Promise.all([
      catalog.listMealCategories(),
      catalog.listMealItems(),
      cartService.getCart(),
      tableService.getCurrentTableSession(),
    ]);
    const categories = asArray(result[0]);
    const items = asArray(result[1]);
    const cart = normalizeCart(result[2]);
    const session = this.data.pendingTableCode ? null : result[3];
    this.allItems = items;
    this.setData({
      categories,
      cart,
      cartGroups: this.buildCartGroups(categories, cart),
      session,
      sessionLabel: this.formatSessionLabel(session),
      count: this.cartCount(cart),
    });
    this.refresh();
  },
  formatSessionLabel(session) {
    if (!session) return '';
    const area = session.table_area ? `${session.table_area} · ` : '';
    return `${area}${session.table_name || '桌台'}`;
  },
  increasePeople() {
    this.setData({ peopleCount: Math.min(20, this.data.peopleCount + 1) });
  },
  decreasePeople() {
    this.setData({ peopleCount: Math.max(1, this.data.peopleCount - 1) });
  },
  peopleInput(event) {
    const value = Math.max(1, Math.min(20, Math.floor(Number(event.detail.value) || 1)));
    this.setData({ peopleCount: value });
  },
  cancelPeoplePicker() {
    this.setData({ showPeoplePicker: false, pendingTableCode: '' });
  },
  async confirmPeopleCount() {
    if (!this.data.pendingTableCode) return this.toast('请先扫描桌上的二维码');
    try {
      const session = await tableService.startTableSession({
        code: this.data.pendingTableCode,
        people_count: this.data.peopleCount,
      });
      this.setData({
        session,
        sessionLabel: this.formatSessionLabel(session),
        pendingTableCode: '',
        showPeoplePicker: false,
      });
      this.toast(`已识别 ${this.formatSessionLabel(session)}`, 'success');
    } catch (error) {
      this.toast(error.message || '桌台码识别失败');
    }
  },
  cartCount(cart) { return normalizeCart(cart).items.reduce((sum, item) => sum + item.quantity, 0); },
  quantity(id) {
    const item = this.data.cart.items.find((entry) => entry.item_id === id);
    return item ? item.quantity : 0;
  },
  refresh() {
    this.setData({
      items: asArray(this.allItems)
        .filter((item) => item.category_key === this.data.active)
        .map((item) => Object.assign({}, item, { quantity: this.quantity(item.item_id) })),
    });
  },
  selectCategory(e) {
    this.setData({ active: e.currentTarget.dataset.id });
    this.refresh();
  },
  async add(e) {
    try {
      this.updateCart(await cartService.addItem({ item_id: e.currentTarget.dataset.id }));
    } catch (error) {
      this.toast(error.message);
    }
  },
  async minus(e) {
    const id = e.currentTarget.dataset.id;
    const quantity = this.quantity(id);
    if (quantity) this.updateCart(await cartService.updateQuantity({ item_id: id, quantity: quantity - 1 }));
  },
  updateCart(cart) {
    const nextCart = normalizeCart(cart);
    const count = this.cartCount(nextCart);
    const selectedQuantity = this.data.selectedItem ? this.cartItemQuantity(nextCart, this.data.selectedItem.item_id) : 0;
    this.setData({ cart: nextCart, cartGroups: this.buildCartGroups(this.data.categories, nextCart), count, selectedQuantity, showCart: count ? this.data.showCart : false });
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
  cartItemQuantity(cart, id) {
    const item = normalizeCart(cart).items.find((entry) => entry.item_id === id);
    return item ? item.quantity : 0;
  },
  buildCartGroups(categories, cart) {
    const nextCart = normalizeCart(cart);
    return asArray(categories).map((category) => ({
      category_key: category.category_key,
      name: category.name,
      items: nextCart.items.filter((item) => item.category_key === category.category_key),
    })).filter((category) => category.items.length);
  },
  stop() {},
  simulateScan() {
    wx.showModal({
      title: '请扫描桌码',
      content: '真实点餐只接受后台生成的新桌码。请在后台“桌台”里生成小程序码后扫码测试。',
      showCancel: false,
    });
  },
  checkout() {
    if (!this.data.count) return this.toast('请先选择菜品');
    if (this.data.showPeoplePicker || this.data.pendingTableCode) return this.toast('请先确认用餐人数');
    if (!this.data.session) return this.toast('请先扫描桌上的二维码');
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm' });
  },
  toast(title, icon = 'none') { wx.showToast({ title, icon }); },
});
