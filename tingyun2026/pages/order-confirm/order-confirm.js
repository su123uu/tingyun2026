const auth = require('../../services/auth');
const cart = require('../../services/cart');
const table = require('../../services/table-session');
const orders = require('../../services/meal-order');
const notification = require('../../services/notification');
Page({
  data: {
    cart: { items: [], total_amount: 0 },
    cartCount: 0,
    session: {},
    sessionLabel: '',
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
    this.setData({
      session: result[0],
      sessionLabel: this.formatSessionLabel(result[0]),
      cart: result[1],
      cartCount: result[1].items.reduce((sum, item) => sum + item.quantity, 0),
      user: result[2],
    });
  },
  formatSessionLabel(session) {
    if (!session) return '';
    const area = session.table_area ? `${session.table_area} · ` : '';
    return `${area}${session.table_name || '桌台'}`;
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
    this.create(this.data.user.customer_type !== 'member');
  },
  async create(pay) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const subscription = await notification.requestMealOrderStatus();
      const order = await orders.createMealOrder({
        remark: this.data.remark,
        quick_remarks: this.data.quickRemarks.filter((item) => item.selected).map((item) => item.text),
        notification_subscriptions: subscription,
        keep_cart: pay,
      });
      const orderNo = order.order_no || order.order_id;
      if (pay) {
        const paymentResult = await orders.createMealPayment({ order_no: orderNo });
        const payment = paymentResult.payment || paymentResult.raw_payment || paymentResult;
        await new Promise((resolve, reject) => {
          wx.requestPayment(Object.assign({}, payment, {
            success: resolve,
            fail: (error) => {
              const message = error && error.errMsg && error.errMsg.includes('cancel')
                ? '支付已取消'
                : ((error && error.errMsg) || '微信支付失败');
              reject(new Error(message));
            },
          }));
        });
        await cart.clearCart();
      }
      wx.redirectTo({ url:`/pages/order-detail/order-detail?id=${order.detail_order_no || order.detail_order_id || orderNo}` });
    } catch(error) {
      wx.showToast({ title:error.message, icon:'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
