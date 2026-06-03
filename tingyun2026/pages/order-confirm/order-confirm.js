const auth = require('../../services/auth');
const cart = require('../../services/cart');
const table = require('../../services/table-session');
const orders = require('../../services/meal-order');
Page({
  data: {
    cart: { items: [], total_amount: 0 },
    cartCount: 0,
    session: {},
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
  },
  async onLoad() {
    this.setNavigationMetrics();
    const result = await Promise.all([table.getCurrentTableSession(), cart.getCart(), auth.getCurrentUser()]);
    this.setData({
      session: result[0],
      cart: result[1],
      cartCount: result[1].items.reduce((sum, item) => sum + item.quantity, 0),
      user: result[2],
    });
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
    if (this.data.user.customer_type === 'member') return this.create(false);
    wx.showModal({ title:'模拟微信支付', content:`本次支付 ¥${this.data.cart.total_amount}，不会真实扣款。`, confirmText:'模拟支付', success:(result) => { if (result.confirm) this.create(true); } });
  },
  async create(pay) {
    try {
      const order = await orders.createMealOrder({
        remark: this.data.remark,
        quick_remarks: this.data.quickRemarks.filter((item) => item.selected).map((item) => item.text),
      });
      const orderNo = order.order_no || order.order_id;
      if (pay) await orders.simulateWechatPay({ order_no: orderNo });
      wx.redirectTo({ url:`/pages/order-detail/order-detail?id=${order.detail_order_no || order.detail_order_id || orderNo}` });
    } catch(error) {
      wx.showToast({ title:error.message, icon:'none' });
    }
  },
});
