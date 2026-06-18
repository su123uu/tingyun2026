const orders = require('../../services/meal-order');
const table = require('../../services/table-session');

const orderStatus = {
  pending_payment: { text: '未支付', desc: '订单尚未完成支付，请先完成支付。' },
  pending_notice: { text: '订单已提交', desc: '订单已提交，请耐心等候。' },
  kitchen_notified: { text: '订单已提交', desc: '订单已提交，请耐心等候。' },
  preparing: { text: '制作中', desc: '订单已提交，正在制作餐品，请耐心等候。' },
  completed: { text: '已完成', desc: '餐品已完成，请享用。' },
};

const settlement = {
  pending_wechat_pay: '待微信支付',
  pending_offline_points: '待线下会员账户核对',
  settled: '已结清',
};

const orderProgress = {
  pending_payment: 0,
  pending_notice: 1,
  kitchen_notified: 1,
  preparing: 2,
  completed: 3,
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

function effectiveOrderStatus(order) {
  const status = order.order_status || order.kitchen_status || '';
  if (
    ['pending_notice', 'kitchen_notified'].includes(status)
    && ['settled', 'pending_offline'].includes(order.payment_status)
  ) {
    return 'preparing';
  }
  return status;
}

function canAddMeal(order) {
  const status = effectiveOrderStatus(order);
  return Boolean(
    order
    && order.session_id
    && order.table_id
    && !['completed', 'cancelled', 'canceled', 'closed', 'refunded'].includes(status)
  );
}

function tableSessionFromOrder(order) {
  return {
    session_id: order.session_id,
    table_id: order.table_id,
    table_name: order.table_name || order.table_id,
    table_area: order.table_area || '',
    people_count: order.people_count || 1,
    customer_type: order.customer_type || 'guest',
    member_id: order.member_id || '',
    member_level: order.member_level || '',
    member_level_no: order.member_level_no || '',
    customer_name: order.customer_name || '',
    customer_mobile: order.customer_mobile || '',
    has_order: true,
    created_at: order.created_at || '',
    expires_at: order.expires_at || '',
  };
}

function buildSteps(order) {
  const progress = orderProgress[effectiveOrderStatus(order)] || 0;
  return [
    { text: '订单已提交', done: progress >= 1 },
    { text: '制作中', done: progress >= 2 },
    { text: '已完成', done: progress >= 3 },
  ];
}

Page({
  data: { order: null, steps: [], navTop: 28, navHeight: 32 },
  async onLoad(options) {
    this.setNavigationMetrics();
    const orderNo = options && options.id;
    if (!orderNo) {
      this.showMissingOrder();
      return;
    }
    let order;
    try {
      order = await orders.getMealOrderDetail({ order_no: orderNo });
    } catch (error) {
      this.showMissingOrder(error && error.message);
      return;
    }
    const statusKey = effectiveOrderStatus(order);
    const status = orderStatus[statusKey] || { text: statusKey, desc: '' };
    this.setData({
      order: Object.assign({}, order, {
        order_no: order.order_no || order.order_id,
        can_pay: order.customer_type !== 'member' && order.settlement_status === 'pending_wechat_pay' && order.payment_status !== 'settled',
        can_add_meal: canAddMeal(order),
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
  showMissingOrder(message) {
    wx.showToast({ title: message || '未找到订单', icon: 'none' });
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/orders/orders' });
    }, 800);
  },
  async addMeal() {
    const order = this.data.order;
    if (!order || !order.can_add_meal) {
      wx.showToast({ title: '该桌台已清台，暂不能加餐', icon: 'none' });
      return;
    }
    await table.setCurrentTableSession(tableSessionFromOrder(order));
    wx.switchTab({
      url: '/pages/menu/menu',
      fail: () => wx.navigateTo({ url: '/pages/menu/menu' }),
    });
  },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.navigateTo({ url: '/pages/orders/orders' }) }); },
  contact() { wx.showToast({ title: '客服联系方式将在正式上线前补充', icon: 'none' }); },
  async pay() {
    const orderNo = this.data.order && this.data.order.order_no;
    if (!orderNo) return;
    try {
      const paymentResult = await orders.createMealPayment({ order_no: orderNo });
      const payment = paymentResult.payment || paymentResult.raw_payment || paymentResult;
      const paymentNo = paymentResult.payment_no || '';
      const batchNo = paymentResult.batch_no || 0;
      try {
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
      } catch (payError) {
        const isCancel = payError && payError.message && payError.message.includes('取消');
        if (isCancel) {
          try { await orders.cancelMealOrder({ order_no: orderNo, payment_no: paymentNo, batch_no: batchNo, reason: 'payment_cancelled' }); } catch (e) { console.warn('cancelMealOrder failed', e); }
        }
        throw payError;
      }
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
      content: '是否删除，删除后无法恢复',
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
