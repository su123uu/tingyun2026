const auth = require('../../services/auth');
const table = require('../../services/table-session');
const cart = require('../../services/cart');
const orders = require('../../services/meal-order');
const notification = require('../../services/notification');
Page({
  data: {
    cart: { items: [], total_amount: 0, regular_total_amount: 0, member_total_amount: 0 },
    cartCount: 0,
    session: {},
    sessionLabel: '',
    tableArea: '',
    tableNo: '',
    identityInitial: '停',
    effectiveCustomerType: 'guest',
    memberLevel: '',
    memberLevelNo: '',
    user: {},
    remark: '',
    quickRemarks: [
      { text: '少辣', selected: false },
      { text: '不要香菜', selected: false },
      { text: '有儿童', selected: false },
      { text: '稍后上菜', selected: false },
    ],
    navTop: 28,
    navHeight: 32,
    submitting: false,
  },
  async onLoad() {
    this.setNavigationMetrics();
    const result = await Promise.all([table.getCurrentTableSession(), cart.getCart(), auth.getCurrentUser()]);
    const session = result[0] || {};
    const user = result[2] || {};
    const effectiveCustomerType = this.resolveCustomerType(session, user);
    this.setData({
      session,
      sessionLabel: this.formatSessionLabel(session),
      tableArea: session.table_area || '',
      tableNo: this.formatTableNo(session),
      identityInitial: this.formatIdentityInitial(effectiveCustomerType, session, user),
      effectiveCustomerType,
      memberLevel: session.member_level || user.member_level || '',
      memberLevelNo: session.member_level_no || user.member_level_no || '',
      cart: result[1],
      cartCount: result[1].items.reduce((sum, item) => sum + item.quantity, 0),
      user,
    });
  },
  formatSessionLabel(session) {
    if (!session) return '';
    const area = session.table_area ? `${session.table_area} · ` : '';
    return `${area}${this.formatTableNo(session)}`;
  },
  formatTableNo(session) {
    if (!session) return '';
    return session.table_id || String(session.table_name || '').replace(/\s*桌$/, '') || '桌台';
  },
  formatIdentityInitial(type, session = {}, user = {}) {
    if (type !== 'member') return '停';
    const name = user.nickname || user.customer_name || session.customer_name || '';
    return String(name).trim().charAt(0) || '会';
  },
  resolveCustomerType(session = {}, user = {}) {
    return user.customer_type === 'member'
      || Boolean(user.member_id)
      || session.customer_type === 'member'
      || Boolean(session.member_id)
      ? 'member'
      : 'guest';
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
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/menu/menu' }) }); },
  remarkInput(event) { this.setData({ remark: event.detail.value }); },
  toggleQuick(event) {
    const index = Number(event.currentTarget.dataset.index);
    const quickRemarks = this.data.quickRemarks.map((item, itemIndex) => (
      itemIndex === index ? Object.assign({}, item, { selected: !item.selected }) : item
    ));
    this.setData({ quickRemarks });
  },
  submit() {
    this.create();
  },
  async create() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const subscription = await notification.requestMealOrderStatus();
      const payload = {
        remark: this.data.remark,
        quick_remarks: this.data.quickRemarks.filter((item) => item.selected).map((item) => item.text),
        notification_subscriptions: subscription,
        customer_mobile: this.data.user.mobile || '',
        customer_name: this.data.user.nickname || this.data.user.customer_name || '',
        member_id: this.data.user.member_id || '',
        customer_type: this.data.effectiveCustomerType,
        member_level: this.data.memberLevel || '',
        member_level_no: this.data.memberLevelNo || '',
      };
      wx.showLoading({ title: '正在提交菜品...', mask: true });
      const order = await orders.createMealOrder(payload);
      const orderNo = order.order_no || order.order_id;
      wx.redirectTo({ url:`/pages/order-detail/order-detail?id=${orderNo}` });
    } catch(error) {
      wx.hideLoading();
      wx.showToast({ title:error.message, icon:'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
