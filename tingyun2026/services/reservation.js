const storage = require('../utils/storage');
const createBusinessId = require('../utils/id').createBusinessId;
const validators = require('../utils/validators');
const assert = validators.assert;
const assertMobile = validators.assertMobile;
const accommodationTotal = require('../utils/pricing').accommodationTotal;
const auth = require('./auth');
const catalog = require('./catalog');

const KEY = 'reservations';
const getOrders = () => storage.get(KEY, []);
const save = (orders) => storage.set(KEY, orders);
const ACTIVE_RESERVATION_STATUSES = ['paid_pending_confirmation', 'pending_confirmation', 'confirmed'];

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
}

async function callReservationCloud(action, data = {}) {
  if (!canUseCloud()) {
    const error = new Error('Cloud unavailable');
    error.code = 'CLOUD_UNAVAILABLE';
    throw error;
  }
  const result = await wx.cloud.callFunction({
    name: 'reservationManage',
    data: Object.assign({}, data, { action }),
  });
  const body = result && result.result ? result.result : result;
  if (!body || body.ok !== true) {
    const error = new Error((body && body.message) || '预约云函数调用失败');
    error.code = (body && body.code) || 'CLOUD_FUNCTION_FAILED';
    error.fromCloudResult = true;
    throw error;
  }
  return body.data;
}

async function withCurrentMobile(input = {}) {
  const user = await auth.getCurrentUser();
  return Object.assign({ mobile: user.mobile || '' }, input);
}

async function cloudOrFallback(action, input, fallback, options = {}) {
  try {
    return await callReservationCloud(action, input);
  } catch (error) {
    if (error.fromCloudResult && !options.fallbackOnCloudError) throw error;
    console.warn(`reservationManage ${action} fallback to local`, error);
    return fallback();
  }
}

function statuses(type) {
  return type === 'member'
    ? { reservation_status: 'pending_confirmation', settlement_status: 'pending_offline_points' }
    : {
      reservation_status: 'pending_payment',
      settlement_status: 'pending_wechat_pay',
      lock_expires_at: '',
    };
}

async function getDiningRoomSelectionLimit(people_count) {
  if (people_count <= 12) return 1;
  if (people_count <= 22) return 2;
  const diningRooms = await catalog.listDiningRooms();
  return diningRooms.length;
}

function isActiveReservation(order) {
  return ACTIVE_RESERVATION_STATUSES.includes(order.reservation_status);
}

function isDiningRoomBooked(room_id, input, excludeOrderNo = '') {
  return getOrders().some((order) => (
    order.reservation_type === 'dining'
    && (order.order_no || order.order_id) !== excludeOrderNo
    && order.date === input.date
    && order.time_slot === input.time_slot
    && order.room_ids.includes(room_id)
    && isActiveReservation(order)
  ));
}

function overlaps(startA, endA, startB, endB) {
  return Date.parse(startA) < Date.parse(endB) && Date.parse(startB) < Date.parse(endA);
}

function isAccommodationRoomBooked(room_id, input, excludeOrderNo = '') {
  if (!input.check_in_date || !input.check_out_date) return false;
  return getOrders().some((order) => (
    order.reservation_type === 'accommodation'
    && (order.order_no || order.order_id) !== excludeOrderNo
    && order.room_ids.includes(room_id)
    && isActiveReservation(order)
    && overlaps(input.check_in_date, input.check_out_date, order.check_in_date, order.check_out_date)
  ));
}

function assertReservationRoomsAvailable(order) {
  const orderNo = order.order_no || order.order_id;
  if (order.reservation_type === 'dining') {
    const conflict = (order.room_ids || []).some((roomId) => isDiningRoomBooked(roomId, order, orderNo));
    assert(!conflict, 'ROOM_ALREADY_BOOKED', '所选包间已被预订，请重新选择');
    return;
  }
  const conflict = (order.room_ids || []).some((roomId) => isAccommodationRoomBooked(roomId, order, orderNo));
  assert(!conflict, 'ROOM_ALREADY_BOOKED', '所选房间已被预订，请重新选择');
}

async function listDiningRooms(input) {
  const people_count = input.people_count;
  assert(input.date, 'DINING_DATE_REQUIRED', '请选择用餐日期');
  assert(['lunch', 'dinner'].includes(input.time_slot), 'DINING_TIME_SLOT_REQUIRED', '请选择用餐时段');
  assert(people_count >= 6, 'DINING_MIN_PEOPLE', '用餐预订至少需要 6 人');
  const selectionLimit = await getDiningRoomSelectionLimit(people_count);
  const diningRooms = await catalog.listDiningRooms();
  return diningRooms.map((room) => {
    const is_booked = !room.is_available || isDiningRoomBooked(room.room_id, input);
    const is_people_suitable = selectionLimit > 1 || room.max_capacity >= people_count;
    return Object.assign({}, room, {
      is_booked,
      is_people_suitable,
      is_selectable: !is_booked && is_people_suitable,
      disabled_reason: is_booked ? '已预定' : (is_people_suitable ? '' : '人数不合适'),
    });
  });
}

