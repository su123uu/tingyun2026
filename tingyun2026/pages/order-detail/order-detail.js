const orders = require('../../services/meal-order');

const kitchen = {
  pending_notice: { text: '正在通知厨房', desc: '订单已提交，正在通知厨房，请稍候。' },
  kitchen_notified: { text: '厨房已接单', desc: '厨房已接单，正在为您准备餐品。' },
  preparing: { text: '制作中', desc: '厨房正在制作餐品，请耐心等候。' },
  completed: { text: '已完成', desc: '餐品已完成，请留意上菜。' },
};

const settlement = {
  pending_wechat_pay: '待微信支付',
  pending_offline_points: '待线下会员账户核对',
  settled: '已结清',
};

const kitchenProgress = {
  pending_notice: 1,
  kitchen_notified: 2,
  preparing: 3,
  completed: 4,
};

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function remarkText(order) {
  return [order.remark].concat(order.quick_remarks || []).filter(Boolean).join('，') || '无';
}

function buildSteps(order) {
  const progress = kitchenProgress[order.kitchen_status] || 0;
  return [
    { text: order.customer_type === 'member' ? '订单已提交，待线下会员账户核对' : '支付成功，正在通知厨房', done: progress >= 1 },
    { text: '已通知厨房', done: progress >= 2 },
    { text: '制作中', done: progress >= 3 },
    { text: '已完成', done: progress >= 4 },
  ];
}

Page({
  data: { order: null, steps: [], navTop: 28, navHeight: 32 },
  async onLoad(options) {
    this.setNavigationMetrics();
    const order = await orders.getMealOrderDetail({ order_no: options.id });
    const status = kitchen[order.kitchen_status] || { text: order.kitchen_status, desc: '' };
    this.setData({
      order: Object.assign({}, order, {
        order_no: order.order_no || order.order_id,
        can_pay: order.customer_type !== 'member' && order.settlement_status === 'pending_wechat_pay' && order.payment_status !== 'settled',
        can_delete: true,
        kitchen_text: status.text,
        kitchen_desc: status.desc,
        settlement_text: settlement[order.settlement_status] || order.settlement_status,
        payment_label: order.customer_type === 'member' ? '线下会员账户核对' : '微信支付',
        created_text: formatTime(order.created_at),
        paid_text: formatTime(order.paid_at),
        remark_text: remarkText(order),
      }),
      steps: buildSteps(order),
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
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.navigateTo({ url: '/pages/orders/orders' }) }); },
  contact() { wx.showToast({ title: '客服联系方式将在正式上线前补充', icon: 'none' }); },
  async pay() {
    const orderNo = this.data.order && this.data.order.order_no;
    if (!orderNo) return;
    try {
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
      wx.showToast({ title: '支付完成' });
      this.onLoad({ id: orderNo });
    } catch (error) {
      wx.showToast({ title: error.message || '支付未完成', icon: 'none' });
    }
  },
  async remove() {
    const orderNo = this.data.order && this.data.order.order_no;
    if (!orderNo) return;
    const ok = await new Promise((resolve) => wx.showModal({
      title: '删除订单',
      content: '删除后该订单仅在用户侧隐藏，后台仍会保留记录。',
      confirmText: '删除',
      confirmColor: '#8B3A2F',
      success: (result) => resolve(result.confirm),
    }));
    if (!ok) return;
    try {
      await orders.deleteMealOrder({ order_no: orderNo });
      wx.showToast({ title: '已删除' });
      wx.redirectTo({ url: '/pages/orders/orders' });
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' });
    }
  },
});
