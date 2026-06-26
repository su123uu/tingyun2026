const catalog = require('../../services/catalog');
const reservations = require('../../services/reservation');
const auth = require('../../services/auth');
const notification = require('../../services/notification');
const assets = require('../../config/assets').assets;

const ROOM_IMAGE = assets.rooms.dining;
const STANDARD_IMAGE = assets.diningStandards.sample;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

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

const today = startOfDay(new Date());
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
    date: formatDate(today),
    dateDisplay: formatShortDate(today),
    calendarVisible: false,
    calendarValue: today,
    calendarFormat: formatCalendarDay,
    holidayTips,
    workdayTips,
    minDate: today,
    maxDate: addDays(today, 366),
    slot: 'lunch',
    people: 6,
    rooms: [],
    selectedRooms: [],
    maxSelectableRooms: 1,
    selectedCapacity: 0,
    roomHint: '',
    standards: [],
    standardId: 'group_meal',
    showStandardDetail: false,
    selectedStandard: null,
    selectedStandardDishes: [],
    contact: '',
    mobile: '',
    hasSavedContact: false,
    savedContactName: '',
    savedContactMobile: '',
    remark: '',
    amount: 240,
    customerType: 'guest',
    showPhoneAuth: false,
    memberLevel: '',
    memberLevelNo: '',
    identityInitial: '停',
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
    const user = await auth.getCurrentUser().catch(() => ({}));
    this.setData({
      customerType: user.customer_type || 'guest',
      contact: user.nickname || user.customer_name || this.data.contact,
      mobile: user.mobile || this.data.mobile,
      memberLevel: user.member_level || '',
      memberLevelNo: user.member_level_no || '',
      identityInitial: this.formatIdentityInitial(user.customer_type || 'guest', user),
    });
    if (!user.mobile) {
      this.setData({ showPhoneAuth: true });
    }
    await this.loadContactProfile();
    const standards = await catalog.listDiningStandards({ forceRefresh: true });
    console.info('用餐餐标读取结果', standards);
    this.setData({ standards: asArray(standards).map((standard) => {
      const img = standard.image || standard.image_url || STANDARD_IMAGE;
      const hasImage = !!(standard.image || standard.image_url);
      return Object.assign({}, standard, {
        image: img,
        hasImage,
        initial: (standard.name || '').charAt(0),
        dishes: asArray(standard.dishes),
      });
    }) });
    await this.refreshRooms();
    this.recalculate();
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
  onShow() {
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
  },
  onShareAppMessage() {
    return {
      title: '停云山居 · 山间的一餐',
      path: '/pages/booking-dining/booking-dining',
    };
  },
  onShareTimeline() {
    return {
      title: '停云山居 · 山间的一餐',
    };
  },
  openCalendar() { this.setData({ calendarVisible: true }); },
  closeCalendar() { this.setData({ calendarVisible: false }); },
  async confirmCalendar(event) {
    const value = event.detail.value;
    if (!value) {
      this.setData({ calendarVisible: false });
      return;
    }
    this.setData({
      calendarVisible: false,
      calendarValue: value,
      date: formatDate(value),
      dateDisplay: formatShortDate(value),
    });
    await this.refreshRooms();
  },
  async slot(event) {
    this.setData({ slot: event.currentTarget.dataset.slot });
    await this.refreshRooms();
  },
  async adjustPeople(event) {
    const people = Math.max(6, Number(this.data.people || 6) + Number(event.currentTarget.dataset.step));
    this.setData({ people });
    await this.refreshRooms();
    this.recalculate();
  },
  peopleInput(event) { this.setData({ people: event.detail.value }); },
  async normalizePeople() {
    this.setData({ people: Math.max(6, Number(this.data.people) || 6) });
    await this.refreshRooms();
    this.recalculate();
  },
  async refreshRooms() {
    const requestId = (this.roomsRequestId || 0) + 1;
    this.roomsRequestId = requestId;
    const people = Number(this.data.people) || 6;
    const rooms = asArray(await reservations.listDiningRooms({
      date: this.data.date,
      time_slot: this.data.slot,
      people_count: people,
    }));
    if (requestId !== this.roomsRequestId) return;
    const selectableIds = rooms.filter((room) => room.is_selectable).map((room) => room.room_id);
    const maxSelectableRooms = await reservations.getDiningRoomSelectionLimit(people);
    let selectedRooms = this.data.selectedRooms.filter((id) => selectableIds.includes(id));
    if (selectedRooms.length > maxSelectableRooms) selectedRooms = selectedRooms.slice(0, maxSelectableRooms);
    this.allRooms = rooms.map((room) => Object.assign({}, room, { image: room.image || room.image_url || ROOM_IMAGE }));
    this.updateRooms(selectedRooms, maxSelectableRooms);
  },
  room(event) {
    const id = event.currentTarget.dataset.id;
    const room = this.allRooms.find((item) => item.room_id === id);
    if (!room || !room.is_selectable) return this.toast(`${room ? room.disabled_reason : '包间不可用'}，可联系店长协调`);
    let selectedRooms = this.data.selectedRooms;
    if (selectedRooms.includes(id)) {
      selectedRooms = selectedRooms.filter((roomId) => roomId !== id);
    } else {
      if (selectedRooms.length >= this.data.maxSelectableRooms) {
        return this.toast(`当前人数最多选择 ${this.data.maxSelectableRooms} 个包间`);
      }
      selectedRooms = selectedRooms.concat([id]);
    }
    this.updateRooms(selectedRooms, this.data.maxSelectableRooms);
  },
  updateRooms(selectedRooms, maxSelectableRooms) {
    const selectedCapacity = this.allRooms
      .filter((room) => selectedRooms.includes(room.room_id))
      .reduce((sum, room) => sum + room.max_capacity, 0);
    const roomHint = selectedRooms.length
      ? `已选 ${selectedRooms.length}/${maxSelectableRooms} 个包间，最多容纳 ${selectedCapacity} 人`
      : `当前人数最多选择 ${maxSelectableRooms} 个包间`;
    this.setData({
      selectedRooms,
      rooms: this.allRooms.map((room) => Object.assign({}, room, { selected: selectedRooms.includes(room.room_id) })),
      maxSelectableRooms,
      selectedCapacity,
      roomHint,
    });
  },
  openStandardDetail(event) {
    const selectedStandard = this.data.standards.find((standard) => standard.meal_standard_id === event.currentTarget.dataset.id);
    if (selectedStandard) {
      const rawDishes = selectedStandard.raw_dishes;
      if (!rawDishes || Array.isArray(rawDishes) || typeof rawDishes !== 'object') {
        console.warn('餐标菜品需使用 dishes: { "凉菜": ["菜名1", "菜名2"] } 结构，当前数据：', rawDishes);
      }
      this.setData({
        selectedStandard,
        selectedStandardDishes: asArray(selectedStandard.dishes),
        showStandardDetail: true,
      });
    }
  },
  hideStandardDetail() { this.setData({ selectedStandard: null, selectedStandardDishes: [], showStandardDetail: false }); },
  chooseStandard() {
    if (!this.data.selectedStandard) return;
    this.setData({ standardId: this.data.selectedStandard.meal_standard_id });
    this.recalculate();
    this.hideStandardDetail();
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
  recalculate() {
    const standard = this.data.standards.find((item) => item.meal_standard_id === this.data.standardId);
    this.setData({ amount: standard ? this.data.people * standard.price_per_person : 0 });
  },
  submit() {
    if (this.data.submitting) return;
    if (!this.data.date) return this.toast('请选择用餐日期');
    if (!this.data.selectedRooms.length) return this.toast('请选择包间');
    if (this.data.selectedCapacity < this.data.people) return this.toast('所选包间总容量不足，可联系店长协调');
    if (!this.data.standardId) return this.toast('请选择餐标');
    this.setData({ submitting: true });
    this.create();
  },
  callManager() {
    wx.makePhoneCall({ phoneNumber: '15192670475' });
  },
  async create() {
    try {
      const subscription = this.data.customerType === 'member'
        ? await notification.requestDiningReservationWithConsumption()
        : await notification.requestDiningReservationStatus();
      wx.showLoading({ title: '提交中...', mask: true });
      let order = await reservations.createDiningReservation({
        date: this.data.date,
        time_slot: this.data.slot,
        people_count: this.data.people,
        room_ids: this.data.selectedRooms,
        meal_standard_id: this.data.standardId,
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
      this.toast(error.message || '提交失败');
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
  formatIdentityInitial(type, source = {}) {
    if (type !== 'member') return '停';
    const name = source.nickname || source.customer_name || source.member_name || '';
    return String(name).trim().charAt(0) || '会';
  },
  cancelPhoneAuth() {
    this.setData({ showPhoneAuth: false, customerType: 'guest', identityInitial: '停' });
  },
  async onGetPhoneNumber(event) {
    const detail = event.detail;
    if (!detail.code) {
      this.toast('未完成手机号授权');
      return;
    }
    try {
      wx.showLoading({ title: '身份识别中' });
      const user = await auth.bindMobile({ phoneCode: detail.code });
      wx.hideLoading();
      this.setData({
        showPhoneAuth: false,
        customerType: user.customer_type || 'guest',
        contact: user.nickname || user.customer_name || this.data.contact,
        mobile: user.mobile || this.data.mobile,
        memberLevel: user.member_level || '',
        memberLevelNo: user.member_level_no || '',
        identityInitial: this.formatIdentityInitial(user.customer_type || 'guest', user),
      });
      if (user.customer_type === 'member') {
        this.toast('会员识别成功 · ' + (user.member_level || ''), 'success');
      } else {
        this.toast('暂未匹配到会员，以访客身份继续');
      }
    } catch (error) {
      wx.hideLoading();
      this.toast(error.message || '手机号授权失败');
    }
  },
  toast(title) { wx.showToast({ title, icon: 'none' }); },
});
