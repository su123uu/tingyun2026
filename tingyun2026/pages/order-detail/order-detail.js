const orders = require('../../services/meal-order');
const table = require('../../services/table-session');
const notification = require('../../services/notification');
const auth = require('../../services/auth');

const orderStatus = {
  preparing: { text: '制作中', desc: '订单已提交，正在制作餐品，请耐心等候。' },
  completed: { text: '已完成', desc: '餐品已完成，请享用。' },
};

const paymentStatuses = {
  unpaid: '待结账',
  paying: '微信支付中',
  offline_pending: '待店员核销',
  settled: '已结清',
};

const orderProgress = {
  preparing: 2,
  completed: 3,
};

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function batchRemarkText(batch) {
  return [batch.remark].concat(batch.quick_remarks || []).filter(Boolean).join('，');
}

function effectiveOrderStatus(order) {
  const status = order.order_status || order.kitchen_status || '';
  return status;
}

function canAddMeal(order) {
  const status = effectiveOrderStatus(order);
  return Boolean(
    order
    && order.session_id
    && order.table_id
    && order.payment_status === 'unpaid'
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
    const batches = (order.batches || []).map((batch) => Object.assign({}, batch, {
      regular_amount: Number(batch.regular_amount ?? batch.amount) || 0,
      member_amount: Number(batch.member_amount ?? batch.regular_amount ?? batch.amount) || 0,
      items: (batch.items || []).map((item) => Object.assign({}, item, {
        regular_price: Number(item.regular_price ?? item.price) || 0,
        member_price: Number(item.member_price ?? item.regular_price ?? item.price) || 0,
        regular_amount: Number(item.regular_amount ?? item.amount ?? (item.price * item.quantity)) || 0,
        member_amount: Number(item.member_amount ?? ((item.member_price ?? item.price) * item.quantity)) || 0,
      })),
      remark_text: batchRemarkText(batch),
    }));
    const isSingleBatch = batches.length === 1;
    this.setData({
      order: Object.assign({}, order, {
        batches,
        order_no: order.order_no || order.order_id,
        can_pay: order.payment_status === 'unpaid',
        can_add_meal: canAddMeal(order),
        kitchen_text: status.text,
        kitchen_desc: status.desc,
        payment_text: paymentStatuses[order.payment_status] || order.payment_status,
        regular_total_amount: Number(order.regular_total_amount ?? order.total_amount) || 0,
        member_total_amount: Number(order.member_total_amount ?? order.regular_total_amount ?? order.total_amount) || 0,
        checkout_amount: Number(order.checkout_amount ?? order.payment_total_fee / 100) || 0,
        display_amount: Number(order.checkout_amount ?? order.payment_total_fee / 100)
          || Number(order.regular_total_amount ?? order.total_amount)
          || 0,
        created_text: formatTime(order.created_at),
        paid_text: formatTime(order.paid_at),
        is_single_batch: isSingleBatch,
        remark_text: isSingleBatch ? batches[0].remark_text : '',
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
  onShow() {
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
  },
  onShareAppMessage() {
    return {
      title: '停云山居 · 山间的一处自在',
      path: '/pages/home/home',
    };
  },
  onShareTimeline() {
    return {
      title: '停云山居 · 山间的一处自在',
    };
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
  contact() { wx.showToast({ title: '店员联系方式将在正式上线前补充', icon: 'none' }); },
  async pay() {
    const order = this.data.order || {};
    const orderNo = order.order_no;
    if (!orderNo) return;
    try {
      const user = await auth.getCurrentUser();
      const isMember = user.customer_type === 'member' || Boolean(user.member_id);
      const pointsAmount = Number(order.member_total_amount || order.display_amount || 0) || 0;
      if (isMember) {
        const confirmed = await new Promise((resolve) => {
          wx.showModal({
            title: '确认积分抵扣',
            content: `确认使用会员积分抵扣本次消费 ¥${pointsAmount}？确认后将清台，并等待店员核销。`,
            confirmText: '确认抵扣',
            cancelText: '暂不结账',
            confirmColor: '#8B3A2F',
            success: (result) => resolve(Boolean(result.confirm)),
            fail: () => resolve(false),
          });
        });
        if (!confirmed) return;
      }
      const subscription = isMember
        ? await notification.requestMemberConsumption()
        : {};
      const checkoutResult = await orders.checkoutMealOrder({
        order_no: orderNo,
        use_points: isMember,
        points_deduct_amount: isMember ? pointsAmount : 0,
        member_checkout_confirmed: isMember,
        notification_subscriptions: subscription,
      });
      const checkoutPayment = checkoutResult.payment || checkoutResult.raw_payment || null;
      if (checkoutPayment && checkoutPayment.timeStamp) {
        try {
          await new Promise((resolve, reject) => {
            wx.requestPayment(Object.assign({}, checkoutPayment, {
              success: resolve,
              fail: (error) => {
                const message = error && error.errMsg && error.errMsg.includes('cancel')
                  ? '支付已取消'
                  : ((error && error.errMsg) || '微信支付失败');
                reject(new Error(message));
              },
            }));
          });
        } catch (paymentError) {
          if (paymentError && paymentError.message && paymentError.message.includes('取消')) {
            await orders.cancelMealOrder({ order_no: orderNo, reason: 'payment_cancelled' });
          }
          throw paymentError;
        }
        wx.showToast({ title: '支付完成' });
      } else if (isMember) {
        wx.showToast({ title: '已提交抵扣，待店员核销' });
      } else {
        wx.showToast({ title: '已提交会员结账' });
      }
      await table.clearCurrentTableSession();
      this.onLoad({ id: orderNo });
    } catch (error) {
      wx.showToast({ title: error.message || '支付未完成', icon: 'none' });
    }
  },
});
