const storage = require('../utils/storage');
const rooms = require('../mock/rooms').rooms;
const standards = require('../mock/meal-standards').standards;
const createId = require('../utils/id').createId;
const validators = require('../utils/validators');
const assert = validators.assert;
const assertMobile = validators.assertMobile;
const accommodationTotal = require('../utils/pricing').accommodationTotal;
const auth = require('./auth');

const KEY = 'reservations';
const getOrders = () => storage.get(KEY, []);
const save = (orders) => storage.set(KEY, orders);
const RELEASED_RESERVATION_STATUSES = ['cancelled', 'rejected', 'payment_expired'];

function statuses(type) {
  return type === 'member'
    ? { reservation_status: 'pending_confirmation', settlement_status: 'pending_offline_points' }
    : {
      reservation_status: 'pending_payment',
      settlement_status: 'pending_wechat_pay',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
}

function getDiningRoomSelectionLimit(people_count) {
  if (people_count <= 12) return 1;
  if (people_count <= 22) return 2;
  return rooms.filter((room) => room.room_type === 'dining').length;
}

function isDiningRoomBooked(room_id, input) {
  return getOrders().some((order) => (
    order.reservation_type === 'dining'
    && order.date === input.date
    && order.time_slot === input.time_slot
    && order.room_ids.includes(room_id)
    && !RELEASED_RESERVATION_STATUSES.includes(order.reservation_status)
    && !(order.reservation_status === 'pending_payment' && order.hold_expires_at && Date.parse(order.hold_expires_at) <= Date.now())
  ));
}

async function listDiningRooms(input) {
  const people_count = input.people_count;
  assert(input.date, 'DINING_DATE_REQUIRED', '请选择用餐日期');
  assert(['lunch', 'dinner'].includes(input.time_slot), 'DINING_TIME_SLOT_REQUIRED', '请选择用餐时段');
  assert(people_count >= 6, 'DINING_MIN_PEOPLE', '用餐预订至少需要 6 人');
  const selectionLimit = getDiningRoomSelectionLimit(people_count);
  return rooms.filter((room) => room.room_type === 'dining').map((room) => {
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

async function listAvailableAccommodationRooms() {
  return rooms.filter((room) => room.room_type === 'accommodation' && room.is_available);
}

async function createDiningReservation(input) {
  assert(input.people_count >= 6, 'DINING_MIN_PEOPLE', '用餐预订至少需要 6 人');
  assertMobile(input.mobile);
  const selectedIds = Array.from(new Set(input.room_ids || []));
  const roomStates = await listDiningRooms(input);
  const selected = roomStates.filter((room) => selectedIds.includes(room.room_id));
  const standard = standards.find((entry) => entry.meal_standard_id === input.meal_standard_id);
  assert(selectedIds.length, 'ROOM_REQUIRED', '请选择包间');
  assert(selected.length === selectedIds.length, 'ROOM_INVALID', '所选包间不存在');
  assert(standard, 'MEAL_STANDARD_REQUIRED', '请选择餐标');
  assert(selected.length <= getDiningRoomSelectionLimit(input.people_count), 'ROOM_SELECTION_LIMIT', '所选包间数量超过当前人数限制');
  assert(selected.every((room) => !room.is_booked), 'ROOM_ALREADY_BOOKED', '所选包间已被预定，请重新选择');
  assert(selected.every((room) => room.is_people_suitable), 'ROOM_PEOPLE_NOT_SUITABLE', '所选包间人数不合适');
  assert(selected.reduce((sum, room) => sum + room.max_capacity, 0) >= input.people_count, 'ROOM_CAPACITY_NOT_ENOUGH', '所选包间总容量不足');
  const user = await auth.getCurrentUser();
  const order = Object.assign({
    order_id: createId('RES'),
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
  const selected = rooms.filter((room) => input.room_ids.includes(room.room_id) && room.room_type === 'accommodation');
  assert(selected.length, 'ROOM_REQUIRED', '请选择房间');
  assert(selected.reduce((sum, room) => sum + room.max_capacity, 0) >= input.people_count, 'ROOM_CAPACITY_NOT_ENOUGH', '所选房间总容量不足');
  const user = await auth.getCurrentUser();
  const pricing = accommodationTotal(selected, user.customer_type, input.check_in_date, input.check_out_date);
  const order = Object.assign({
    order_id: createId('RES'),
    reservation_type: 'accommodation',
    customer_type: user.customer_type,
    room_ids: input.room_ids,
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
  const order_id = input.order_id;
  const orders = getOrders();
  const order = orders.find((entry) => entry.order_id === order_id);
  assert(order, 'RESERVATION_NOT_FOUND', '未找到预订订单');
  order.reservation_status = 'paid_pending_confirmation';
  order.settlement_status = 'wechat_paid';
  delete order.hold_expires_at;
  save(orders);
  return order;
}

async function listReservations() { return getOrders(); }
async function getReservationDetail(input) {
  const order_id = input.order_id;
  const order = getOrders().find((entry) => entry.order_id === order_id);
  assert(order, 'RESERVATION_NOT_FOUND', '未找到预订订单');
  return order;
}

module.exports = {
  getDiningRoomSelectionLimit,
  listDiningRooms,
  listAvailableDiningRooms,
  listAvailableAccommodationRooms,
  createDiningReservation,
  createAccommodationReservation,
  simulateWechatPay,
  listReservations,
  getReservationDetail,
};