async function listAvailableDiningRooms(input) {
  const diningRooms = await listDiningRooms(input);
  return diningRooms.filter((room) => room.is_selectable);
}

async function listAvailableAccommodationRooms(input = {}) {
  const user = await auth.getCurrentUser();
  let available_benefits = [];
  if (user.customer_type === 'member') {
    try {
      const memberService = require('./member');
      const profile = await memberService.getMemberProfile({ member_id: user.member_id, mobile: user.mobile });
      available_benefits = (profile.benefit_accounts || []).filter((account) => (
        account.benefit_key === 'free_accommodation'
        && account.account_status === 'active'
        && account.remaining_quota > 0
      )).map((account) => ({
        benefit_account_id: account.benefit_account_id,
        benefit_key: account.benefit_key,
        benefit_name: account.benefit_name,
        remaining_quota: account.remaining_quota,
        quota_unit: account.quota_unit,
        rule: account.rule_snapshot,
      }));
    } catch (error) {
      console.warn('failed to load member benefits for accommodation', error);
    }
  }
  const accommodationRooms = await catalog.listAccommodationRooms();
  const roomList = accommodationRooms.map((room) => {
    const is_booked = !room.is_available || isAccommodationRoomBooked(room.room_id, input);
    return Object.assign({}, room, {
      is_booked,
      is_selectable: !is_booked,
      disabled_reason: is_booked ? '已预定' : '',
    });
  });
  return { rooms: roomList, available_benefits };
}

async function createDiningReservation(input) {
  assert(input.people_count >= 6, 'DINING_MIN_PEOPLE', '用餐预订至少需要 6 人');
  assertMobile(input.mobile);
  const selectedIds = Array.from(new Set(input.room_ids || []));
  const roomStates = await listDiningRooms(input);
  const selected = roomStates.filter((room) => selectedIds.includes(room.room_id));
  const diningStandards = await catalog.listDiningStandards();
  const standard = diningStandards.find((entry) => entry.meal_standard_id === input.meal_standard_id);
  assert(selectedIds.length, 'ROOM_REQUIRED', '请选择包间');
  assert(selected.length === selectedIds.length, 'ROOM_INVALID', '所选包间不存在');
  assert(standard, 'MEAL_STANDARD_REQUIRED', '请选择餐标');
  assert(selected.length <= await getDiningRoomSelectionLimit(input.people_count), 'ROOM_SELECTION_LIMIT', '所选包间数量超过当前人数限制');
  assert(selected.every((room) => !room.is_booked), 'ROOM_ALREADY_BOOKED', '所选包间已被预定，请重新选择');
  assert(selected.every((room) => room.is_people_suitable), 'ROOM_PEOPLE_NOT_SUITABLE', '所选包间人数不合适');
  assert(selected.reduce((sum, room) => sum + room.max_capacity, 0) >= input.people_count, 'ROOM_CAPACITY_NOT_ENOUGH', '所选包间总容量不足');
  const user = await auth.getCurrentUser();
  const orderNo = createBusinessId('TYDINING');
  const order = Object.assign({
    order_no: orderNo,
    order_id: orderNo,
    reservation_type: 'dining',
    customer_type: user.customer_type,
    room_ids: selectedIds,
    date: input.date,
    time_slot: input.time_slot,
    people_count: input.people_count,
    meal_standard_id: input.meal_standard_id,
    amount: input.people_count * standard.price_per_person,
    contact_name: input.contact_name,
    mobile: input.mobile,
    remark: input.remark || '',
    created_at: new Date().toISOString(),
  }, statuses(user.customer_type));
  const orders = getOrders(); orders.push(order); save(orders); return order;
}

async function createAccommodationReservation(input) {
  assertMobile(input.mobile);
  const selectedIds = Array.from(new Set(input.room_ids || []));
  const availability = await listAvailableAccommodationRooms(input);
  const roomStates = availability.rooms;
  const selected = roomStates.filter((room) => selectedIds.includes(room.room_id));
  assert(selected.length, 'ROOM_REQUIRED', '请选择房间');
  assert(selected.length === selectedIds.length, 'ROOM_INVALID', '所选房间不存在');
  assert(selected.every((room) => !room.is_booked), 'ROOM_ALREADY_BOOKED', '所选房间已被预定，请重新选择');
  const user = await auth.getCurrentUser();
  const pricing = accommodationTotal(selected, user.customer_type, input.check_in_date, input.check_out_date);
  const orderNo = createBusinessId('TYROOM');
  const order = Object.assign({
    order_no: orderNo,
    order_id: orderNo,
    reservation_type: 'accommodation',
    customer_type: user.customer_type,
    room_ids: selectedIds,
    check_in_date: input.check_in_date,
    check_out_date: input.check_out_date,
    people_count: input.people_count,
    contact_name: input.contact_name,
    mobile: input.mobile,
    remark: input.remark || '',
    created_at: new Date().toISOString(),
  }, pricing, statuses(user.customer_type));
  const orders = getOrders(); orders.push(order); save(orders); return order;
}

