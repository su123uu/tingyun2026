const catalog = require('../../services/catalog');
const reservations = require('../../services/reservation');
const auth = require('../../services/auth');
const pricing = require('../../utils/pricing');

const ROOM_IMAGE = '/images/春悦.jpg';
const ROOM_BEDS = {
  chunyue: '1.5m + 1.2m',
  xiashe: '1.5m',
  qiude: '1.2m + 1.2m',
  dongyu: '5m 榻榻米',
  gengyan: '1.5m',
  cangmiao: '5m 榻榻米',
  chancha: '5m 榻榻米',
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addDays(timestamp, days) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

function formatDate(timestamp, separator = '-') {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(separator);
}

function formatShortDate(timestamp) {
  return formatDate(timestamp, '.').slice(5);
}

const today = startOfDay(new Date());
const tomorrow = addDays(today, 1);

Page({
  data: {
    checkIn: formatDate(today),
    checkOut: formatDate(tomorrow),
    checkInDisplay: formatShortDate(today),
    checkOutDisplay: formatShortDate(tomorrow),
    calendarVisible: false,
    calendarValue: [today, tomorrow],
    minDate: today,
    maxDate: addDays(today, 366),
    people: 2,
    rooms: [],
    selectedRooms: [],
    showRoomDetail: false,
    selectedRoom: null,
    contact: '山里人',
    mobile: '13800136688',
    remark: '',
    amount: 0,
    nights: 1,
    customerType: 'guest',
    navTop: 28,
    navHeight: 32,
    heroHeight: 218,
    heroSpacerHeight: 218,
    heroTitleLeft: 24,
    heroTitleBottom: 68,
    heroTitleSize: 26,
    heroSubtitleBottom: 42,
    heroLineBottom: 23,
    heroDetailOpacity: 1,
  },
  async onLoad() {
    this.setNavigationMetrics();
    const result = await Promise.all([catalog.listRooms('accommodation'), auth.getCurrentUser()]);
    const rooms = result[0];
    const user = result[1];
    this.allRooms = rooms.map((room) => Object.assign({}, room, {
      image: ROOM_IMAGE,
      bed: ROOM_BEDS[room.room_id] || '详询客服',
    }));
    this.setData({ rooms: this.allRooms.map((room) => Object.assign({}, room, { selected: false })), customerType: user.customer_type });
  },
  setNavigationMetrics() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const windowWidth = windowInfo.windowWidth || 375;
    let navTop = (windowInfo.statusBarHeight || 20) + 6;
    let navHeight = 32;
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      if (capsule && capsule.top && capsule.height) {
        navTop = capsule.top;
        navHeight = capsule.height;
      }
    } catch (error) {}
    const rpxToPx = (rpx) => windowWidth * rpx / 750;
    this.heroExpandedHeight = Math.max(210, Math.round(windowWidth * .58));
    this.heroCollapsedHeight = navTop + navHeight + rpxToPx(54);
    this.heroShrinkDistance = this.heroExpandedHeight - this.heroCollapsedHeight;
    this.setData({ navTop, navHeight, heroSpacerHeight: this.heroExpandedHeight });
    this.updateHero(0);
  },
  onPageScroll(event) { this.updateHero(event.scrollTop); },
  updateHero(scrollTop) {
    if (!this.heroShrinkDistance) return;
    const progress = Math.min(1, Math.max(0, scrollTop / this.heroShrinkDistance));
    if (Math.abs(progress - (this.heroProgress || 0)) < .012 && progress !== 0 && progress !== 1) return;
    this.heroProgress = progress;
    const interpolate = (from, to) => Math.round((from + (to - from) * progress) * 10) / 10;
    const finalTitleBottom = this.heroCollapsedHeight - this.data.navTop - 26;
    this.setData({
      heroHeight: interpolate(this.heroExpandedHeight, this.heroCollapsedHeight),
      heroTitleLeft: interpolate(24, 60),
      heroTitleBottom: interpolate(68, finalTitleBottom),
      heroTitleSize: interpolate(26, 22),
      heroSubtitleBottom: interpolate(42, 9),
      heroLineBottom: interpolate(23, 6),
      heroDetailOpacity: Math.max(0, Math.round((1 - progress * 1.65) * 100) / 100),
    });
  },
  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.switchTab({ url: '/pages/booking/booking' }),
    });
  },
  openCalendar() { this.setData({ calendarVisible: true }); },
  closeCalendar() { this.setData({ calendarVisible: false }); },
  confirmCalendar(event) {
    const value = event.detail.value;
    const checkIn = formatDate(value[0]);
    const checkOut = formatDate(value[1]);
    this.setData({
      calendarVisible: false,
      calendarValue: value,
      checkIn,
      checkOut,
      checkInDisplay: formatShortDate(value[0]),
      checkOutDisplay: formatShortDate(value[1]),
    });
    this.total();
  },
  adjustPeople(event) { this.setData({ people: Math.max(1, Number(this.data.people || 1) + Number(event.currentTarget.dataset.step)) }); },
  peopleInput(event) { this.setData({ people: event.detail.value }); },
  normalizePeople() { this.setData({ people: Math.max(1, Number(this.data.people) || 1) }); },
  room(event) {
    this.toggleRoom(event.currentTarget.dataset.id);
  },
  toggleRoom(id) {
    let ids = this.data.selectedRooms;
    ids = ids.includes(id) ? ids.filter((roomId) => roomId !== id) : ids.concat([id]);
    this.setData({ selectedRooms: ids, rooms: this.allRooms.map((room) => Object.assign({}, room, { selected: ids.includes(room.room_id) })) });
    this.total();
  },
  openRoomDetail(event) {
    const selectedRoom = this.allRooms.find((room) => room.room_id === event.currentTarget.dataset.id);
    if (selectedRoom) this.setData({ selectedRoom, showRoomDetail: true });
  },
  hideRoomDetail() { this.setData({ selectedRoom: null, showRoomDetail: false }); },
  reserveRoom() {
    const room = this.data.selectedRoom;
    if (!room) return;
    if (!this.data.selectedRooms.includes(room.room_id)) this.toggleRoom(room.room_id);
    this.hideRoomDetail();
  },
  stop() {},
  contact(event) { this.setData({ contact: event.detail.value }); },
  mobile(event) { this.setData({ mobile: event.detail.value }); },
  remark(event) { this.setData({ remark: event.detail.value }); },
  total() {
    if (!this.data.checkIn || !this.data.checkOut) return;
    try {
      const selected = this.allRooms.filter((room) => this.data.selectedRooms.includes(room.room_id));
      const price = pricing.accommodationTotal(selected, this.data.customerType, this.data.checkIn, this.data.checkOut);
      this.setData(price);
    } catch (error) {
      this.setData({ amount: 0, nights: 0 });
    }
  },
  submit() {
    if (!this.data.checkIn || !this.data.checkOut) return this.toast('请选择入住和离店日期');
    if (!this.data.selectedRooms.length) return this.toast('请选择房间');
    this.create();
  },
  async create() {
    try {
      let order = await reservations.createAccommodationReservation({
        check_in_date: this.data.checkIn,
        check_out_date: this.data.checkOut,
        people_count: this.data.people,
        room_ids: this.data.selectedRooms,
        contact_name: this.data.contact,
        mobile: this.data.mobile,
        remark: this.data.remark,
      });
      if (order.customer_type === 'guest') {
        const ok = await new Promise((resolve) => wx.showModal({ title: '模拟微信支付', content: `本次支付 ¥${order.amount}，不会真实扣款。`, confirmText: '模拟支付', success: (result) => resolve(result.confirm) }));
        if (!ok) return;
        order = await reservations.simulateWechatPay({ order_id: order.order_id });
      }
      wx.redirectTo({ url: `/pages/reservation-detail/reservation-detail?id=${order.order_id}` });
    } catch (error) {
      this.toast(error.message);
    }
  },
  toast(title) { wx.showToast({ title, icon: 'none' }); },
});
