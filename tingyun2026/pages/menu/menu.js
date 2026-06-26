const catalog = require('../../services/catalog');
const cartService = require('../../services/cart');
const tableService = require('../../services/table-session');
const auth = require('../../services/auth');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCart(cart) {
  return cart && Array.isArray(cart.items)
    ? Object.assign({ total_amount: 0, regular_total_amount: cart.total_amount || 0, member_total_amount: cart.total_amount || 0 }, cart)
    : { items: [], total_amount: 0, regular_total_amount: 0, member_total_amount: 0 };
}

Page({
  data: {
    categories: [],
    active: 'package',
    items: [],
    cart: { items: [], total_amount: 0, regular_total_amount: 0, member_total_amount: 0 },
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
    showPhoneAuth: false,
    customerType: '',
    memberLevel: '',
    memberLevelNo: '',
    identityInitial: '\u505c',
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
  decodeText(value) {
    let text = String(value || '');
    for (let index = 0; index < 2; index += 1) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded === text) break;
        text = decoded;
      } catch (error) {
        break;
      }
    }
    return text;
  },
  extractTableScene(scanResult = {}) {
    const candidates = [scanResult.path, scanResult.result, scanResult.rawData]
      .filter(Boolean)
      .map((item) => this.decodeText(item));
    for (const value of candidates) {
      // 小程序码扫码结果可能是：
      // pages/menu/menu?scene=t=A01&k=token&v=1
      // 此处不能只取 scene 到第一个 &，否则会把 scene 内的 k 截断。
      const sceneIndex = value.search(/(?:^|[?&])scene=/);
      const scene = sceneIndex >= 0
        ? value.slice(value.indexOf('scene=', sceneIndex) + 'scene='.length)
        : value;
      const tableMatch = /(?:^|[?&])t=([^&#]+)/.exec(scene);
      const tokenMatch = /(?:^|[?&])k=([^&#]+)/.exec(scene);
      if (tableMatch && tokenMatch) {
        return `t=${encodeURIComponent(this.decodeText(tableMatch[1]))}&k=${encodeURIComponent(this.decodeText(tokenMatch[1]))}`;
      }
    }
    return '';
  },
  async scanTableCode() {
    try {
      const result = await new Promise((resolve, reject) => {
        wx.scanCode({
          onlyFromCamera: true,
          // 桌码由后台生成的是微信小程序码，不是普通方形二维码。
          // 不限制 scanType，交给微信客户端识别小程序码后从 res.path 里取 scene。
          success: resolve,
          fail: reject,
        });
      });
      const scene = this.extractTableScene(result);
      if (!scene) return this.toast('请扫描后台生成的桌台二维码');
      return this.handleQrScene({ scene });
    } catch (error) {
      this.toast(error.message || '扫码失败，请重试');
    }
  },
  async handleQrScene(options = {}) {
    const rawScene = this.extractTableScene({ result: options.scene });
    if (!rawScene) return;
    const tableMatch = /(?:^|&)t=([^&]+)/.exec(rawScene);
    const tokenMatch = /(?:^|&)k=([^&]+)/.exec(rawScene);
    try {
      const tableId = decodeURIComponent(tableMatch[1]);
      const qrToken = decodeURIComponent(tokenMatch[1]);
      const pendingTableCode = `t=${tableId}&k=${qrToken}`;
      const user = await auth.getCurrentUser();
      const activeSession = await tableService.getCurrentTableSessionByCode({ code: pendingTableCode });
      if (activeSession) {
        if (activeSession.active_order_no) {
          wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${activeSession.active_order_no}` });
          return;
        }
        const customerType = this.resolveCustomerType(activeSession, user);
        this.setData({
          pendingTableCode: '',
          session: activeSession,
          sessionLabel: this.formatSessionLabel(activeSession),
          showPeoplePicker: false,
          peopleCount: activeSession.people_count || 2,
          customerType,
          memberLevel: user.member_level || activeSession.member_level || '',
          memberLevelNo: user.member_level_no || activeSession.member_level_no || '',
          identityInitial: this.formatIdentityInitial(customerType, user.customer_type === 'member' ? user : activeSession),
        });
        return;
      }
      if (user.mobile) {
        // 宸叉湁鎵嬫満鍙凤紝鐩存帴寮逛汉鏁伴€夋嫨
        this.setData({
          pendingTableCode,
          session: null,
          sessionLabel: '',
          showPeoplePicker: true,
          peopleCount: 2,
          customerType: user.customer_type || 'guest',
          memberLevel: user.member_level || '',
          memberLevelNo: user.member_level_no || '',
          identityInitial: this.formatIdentityInitial(user.customer_type || 'guest', user),
        });
      } else {
        // 鏈巿鏉冩墜鏈哄彿锛屽厛寮规巿鏉冨脊绐?
        this.setData({
          pendingTableCode,
          session: null,
          sessionLabel: '',
          showPhoneAuth: true,
          showPeoplePicker: false,
          peopleCount: 2,
          customerType: 'guest',
          memberLevel: '',
          memberLevelNo: '',
          identityInitial: '\u505c',
        });
      }
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
      auth.getCurrentUser(),
    ]);
    const categories = asArray(result[0]);
    const items = asArray(result[1]);
    const cart = normalizeCart(result[2]);
    const session = this.data.pendingTableCode ? null : result[3];
    const user = result[4] || {};
    const customerType = this.resolveCustomerType(session || {}, user);
    this.allItems = items;
    this.setData({
      categories,
      cart,
      cartGroups: this.buildCartGroups(categories, cart),
      session,
      sessionLabel: this.formatSessionLabel(session),
      count: this.cartCount(cart),
      customerType,
      memberLevel: user.member_level || (session && session.member_level) || '',
      memberLevelNo: user.member_level_no || (session && session.member_level_no) || '',
      identityInitial: this.formatIdentityInitial(customerType, user.customer_type === 'member' ? user : (session || {})),
    });
    this.refresh();
  },
  formatSessionLabel(session) {
    if (!session) return '';
    const area = session.table_area ? session.table_area + ' · ' : '';
    const people = session.people_count ? ' · ' + session.people_count + ' 位' : '';
    return area + this.formatTableNo(session) + people;
  },
  formatTableNo(session) {
    if (!session) return '';
    return session.table_id || String(session.table_name || '').replace(/\s*妗?/, '') || '妗屽彴';
  },
  formatIdentityInitial(type, source = {}) {
    if (type !== 'member') return '\u505c';
    const name = source.nickname || source.customer_name || source.member_name || '';
    return String(name).trim().charAt(0) || '\u4f1a';
  },
  resolveCustomerType(session = {}, user = {}) {
    return user.customer_type === 'member'
      || Boolean(user.member_id)
      || session.customer_type === 'member'
      || Boolean(session.member_id)
      ? 'member'
      : 'guest';
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
  cancelPhoneAuth() {
    // 璺宠繃鎺堟潈锛屼互璁垮韬唤缁х画
    this.setData({ showPhoneAuth: false, customerType: 'guest', identityInitial: '\u505c' });
    // 鐩存帴寮逛汉鏁伴€夋嫨
    this.setData({ showPeoplePicker: true });
  },
  async onGetPhoneNumber(event) {
    const detail = event.detail;
    if (!detail.code) {
      this.toast('未完成手机号授权');
      return;
    }
    try {
      wx.showLoading({ title: '身份识别中' });
      const user = await auth.bindMobile({ phoneCode: detail.code });
      wx.hideLoading();
      this.setData({
        showPhoneAuth: false,
        customerType: user.customer_type || 'guest',
        memberLevel: user.member_level || '',
        memberLevelNo: user.member_level_no || '',
        identityInitial: this.formatIdentityInitial(user.customer_type || 'guest', user),
      });
      if (user.customer_type === 'member') {
        this.toast('会员识别成功 · ' + (user.member_level || ''), 'success');
      } else {
        this.toast('暂未匹配到会员，以访客身份继续');
      }
      // 鎺堟潈瀹屾垚鍚庡脊浜烘暟閫夋嫨
      this.setData({ showPeoplePicker: true });
    } catch (error) {
      wx.hideLoading();
      this.toast(error.message || '手机号授权失败');
    }
  },
  async confirmPeopleCount() {
    if (!this.data.pendingTableCode) return this.toast('请先扫描桌上的二维码');
    try {
      const input = { people_count: this.data.peopleCount };
      const user = await auth.getCurrentUser();
      const session = this.data.pendingTableCode === 'TEST_TABLE:A01'
        ? await tableService.startTableSessionForTest(Object.assign({}, input, { table_id: 'A01' }))
        : await tableService.startTableSession(Object.assign({}, input, { code: this.data.pendingTableCode }));
      const customerType = this.resolveCustomerType(session, user);
      this.setData({
        session,
        sessionLabel: this.formatSessionLabel(session),
        pendingTableCode: '',
        showPeoplePicker: false,
        customerType,
        memberLevel: user.member_level || session.member_level || this.data.memberLevel,
        memberLevelNo: user.member_level_no || session.member_level_no || this.data.memberLevelNo,
        identityInitial: this.formatIdentityInitial(customerType, user.customer_type === 'member' ? user : session),
      });
      this.toast('已识别 ' + this.formatSessionLabel(session), 'success');
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
  checkout() {
    if (!this.data.count) return this.toast('请先选择菜品');
    if (this.data.showPeoplePicker || this.data.pendingTableCode) return this.toast('请先确认用餐人数');
    if (!this.data.session) return this.toast('请先扫描桌上的二维码');
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm' });
  },
  toast(title, icon = 'none') { wx.showToast({ title, icon }); },
});