async function simulateWechatPay(input) {
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  assert(order, 'RESERVATION_NOT_FOUND', '未找到预订订单');
  assertReservationRoomsAvailable(order);
  order.reservation_status = 'paid_pending_confirmation';
  order.settlement_status = 'wechat_paid';
  delete order.lock_expires_at;
  save(orders);
  return order;
}

async function listReservations() { return getOrders().filter((order) => !order.user_deleted_at); }
async function getReservationDetail(input) {
  const order_no = input.order_no || input.order_id;
  const order = getOrders().find((entry) => (entry.order_no || entry.order_id) === order_no);
  assert(order, 'RESERVATION_NOT_FOUND', '未找到预订订单');
  assert(!order.user_deleted_at, 'RESERVATION_NOT_FOUND', '未找到预订订单');
  return order;
}

async function deleteReservation(input) {
  const order_no = input.order_no || input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => (entry.order_no || entry.order_id) === order_no);
  assert(order, 'RESERVATION_NOT_FOUND', '未找到预订订单');
  order.user_deleted_at = new Date().toISOString();
  save(orders);
  return { order_no, user_deleted_at: order.user_deleted_at };
}

const localReservation = {
  listDiningRooms,
  listAvailableDiningRooms,
  listAvailableAccommodationRooms,
  createDiningReservation,
  createAccommodationReservation,
  simulateWechatPay,
  listReservations,
  getReservationDetail,
  deleteReservation,
};

async function cloudListDiningRooms(input) {
  return cloudOrFallback('listDiningRooms', input, () => localReservation.listDiningRooms(input), { fallbackOnCloudError: true });
}

async function cloudListAvailableDiningRooms(input) {
  return cloudOrFallback('listAvailableDiningRooms', input, () => localReservation.listAvailableDiningRooms(input), { fallbackOnCloudError: true });
}

async function cloudListAvailableAccommodationRooms(input = {}) {
  const payload = await withCurrentMobile(input);
  return cloudOrFallback('listAvailableAccommodationRooms', payload, () => localReservation.listAvailableAccommodationRooms(input), { fallbackOnCloudError: true });
}

async function cloudCreateDiningReservation(input) {
  return cloudOrFallback('createDiningReservation', input, () => localReservation.createDiningReservation(input));
}

async function cloudCreateAccommodationReservation(input) {
  return cloudOrFallback('createAccommodationReservation', input, () => localReservation.createAccommodationReservation(input));
}

async function createReservationPayment(input = {}) {
  return callReservationCloud('createReservationPayment', input);
}

async function cloudSimulateWechatPay(input) {
  return cloudOrFallback('simulateWechatPay', input, () => localReservation.simulateWechatPay(input));
}

async function cloudListReservations() {
  const payload = await withCurrentMobile();
  return cloudOrFallback('listReservations', payload, () => localReservation.listReservations(), { fallbackOnCloudError: true });
}

async function cloudGetReservationDetail(input) {
  const payload = await withCurrentMobile(input);
  return cloudOrFallback('getReservationDetail', payload, () => localReservation.getReservationDetail(input), { fallbackOnCloudError: true });
}

async function cloudDeleteReservation(input) {
  const payload = await withCurrentMobile(input);
  return cloudOrFallback('deleteReservation', payload, () => localReservation.deleteReservation(input));
}

async function getContactProfile() {
  try {
    return await callReservationCloud('getContactProfile');
  } catch (error) {
    console.warn('reservationManage getContactProfile fallback to empty', error);
    return { contact_name: '', mobile: '', has_contact: false };
  }
}

module.exports = {
  getDiningRoomSelectionLimit,
  listDiningRooms: cloudListDiningRooms,
  listAvailableDiningRooms: cloudListAvailableDiningRooms,
  listAvailableAccommodationRooms: cloudListAvailableAccommodationRooms,
  getContactProfile,
  createDiningReservation: cloudCreateDiningReservation,
  createAccommodationReservation: cloudCreateAccommodationReservation,
  createReservationPayment,
  simulateWechatPay: cloudSimulateWechatPay,
  listReservations: cloudListReservations,
  getReservationDetail: cloudGetReservationDetail,
  deleteReservation: cloudDeleteReservation,
};
