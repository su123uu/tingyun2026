const reservations = require('../../services/reservation');
const catalog = require('../../services/catalog');

const statuses = {
  pending_payment: { text: '待支付', desc: '请尽快完成支付，以便为您保留本次预订。' },
  paid_pending_confirmation: { text: '已支付，待确认', desc: '需求已提交，客服将与您联系确认具体信息。' },
  pending_confirmation: { text: '待确认', desc: '需求已提交，客服将与您联系确认具体信息。' },
  confirmed: { text: '已确认', desc: '预订已确认，期待您的到来。' },
  completed: { text: '已完成', desc: '本次预订已完成，感谢您的光临。' },
  cancelled: { text: '已取消', desc: '本次预订已取消。如有疑问，请联系客服。', tone: 'weak' },
  rejected: { text: '未通过', desc: '本次预订未能确认。如有疑问，请联系客服。', tone: 'weak' },
  payment_expired: { text: '支付超时', desc: '本次预订未在规定时间内完成支付。', tone: 'weak' },
};

const settlement = {
  pending_wechat_pay: '待微信支付',
  wechat_paid: '已微信支付',
  pending_offline_points: '待线下积分扣款',
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

function roomNames(order, rooms) {
  return rooms
    .filter((room) => (order.room_ids || []).includes(room.room_id))
    .map((room) => `${room.name} · ${room.category}`)
    .join('、') || '详询客服';
}

Page({
  data: { order: null, navTop: 28, navHeight: 32 },
  async onLoad(options) {
    this.setNavigationMetrics();
    const [order, diningRooms, accommodationRooms, standards] = await Promise.all([
      reservations.getReservationDetail({ order_no: options.id }),
      catalog.listDiningRooms(),
      catalog.listAccommodationRooms(),
      catalog.listDiningStandards(),
    ]);
    const rooms = diningRooms.concat(accommodationRooms);
    const status = statuses[order.reservation_status] || { text: order.reservation_status, desc: '' };
    const standard = standards.find((item) => item.meal_standard_id === order.meal_standard_id);
    const isDining = order.reservation_type === 'dining';
    this.setData({
      order: Object.assign({}, order, {
        order_no: order.order_no || order.order_id,
        status_text: status.text,
        status_desc: status.desc,
        status_tone: status.tone || '',
        settlement_text: settlement[order.settlement_status] || order.settlement_status,
        payment_method: order.customer_type === 'member' ? '线下积分扣款' : '微信支付',
        reservation_label: isDining ? '用餐预订' : '住宿预订',
        detail_title: isDining ? '餐厅信息' : '住宿信息',
        room_label: isDining ? '包间' : '房间',
        room_names: roomNames(order, rooms),
        time_slot_text: timeSlots[order.time_slot] || order.time_slot,
        standard_text: standard ? `${standard.name} · ¥${standard.price_per_person}/位` : '详询客服',
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
  contact() { wx.makePhoneCall({ phoneNumber: '15192670475' }); },
});
