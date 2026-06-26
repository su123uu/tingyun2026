const reservations = require('../../services/reservation');
const auth = require('../../services/auth');
const pricing = require('../../utils/pricing');
const notification = require('../../services/notification');
const assets = require('../../config/assets').assets;

const ROOM_IMAGE = assets.rooms.accommodation;
const DEFAULT_BED_TYPE = '请咨询客服';

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

function parseDateKey(key) {
  const parts = key.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
}

function buildDateRangeMap(ranges) {
  const map = {};
  ranges.forEach((range) => {
    let current = parseDateKey(range.start);
    const end = parseDateKey(range.end);
    while (current <= end) {
      map[formatDate(current)] = range.label;
      current = addDays(current, 1);
    }
  });
  return map;
}

function normalizeRoomImages(room) {
  const images = Array.isArray(room.image_urls) ? room.image_urls.filter(Boolean) : [];
  const fallback = room.image || room.image_url || ROOM_IMAGE;
  if (!images.length && fallback) images.push(fallback);
  return images;
}

const today = startOfDay(new Date());
const tomorrow = addDays(today, 1);
const holidayTips = buildDateRangeMap([
  { start: '2026-01-01', end: '2026-01-03', label: '元旦' },
  { start: '2026-02-15', end: '2026-02-23', label: '春节' },
  { start: '2026-04-04', end: '2026-04-06', label: '清明' },
  { start: '2026-05-01', end: '2026-05-05', label: '劳动节' },
  { start: '2026-06-19', end: '2026-06-21', label: '端午' },
  { start: '2026-09-25', end: '2026-09-27', label: '中秋' },
  { start: '2026-10-01', end: '2026-10-07', label: '国庆' },
]);
const workdayTips = {
  '2026-01-04': '调休',
  '2026-02-14': '调休',
  '2026-02-28': '调休',
  '2026-05-09': '调休',
  '2026-09-20': '调休',
  '2026-10-10': '调休',
};

function formatCalendarDay(day) {
  const key = formatDate(day.date.getTime());
  const date = day.date;
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const suffix = workdayTips[key] || holidayTips[key] || (isWeekend ? '休' : '');
  return Object.assign({}, day, { suffix });
}

