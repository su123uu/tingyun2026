const reservations = require('../../services/reservation');

const statuses = {
  pending_payment: { text: '待支付', desc: '待支付订单不占用房间，支付成功后将提交客服确认。' },
  paid_pending_confirmation: { text: '已支付，待确认', desc: '需求已提交，客服将与您联系确认具体信息。' },
  pending_confirmation: { text: '待确认', desc: '需求已提交，客服将与您联系确认具体信息。' },
  confirmed: { text: '已确认', desc: '预订已确认，期待您的到来。' },
  completed: { text: '已完成', desc: '本次预订已完成，感谢您的光临。' },
  cancelled: { text: '已取消', desc: '本次预订已取消。如有疑问，请联系客服。', tone: 'weak' },
  rejected: { text: '未通过', desc: '本次预订未能确认。如有疑问，请联系客服。', tone: 'weak' },
  payment_expired: { text: '未完成支付', desc: '本次预订未完成支付，房间未被占用。', tone: 'weak' },
};

statuses.refunding = { text: '退款处理中', desc: '房间未能确认占用，客服将联系您处理退款。', tone: 'weak' };
statuses.refunded = { text: '已退款', desc: '本次预约已完成退款。', tone: 'weak' };

const paymentStatuses = {
  pending_wechat_pay: '待微信支付',
  paying: '支付中',
  offline_pending: '待线下会员账户核对',
  settled: '已结清',
};

const timeSlots = {
  lunch: '午餐 11:30-14:00',
  dinner: '晚餐 17:00-21:00',
};

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roomNames(order) {
  const snapshots = order.room_snapshots || [];
  if (snapshots.length) {
    return snapshots.map((room) => `${room.name} · ${room.category || ''}`).filter(Boolean).join('、');
  }
  return order.room_name || '详询客服';
}

Page({
  data: { order: null, navTop: 28, navHeight: 32 },
  async onLoad(options) {
    this.setNavigationMetrics();
    const order = await reservations.getReservationDetail({ order_no: options.id });
    const status = statuses[order.reservation_status] || { text: order.reservation_status, desc: '' };
    const standard = order.meal_standard_snapshot || {};
    const isDining = order.reservation_type === 'dining';
    this.setData({
      order: Object.assign({}, order, {
        order_no: order.order_no || order.order_id,
        can_pay: order.customer_type !== 'member' && order.reservation_status === 'pending_payment' && order.payment_status === 'pending_wechat_pay',
        can_delete: true,
        status_text: status.text,
        status_desc: status.desc,
        status_tone: status.tone || '',
        payment_text: paymentStatuses[order.payment_status] || order.payment_status,
        payment_method: order.customer_type === 'member' ? '线下会员账户核对' : '微信支付',
        reservation_label: isDining ? '用餐预订' : '住宿预订',
        detail_title: isDining ? '餐厅信息' : '住宿信息',
        room_label: isDining ? '包间' : '房间',
        room_names: roomNames(order),
        time_slot_text: timeSlots[order.time_slot] || order.time_slot,
        standard_text: standard.name ? `${standard.name} · ¥${standard.price_per_person}/位` : (order.meal_standard_name ? `${order.meal_standard_name}` : '详询客服'),
        created_text: formatTime(order.created_at),
        remark_text: order.remark || '无',
      }),
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
  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.navigateTo({ url: '/pages/orders/orders' }),
    });
  },
  onShow() {
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
  },
  onShareAppMessage() {
    const order = this.data.order;
    let title = '停云山居·山里请 云上坐';
    let imageUrl = '';
    if (order) {
      const isDining = order.reservation_type === 'dining';
      const summary = isDining ? '山间的一餐' : '山居的一宿';
      const statusText = (order.status_text || '').replace(/预订/, '').trim();
      const roomText = order.room_names ? `，${order.room_names}` : '';
      title = `我在停云山居预订${summary}${roomText} · ${statusText || '已下单'}`;
      const firstSnapshot = (order.room_snapshots || [])[0];
      if (firstSnapshot && firstSnapshot.image_url) {
        imageUrl = firstSnapshot.image_url;
      }
    }
    return {
      title: title.length > 30 ? title.slice(0, 30) : title,
      path: '/pages/home/home',
      imageUrl,
    };
  },
  onShareTimeline() {
    const order = this.data.order;
    let title = '停云山居·山里请 云上坐';
    let query = '';
    if (order) {
      const isDining = order.reservation_type === 'dining';
      const summary = isDining ? '山间的一餐' : '山居的一宿';
      const statusText = (order.status_text || '').replace(/预订/, '').trim();
      title = `我在停云山居预订${summary} · ${statusText || '已下单'}`;
      if (order.order_no) {
        query = `id=${order.order_no}`;
      }
    }
    return {
      title: title.length > 30 ? title.slice(0, 30) : title,
      query,
    };
  },
  contact() { wx.makePhoneCall({ phoneNumber: '15192670475' }); },
  async pay() {
    const orderNo = this.data.order && this.data.order.order_no;
    if (!orderNo) return;
    try {
      const paymentResult = await reservations.createReservationPayment({ order_no: orderNo });
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
      content: '是否删除，删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#8B3A2F',
      success: (result) => resolve(result.confirm),
    }));
    if (!ok) return;
    try {
      await reservations.deleteReservation({ order_no: orderNo });
      wx.showToast({ title: '已删除' });
      wx.redirectTo({ url: '/pages/orders/orders' });
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' });
    }
  },
});