Page({
  data: {
    checkIn: formatDate(today),
    checkOut: formatDate(tomorrow),
    checkInDisplay: formatShortDate(today),
    checkOutDisplay: formatShortDate(tomorrow),
    calendarVisible: false,
    calendarValue: [today, tomorrow],
    calendarFormat: formatCalendarDay,
    holidayTips,
    workdayTips,
    minDate: today,
    maxDate: addDays(today, 366),
    people: 2,
    rooms: [],
    availableBenefits: [],
    selectedRooms: [],
    showRoomDetail: false,
    selectedRoom: null,
    roomGalleryCurrent: 0,
    contact: '',
    mobile: '',
    hasSavedContact: false,
    savedContactName: '',
    savedContactMobile: '',
    remark: '',
    amount: 0,
    nights: 1,
    customerType: 'guest',
    submitting: false,
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
    const user = await auth.getCurrentUser();
    this.setData({
      customerType: user.customer_type,
      contact: user.nickname || user.customer_name || this.data.contact,
      mobile: user.mobile || this.data.mobile,
    });
    await this.loadContactProfile();
    await this.refreshRooms();
  },
  async loadContactProfile() {
    const profile = await reservations.getContactProfile();
    if (!profile || !profile.has_contact) return;
    this.setData({
      hasSavedContact: true,
      savedContactName: profile.contact_name || '',
      savedContactMobile: profile.mobile || '',
    });
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
  async confirmCalendar(event) {
    const value = event.detail.value;
    if (!Array.isArray(value) || value.length < 2) {
      this.setData({ calendarVisible: false });
      return;
    }
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
    await this.refreshRooms();
    this.total();
  },
  adjustPeople(event) { this.setData({ people: Math.max(1, Number(this.data.people || 1) + Number(event.currentTarget.dataset.step)) }); },
  peopleInput(event) { this.setData({ people: event.detail.value }); },
  normalizePeople() { this.setData({ people: Math.max(1, Number(this.data.people) || 1) }); },
  async refreshRooms() {
    const availability = await reservations.listAvailableAccommodationRooms({
      check_in_date: this.data.checkIn,
      check_out_date: this.data.checkOut,
    });
    const rooms = Array.isArray(availability) ? availability : (availability && availability.rooms);
    const availableBenefits = Array.isArray(availability) ? [] : (availability && availability.available_benefits);
    const normalizedRooms = Array.isArray(rooms) ? rooms : [];
    const selectableIds = normalizedRooms.filter((room) => room.is_selectable).map((room) => room.room_id);
    const selectedRooms = this.data.selectedRooms.filter((id) => selectableIds.includes(id));
    this.allRooms = normalizedRooms.map((room) => {
      const images = normalizeRoomImages(room);
      return Object.assign({}, room, {
        images,
        image: images[0] || ROOM_IMAGE,
        bed: room.bed_type || room.bed || DEFAULT_BED_TYPE,
        selected: selectedRooms.includes(room.room_id),
      });
    });
    this.setData({ selectedRooms, rooms: this.allRooms, availableBenefits: Array.isArray(availableBenefits) ? availableBenefits : [] });
  },
  room(event) {
    const id = event.currentTarget.dataset.id;
    const room = this.allRooms.find((item) => item.room_id === id);
    if (!room || !room.is_selectable) return this.toast(`${room ? room.disabled_reason : '房间不可用'}，可联系店长协调`);
    this.toggleRoom(id);
  },
  toggleRoom(id) {
    let ids = this.data.selectedRooms;
    ids = ids.includes(id) ? ids.filter((roomId) => roomId !== id) : ids.concat([id]);
    this.setData({ selectedRooms: ids, rooms: this.allRooms.map((room) => Object.assign({}, room, { selected: ids.includes(room.room_id) })) });
    this.total();
  },
  openRoomDetail(event) {
    const selectedRoom = this.allRooms.find((room) => room.room_id === event.currentTarget.dataset.id);
    if (selectedRoom) this.setData({ selectedRoom, showRoomDetail: true, roomGalleryCurrent: 0 });
  },
  hideRoomDetail() { this.setData({ selectedRoom: null, showRoomDetail: false }); },
  onRoomGalleryChange(event) {
    this.setData({ roomGalleryCurrent: event.detail.current || 0 });
  },
  previewRoomImages() {
    const room = this.data.selectedRoom;
    const urls = room && Array.isArray(room.images) ? room.images.filter(Boolean) : [];
    if (!urls.length) return;
    wx.previewImage({
      urls,
      current: urls[this.data.roomGalleryCurrent] || urls[0],
    });
  },
  reserveRoom() {
    const room = this.data.selectedRoom;
    if (!room) return;
    if (!room.is_selectable) return this.toast(`${room.disabled_reason || '房间不可用'}，可联系店长协调`);
    if (!this.data.selectedRooms.includes(room.room_id)) this.toggleRoom(room.room_id);
    this.hideRoomDetail();
  },
  stop() {},
  contact(event) { this.setData({ contact: event.detail.value }); },
  mobile(event) { this.setData({ mobile: event.detail.value }); },
  useSavedContact() {
    this.setData({
      contact: this.data.savedContactName || this.data.contact,
      mobile: this.data.savedContactMobile || this.data.mobile,
    });
  },
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
    if (this.data.submitting) return;
    if (!this.data.checkIn || !this.data.checkOut) return this.toast('请选择入住和离店日期');
    if (!this.data.selectedRooms.length) return this.toast('请选择房间');
    this.setData({ submitting: true });
    this.create();
  },
  callManager() {
    wx.makePhoneCall({ phoneNumber: '15192670475' });
  },
  async create() {
    try {
      const subscription = this.data.customerType === 'member'
        ? await notification.requestReservationWithConsumption()
        : await notification.requestReservationStatus();
      wx.showLoading({ title: '提交中...', mask: true });
      let order = await reservations.createAccommodationReservation({
        check_in_date: this.data.checkIn,
        check_out_date: this.data.checkOut,
        people_count: this.data.people,
        room_ids: this.data.selectedRooms,
        contact_name: this.data.contact,
        mobile: this.data.mobile,
        remark: this.data.remark,
        notification_subscriptions: subscription,
      });
      wx.hideLoading();
      if (order.customer_type === 'guest') {
        await this.payReservation(order.order_no || order.order_id);
      }
      wx.redirectTo({ url: `/pages/reservation-detail/reservation-detail?id=${order.order_no || order.order_id}` });
    } catch (error) {
      wx.hideLoading();
      this.toast(error.message);
    } finally {
      this.setData({ submitting: false });
    }
  },
  async payReservation(orderNo) {
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
  },
  toast(title) { wx.showToast({ title, icon: 'none' }); },
});
