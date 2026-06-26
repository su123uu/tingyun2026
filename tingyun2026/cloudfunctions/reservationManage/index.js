const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ACTIVE_STATUSES = ['paid_pending_confirmation', 'pending_confirmation', 'confirmed'];
const DINING_SLOT_TIME = {
  lunch: ['11:30', '14:00'],
  dinner: ['17:00', '21:00'],
};
const DEFAULT_ENV_ID = 'cloud1-d6gzs6wuu4b4e902e';
const DEFAULT_PAY_SUB_MCH_ID = '1113835285';
const PAY_CALLBACK_FUNCTION = 'payCallback';

function now() {
  return new Date();
}

function ok(data) {
  return { ok: true, data };
}

function fail(message, code = 'BAD_REQUEST') {
  return { ok: false, code, message };
}

function assert(condition, code, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function assertMobile(mobile) {
  assert(/^1[3-9]\d{9}$/.test(String(mobile || '')), 'INVALID_MOBILE', '请输入正确的手机号');
}

function parseDate(date, code = 'INVALID_DATE_RANGE') {
  const value = cleanText(date, 20);
  const parsed = new Date(`${value}T00:00:00+08:00`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()), code, '请选择正确的日期');
  return parsed;
}

function getNights(checkInDate, checkOutDate) {
  const start = parseDate(checkInDate);
  const end = parseDate(checkOutDate);
  assert(end > start, 'INVALID_DATE_RANGE', '离店日期必须晚于入住日期');
  return Math.round((end - start) / 86400000);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function businessTimestamp(date) {
  return [
    String(date.getFullYear()).slice(-2),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function randomCode(length) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function createBusinessId(prefix) {
  return `${prefix}${businessTimestamp(now())}${randomCode(3)}`;
}

function moneyToCents(value) {
  return Math.round(toNumber(value, 0) * 100);
}

function getPaySubMchId() {
  return process.env.WECHAT_PAY_SUB_MCH_ID || DEFAULT_PAY_SUB_MCH_ID;
}

function getPayEnvId() {
  return process.env.WX_CLOUD_ENV_ID || process.env.TCB_ENV || DEFAULT_ENV_ID;
}

function getPayCallbackFunction() {
  return process.env.WECHAT_PAY_CALLBACK_FUNCTION || PAY_CALLBACK_FUNCTION;
}

async function safeCallNotification(data) {
  try {
    return await cloud.callFunction({
      name: 'notificationManage',
      data,
    });
  } catch (error) {
    console.warn('notificationManage skipped', data && data.action, error);
    return null;
  }
}

async function safePrintReservationOrder(orderNo) {
  try {
    return await cloud.callFunction({
      name: 'payCallback',
      data: {
        action: 'printReservationOrder',
        order_no: orderNo,
      },
    });
  } catch (error) {
    console.warn('payCallback printReservationOrder skipped', orderNo, error);
    return null;
  }
}

function diningRoomSelectionLimit(peopleCount, roomCount) {
  if (peopleCount <= 12) return 1;
  if (peopleCount <= 22) return 2;
  return roomCount;
}

function isActiveReservation(order) {
  return Boolean(order && ACTIVE_STATUSES.includes(order.reservation_status));
}

function overlaps(startA, endA, startB, endB) {
  return Date.parse(`${startA}T00:00:00+08:00`) < Date.parse(`${endB}T00:00:00+08:00`)
    && Date.parse(`${startB}T00:00:00+08:00`) < Date.parse(`${endA}T00:00:00+08:00`);
}

function dateTime(date, time) {
  return new Date(`${date}T${time}:00+08:00`);
}

function normalizeCloudDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeBaseRoom(room) {
  const imageUrls = Array.isArray(room.image_urls) ? room.image_urls.filter(Boolean) : [];
  const images = imageUrls.length ? imageUrls : [room.image || room.image_url || ''].filter(Boolean);
  return Object.assign({}, room, {
    image_urls: images,
    image: room.image || room.image_url || images[0] || '',
    is_available: room.is_available !== false,
  });
}

function isCloudFile(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

async function resolveCloudImages(items, fields) {
  const rows = Array.isArray(items) ? items : [];
  const fileIDs = [];
  rows.forEach((item) => {
    fields.forEach((field) => {
      const values = Array.isArray(item[field]) ? item[field] : [item[field]];
      values.forEach((value) => {
        if (isCloudFile(value)) fileIDs.push(value);
      });
    });
  });
  if (!fileIDs.length) return rows;

  const tempResult = await cloud.getTempFileURL({ fileList: Array.from(new Set(fileIDs)) });
  const urlMap = {};
  (Array.isArray(tempResult.fileList) ? tempResult.fileList : []).forEach((file) => {
    if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });

  return rows.map((item) => {
    const next = Object.assign({}, item);
    fields.forEach((field) => {
      if (Array.isArray(next[field])) {
        next[field] = next[field].map((value) => urlMap[value] || value);
        return;
      }
      if (urlMap[next[field]]) next[field] = urlMap[next[field]];
    });
    if (Array.isArray(next.image_urls) && next.image_urls.length) next.image = next.image_urls[0];
    if (next.image_url && !next.image) next.image = next.image_url;
    return next;
  });
}

async function listCollection(collectionName, where = {}, orderFields = []) {
  let query = db.collection(collectionName).where(Object.assign({ is_deleted: _.neq(true) }, where));
  orderFields.forEach(([field, direction]) => {
    query = query.orderBy(field, direction);
  });
  const result = await query.limit(100).get();
  return result.data || [];
}

async function findActiveMember(mobile) {
  const cleanMobile = cleanText(mobile, 20);
  if (!cleanMobile) return null;
  const result = await db.collection('members')
    .where({ mobile: cleanMobile, member_status: 'active', is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function findActiveMemberById(memberId) {
  const cleanMemberId = cleanText(memberId, 120);
  if (!cleanMemberId) return null;
  const result = await db.collection('members')
    .where({ member_id: cleanMemberId, member_status: 'active', is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function userUpdateData(existing = {}, profile = {}) {
  const timestamp = now();
  const data = {
    last_login_at: timestamp,
    updated_at: timestamp,
    is_deleted: false,
  };
  const mobile = cleanText(profile.mobile, 20);
  const nickname = cleanText(profile.nickname || profile.member_name || profile.contact_name, 80);
  const avatarUrl = cleanText(profile.avatar_url, 300);
  const memberId = cleanText(profile.member_id, 120);
  const customerType = cleanText(profile.customer_type, 20);
  const lastContactName = cleanText(profile.last_contact_name, 80);
  const lastContactMobile = cleanText(profile.last_contact_mobile, 20);

  if (mobile) data.mobile = mobile;
  if (nickname) data.nickname = nickname;
  if (avatarUrl) data.avatar_url = avatarUrl;
  if (lastContactName) data.last_contact_name = lastContactName;
  if (lastContactMobile) data.last_contact_mobile = lastContactMobile;
  if (customerType === 'member') {
    data.customer_type = 'member';
    data.member_id = memberId;
  } else if (customerType === 'guest') {
    data.customer_type = existing.customer_type === 'member' && !mobile ? existing.customer_type : 'guest';
    if (mobile || profile.clear_member === true) data.member_id = '';
  }

  return data;
}

async function ensureUser(wxContext = {}, profile = {}) {
  const openid = cleanText(wxContext.OPENID || profile.openid, 120);
  if (!openid) return null;

  const result = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get();
  const existing = result.data && result.data[0];
  const data = userUpdateData(existing || {}, profile);

  if (existing && existing._id) {
    await db.collection('users').doc(existing._id).update({ data });
    return Object.assign({}, existing, data);
  }

  const created = Object.assign({
    user_id: openid,
    openid,
    mobile: '',
    nickname: '',
    avatar_url: '',
    member_id: '',
    customer_type: 'guest',
    created_at: now(),
  }, data);
  await db.collection('users').add({ data: created });
  return created;
}

async function getUserByOpenid(wxContext = {}) {
  const openid = cleanText(wxContext.OPENID, 120);
  if (!openid) return null;
  const result = await db.collection('users')
    .where({ openid, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function getCustomer(input = {}, wxContext = {}) {
  const user = await getUserByOpenid(wxContext);
  const member = await findActiveMemberById(user && user.member_id) || await findActiveMember(user && user.mobile);
  return member
    ? {
      customer_type: 'member',
      member_id: member.member_id,
      member_name: member.member_name,
      mobile: member.mobile,
    }
    : {
      customer_type: 'guest',
      member_id: '',
      member_name: '',
      mobile: '',
    };
}

async function getContactProfile(wxContext = {}) {
  const user = await getUserByOpenid(wxContext);
  if (!user) {
    return {
      contact_name: '',
      mobile: '',
      has_contact: false,
    };
  }
  const contactName = cleanText(user.last_contact_name, 80);
  const contactMobile = cleanText(user.last_contact_mobile, 20);
  return {
    contact_name: contactName,
    mobile: contactMobile,
    has_contact: Boolean(contactName || contactMobile),
  };
}

function statusFields(customerType) {
  if (customerType === 'member') {
    return {
      reservation_status: 'pending_confirmation',
      payment_status: 'offline_pending',
      lock_expires_at: null,
    };
  }
  return {
    reservation_status: 'pending_payment',
    payment_status: 'pending_wechat_pay',
    lock_expires_at: null,
  };
}

function reservationPublicShape(order, type) {
  const orderNo = order.order_no || order.reservation_id;
  const common = {
    _id: order._id,
    order_no: orderNo,
    order_id: orderNo,
    reservation_type: type,
    customer_type: order.customer_type || 'guest',
    member_id: order.member_id || '',
    contact_name: order.contact_name || order.customer_name || '',
    mobile: order.mobile || order.customer_mobile || '',
    people_count: order.people_count || order.guest_count || 0,
    amount: order.amount || 0,
    reservation_status: order.reservation_status,
    payment_status: order.payment_status || '',
    lock_expires_at: normalizeCloudDate(order.lock_expires_at),
    remark: order.remark || '',
    admin_remark: order.admin_remark || '',
    created_at: normalizeCloudDate(order.created_at),
    updated_at: normalizeCloudDate(order.updated_at),
  };
  if (type === 'dining') {
    return Object.assign(common, {
      room_ids: order.room_ids || (order.room_id ? [order.room_id] : []),
      date: order.date || order.reservation_date || '',
      time_slot: order.time_slot || order.reservation_time || '',
      start_at: normalizeCloudDate(order.start_at),
      end_at: normalizeCloudDate(order.end_at),
      meal_standard_id: order.meal_standard_id || '',
      meal_standard_name: order.meal_standard_name || '',
    });
  }
  return Object.assign(common, {
    room_ids: order.room_ids || (order.room_id ? [order.room_id] : []),
    check_in_date: order.check_in_date || order.checkin_date || '',
    check_out_date: order.check_out_date || order.checkout_date || '',
    nights: order.nights || 0,
    nightly_amount: order.nightly_amount || 0,
    benefit_account_id: order.benefit_account_id || '',
    benefit_discount_amount: order.benefit_discount_amount || 0,
  });
}

async function activeDiningReservations(input) {
  const rows = await listCollection('dining_reservations', {
    date: cleanText(input.date, 20),
    time_slot: cleanText(input.time_slot, 20),
  });
  return rows.filter(isActiveReservation);
}

async function activeAccommodationReservations() {
  const rows = await listCollection('accommodation_reservations');
  return rows.filter(isActiveReservation);
}

async function assertReservationRoomsAvailable(found) {
  const order = found.order || {};
  const roomIds = order.room_ids || (order.room_id ? [order.room_id] : []);
  if (found.type === 'dining') {
    const activeReservations = await activeDiningReservations({
      date: order.date || order.reservation_date,
      time_slot: order.time_slot || order.reservation_time,
    });
    const conflict = activeReservations.some((entry) => (
      entry._id !== order._id
      && (entry.room_ids || (entry.room_id ? [entry.room_id] : [])).some((roomId) => roomIds.includes(roomId))
    ));
    assert(!conflict, 'ROOM_ALREADY_BOOKED', '所选包间已被预订，请重新选择');
    return;
  }
  const checkInDate = order.check_in_date || order.checkin_date;
  const checkOutDate = order.check_out_date || order.checkout_date;
  const activeReservations = await activeAccommodationReservations();
  const conflict = activeReservations.some((entry) => (
    entry._id !== order._id
    && (entry.room_ids || (entry.room_id ? [entry.room_id] : [])).some((roomId) => roomIds.includes(roomId))
    && overlaps(checkInDate, checkOutDate, entry.check_in_date || entry.checkin_date, entry.check_out_date || entry.checkout_date)
  ));
  assert(!conflict, 'ROOM_ALREADY_BOOKED', '所选房间已被预订，请重新选择');
}

async function listDiningRooms(input = {}) {
  const date = cleanText(input.date, 20);
  const timeSlot = cleanText(input.time_slot, 20);
  const peopleCount = toNumber(input.people_count, 0);
  parseDate(date);
  assert(DINING_SLOT_TIME[timeSlot], 'DINING_TIME_SLOT_REQUIRED', '请选择用餐时段');
  assert(peopleCount >= 6, 'DINING_MIN_PEOPLE', '用餐预订至少需要 6 人');

  const [rooms, activeReservations] = await Promise.all([
    listCollection('dining_rooms', {}, [['sort_order', 'asc']]),
    activeDiningReservations({ date, time_slot: timeSlot }),
  ]);
  const limit = diningRoomSelectionLimit(peopleCount, rooms.length);
  const roomStates = rooms.map((room) => {
    const normalized = normalizeBaseRoom(room);
    const isBooked = activeReservations.some((order) => (order.room_ids || []).includes(room.room_id));
    const isPeopleSuitable = limit > 1 || toNumber(room.max_capacity, 0) >= peopleCount;
    const isSelectable = normalized.is_available && !isBooked && isPeopleSuitable;
    return Object.assign(normalized, {
      is_booked: !normalized.is_available || isBooked,
      is_people_suitable: isPeopleSuitable,
      is_selectable: isSelectable,
      disabled_reason: !normalized.is_available || isBooked ? '已预订' : (isPeopleSuitable ? '' : '人数不合适'),
    });
  });
  return await resolveCloudImages(roomStates, ['image_url', 'image', 'image_urls']);
}

async function listAvailableDiningRooms(input = {}) {
  const rooms = await listDiningRooms(input);
  return rooms.filter((room) => room.is_selectable);
}

async function listAvailableBenefits(input = {}, wxContext = {}) {
  const customer = await getCustomer(input, wxContext);
  if (customer.customer_type !== 'member') return [];
  const rows = await listCollection('member_benefit_accounts', {
    member_id: customer.member_id,
    benefit_key: 'free_accommodation',
    account_status: 'active',
  });
  return rows
    .filter((account) => toNumber(account.remaining_quota, 0) > 0)
    .map((account) => ({
      benefit_account_id: account.benefit_account_id,
      benefit_key: account.benefit_key,
      benefit_name: account.benefit_name,
      remaining_quota: account.remaining_quota,
      quota_unit: account.quota_unit,
      rule: account.rule_snapshot || account.rule || {},
    }));
}

async function listAccommodationRooms(input = {}, wxContext = {}) {
  const checkInDate = cleanText(input.check_in_date || input.checkin_date, 20);
  const checkOutDate = cleanText(input.check_out_date || input.checkout_date, 20);
  if (checkInDate || checkOutDate) getNights(checkInDate, checkOutDate);

  const [rooms, activeReservations, availableBenefits] = await Promise.all([
    listCollection('accommodation_rooms', {}, [['sort_order', 'asc']]),
    activeAccommodationReservations(),
    listAvailableBenefits(input, wxContext),
  ]);
  const roomList = rooms.map((room) => {
    const normalized = normalizeBaseRoom(room);
    const isBooked = checkInDate && checkOutDate && activeReservations.some((order) => (
      (order.room_ids || []).includes(room.room_id)
      && overlaps(checkInDate, checkOutDate, order.check_in_date || order.checkin_date, order.check_out_date || order.checkout_date)
    ));
    return Object.assign(normalized, {
      is_booked: !normalized.is_available || isBooked,
      is_selectable: normalized.is_available && !isBooked,
      disabled_reason: !normalized.is_available || isBooked ? '已预订' : '',
    });
  });
  return {
    rooms: await resolveCloudImages(roomList, ['image_url', 'image', 'image_urls']),
    available_benefits: availableBenefits,
  };
}

function requireRoomSelection(selectedIds, selectedRooms, label) {
  assert(selectedIds.length, 'ROOM_REQUIRED', `请选择${label}`);
  assert(selectedRooms.length === selectedIds.length, 'ROOM_INVALID', `所选${label}不存在`);
  assert(selectedRooms.every((room) => room.is_selectable), 'ROOM_ALREADY_BOOKED', `所选${label}已被预订，请重新选择`);
}

async function createDiningReservation(input = {}, wxContext = {}) {
  const date = cleanText(input.date, 20);
  const timeSlot = cleanText(input.time_slot, 20);
  const peopleCount = toNumber(input.people_count, 0);
  const contactName = cleanText(input.contact_name || input.customer_name, 80);
  const mobile = cleanText(input.mobile || input.customer_mobile, 20);
  const mealStandardId = cleanText(input.meal_standard_id, 80);
  const selectedIds = Array.from(new Set((input.room_ids || []).map((id) => cleanText(id, 80)).filter(Boolean)));

  assert(contactName, 'CONTACT_REQUIRED', '请填写联系人');
  assertMobile(mobile);
  assert(peopleCount >= 6, 'DINING_MIN_PEOPLE', '用餐预订至少需要 6 人');

  const [roomStates, standards, customer] = await Promise.all([
    listDiningRooms({ date, time_slot: timeSlot, people_count: peopleCount }),
    listCollection('dining_standards', { is_enabled: true }, [['sort_order', 'asc']]),
    getCustomer({}, wxContext),
  ]);
  const selectedRooms = roomStates.filter((room) => selectedIds.includes(room.room_id));
  const standard = standards.find((entry) => entry.meal_standard_id === mealStandardId);
  const limit = diningRoomSelectionLimit(peopleCount, roomStates.length);

  requireRoomSelection(selectedIds, selectedRooms, '包间');
  assert(standard, 'MEAL_STANDARD_REQUIRED', '请选择餐标');
  assert(selectedRooms.length <= limit, 'ROOM_SELECTION_LIMIT', '所选包间数量超过当前人数限制');
  assert(selectedRooms.every((room) => room.is_people_suitable), 'ROOM_PEOPLE_NOT_SUITABLE', '所选包间人数不合适');
  assert(selectedRooms.reduce((sum, room) => sum + toNumber(room.max_capacity, 0), 0) >= peopleCount, 'ROOM_CAPACITY_NOT_ENOUGH', '所选包间总容量不足');

  await ensureUser(wxContext, {
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    member_name: customer.member_name,
    mobile: customer.mobile,
    last_contact_name: contactName,
    last_contact_mobile: mobile,
    clear_member: customer.customer_type === 'guest',
  });

  const orderNo = createBusinessId('TYY');
  const slotTime = DINING_SLOT_TIME[timeSlot];
  const data = Object.assign({
    order_no: orderNo,
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    contact_name: contactName,
    mobile,
    room_ids: selectedIds,
    room_name: selectedRooms.map((room) => room.name).join('、'),
    date,
    time_slot: timeSlot,
    start_at: dateTime(date, slotTime[0]),
    end_at: dateTime(date, slotTime[1]),
    people_count: peopleCount,
    meal_standard_id: mealStandardId,
    meal_standard_name: standard.name || '',
    amount: peopleCount * toNumber(standard.price_per_person, 0),
    remark: cleanText(input.remark, 200),
    admin_remark: '',
    created_by_openid: wxContext.OPENID || '',
    created_at: now(),
    updated_at: now(),
    is_deleted: false,
  }, statusFields(customer.customer_type));

  await db.collection('dining_reservations').add({ data });
  await safeCallNotification({
    action: 'registerSubscription',
    business_type: 'dining_reservation',
    business_no: orderNo,
    openid: wxContext.OPENID || '',
    template_keys: customer.customer_type === 'member'
      ? ['diningReservationStatus', 'memberConsumption']
      : ['diningReservationStatus'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/reservation-detail/reservation-detail?id=${orderNo}`,
  });
  if (data.payment_status === 'offline_pending') {
    await safeCallNotification({
      action: 'sendStaffNotification',
      business_type: 'dining_reservation',
      business_no: orderNo,
      title: '餐厅预订已支付',
      payload: data,
    });
    await safePrintReservationOrder(orderNo);
  }
  return reservationPublicShape(data, 'dining');
}

function accommodationPrice(rooms, customerType, checkInDate, checkOutDate) {
  const nights = getNights(checkInDate, checkOutDate);
  const field = customerType === 'member' ? 'member_price' : 'regular_price';
  const nightlyAmount = rooms.reduce((sum, room) => sum + toNumber(room[field], 0), 0);
  return { nights, nightly_amount: nightlyAmount, amount: nightlyAmount * nights };
}

async function lockAccommodationBenefit(input, customer, orderNo, amount) {
  const benefitAccountId = cleanText(input.benefit_account_id, 100);
  if (!benefitAccountId) return { benefit_account_id: '', benefit_discount_amount: 0 };

  const result = await db.collection('member_benefit_accounts')
    .where({ benefit_account_id: benefitAccountId, benefit_key: 'free_accommodation', account_status: 'active', is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const account = result.data && result.data[0];
  assert(account, 'BENEFIT_NOT_FOUND', '未找到可用住宿权益');
  assert(account.member_id === customer.member_id, 'BENEFIT_FORBIDDEN', '住宿权益不属于当前会员');
  assert(toNumber(account.remaining_quota, 0) > 0, 'BENEFIT_NOT_ENOUGH', '住宿权益剩余次数不足');

  await db.collection('member_benefit_accounts').doc(account._id).update({
    data: {
      remaining_quota: _.inc(-1),
      locked_quota: _.inc(1),
      updated_at: now(),
    },
  });
  await db.collection('member_benefit_usage_records').add({
    data: {
      usage_record_id: `MBUR_${Date.now()}_${randomCode(4)}`,
      benefit_account_id: benefitAccountId,
      member_id: account.member_id,
      benefit_key: account.benefit_key,
      benefit_name: account.benefit_name,
      business_type: 'accommodation_reservation',
      business_order_no: orderNo,
      usage_status: 'locked',
      locked_at: now(),
      quantity: 1,
      amount,
      created_at: now(),
      updated_at: now(),
      is_deleted: false,
    },
  });
  return { benefit_account_id: benefitAccountId, benefit_discount_amount: amount };
}

async function createAccommodationReservation(input = {}, wxContext = {}) {
  const checkInDate = cleanText(input.check_in_date || input.checkin_date, 20);
  const checkOutDate = cleanText(input.check_out_date || input.checkout_date, 20);
  const peopleCount = Math.max(1, toNumber(input.people_count, 1));
  const contactName = cleanText(input.contact_name || input.customer_name, 80);
  const mobile = cleanText(input.mobile || input.customer_mobile, 20);
  const selectedIds = Array.from(new Set((input.room_ids || []).map((id) => cleanText(id, 80)).filter(Boolean)));

  assert(contactName, 'CONTACT_REQUIRED', '请填写联系人');
  assertMobile(mobile);
  const nights = getNights(checkInDate, checkOutDate);

  const customer = await getCustomer({}, wxContext);
  const availability = await listAccommodationRooms({ check_in_date: checkInDate, check_out_date: checkOutDate, mobile }, wxContext);
  const selectedRooms = availability.rooms.filter((room) => selectedIds.includes(room.room_id));
  requireRoomSelection(selectedIds, selectedRooms, '房间');

  await ensureUser(wxContext, {
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    member_name: customer.member_name,
    mobile: customer.mobile,
    last_contact_name: contactName,
    last_contact_mobile: mobile,
    clear_member: customer.customer_type === 'guest',
  });

  const price = accommodationPrice(selectedRooms, customer.customer_type, checkInDate, checkOutDate);
  const orderNo = createBusinessId('TYZ');
  const benefit = customer.customer_type === 'member'
    ? await lockAccommodationBenefit(input, customer, orderNo, price.amount)
    : { benefit_account_id: '', benefit_discount_amount: 0 };
  const amount = Math.max(0, price.amount - benefit.benefit_discount_amount);

  const data = Object.assign({
    order_no: orderNo,
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    contact_name: contactName,
    mobile,
    room_ids: selectedIds,
    room_name: selectedRooms.map((room) => room.name).join('、'),
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    people_count: peopleCount,
    nights,
    nightly_amount: price.nightly_amount,
    amount,
    benefit_account_id: benefit.benefit_account_id,
    benefit_discount_amount: benefit.benefit_discount_amount,
    remark: cleanText(input.remark, 200),
    admin_remark: '',
    created_by_openid: wxContext.OPENID || '',
    created_at: now(),
    updated_at: now(),
    is_deleted: false,
  }, statusFields(customer.customer_type));

  await db.collection('accommodation_reservations').add({ data });
  await safeCallNotification({
    action: 'registerSubscription',
    business_type: 'accommodation_reservation',
    business_no: orderNo,
    openid: wxContext.OPENID || '',
    template_keys: customer.customer_type === 'member'
      ? ['reservationStatus', 'memberConsumption']
      : ['reservationStatus'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/reservation-detail/reservation-detail?id=${orderNo}`,
  });
  if (data.payment_status === 'offline_pending') {
    await safeCallNotification({
      action: 'sendStaffNotification',
      business_type: 'accommodation_reservation',
      business_no: orderNo,
      title: '住宿预订已支付',
      payload: data,
    });
    await safePrintReservationOrder(orderNo);
  }
  return reservationPublicShape(data, 'accommodation');
}

async function findReservation(orderNo) {
  const collections = [
    ['dining_reservations', 'dining'],
    ['accommodation_reservations', 'accommodation'],
  ];
  for (const [collectionName, type] of collections) {
    const result = await db.collection(collectionName)
      .where({ order_no: orderNo, is_deleted: _.neq(true) })
      .limit(1)
      .get();
    if (result.data && result.data.length) return { collectionName, type, order: result.data[0] };
  }
  return null;
}

async function createReservationPayment(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id || input.reservation_id, 100);
  assert(orderNo, 'ORDER_NO_REQUIRED', 'Missing reservation order number.');
  const found = await findReservation(orderNo);
  assert(found, 'RESERVATION_NOT_FOUND', 'Reservation order not found.');
  assert(!found.order.user_deleted_at, 'RESERVATION_NOT_FOUND', 'Reservation order not found.');
  assert(found.order.created_by_openid === wxContext.OPENID, 'FORBIDDEN', 'No permission to pay this reservation.');
  assert(found.order.customer_type !== 'member', 'PAYMENT_NOT_REQUIRED', 'Member reservations are settled offline.');
  assert(found.order.reservation_status === 'pending_payment', 'INVALID_STATUS', 'This reservation does not need payment.');
  assert(found.order.payment_status !== 'settled', 'ORDER_ALREADY_PAID', 'Reservation already paid.');
  await assertReservationRoomsAvailable(found);

  const totalFee = moneyToCents(found.order.amount);
  assert(totalFee > 0, 'INVALID_PAY_AMOUNT', 'Payment amount must be greater than 0.');
  assert(cloud.cloudPay && cloud.cloudPay.unifiedOrder, 'CLOUD_PAY_UNAVAILABLE', 'cloudPay.unifiedOrder is unavailable.');

  const typeLabel = found.type === 'dining' ? 'dining reservation' : 'accommodation reservation';
  const payResult = await cloud.cloudPay.unifiedOrder({
    body: `Tingyun ${typeLabel}-${orderNo}`.slice(0, 120),
    outTradeNo: orderNo,
    spbillCreateIp: cleanText(input.spbill_create_ip, 64) || '127.0.0.1',
    subMchId: getPaySubMchId(),
    totalFee,
    envId: getPayEnvId(),
    functionName: getPayCallbackFunction(),
    attach: found.type === 'dining' ? 'dining_reservation' : 'accommodation_reservation',
  });

  await db.collection(found.collectionName).doc(found.order._id).update({
    data: {
      payment_status: 'paying',
      payment_trade_no: orderNo,
      payment_total_fee: totalFee,
      payment_sub_mch_id: getPaySubMchId(),
      payment_requested_at: now(),
      updated_at: now(),
    },
  });

  return {
    order_no: orderNo,
    reservation_type: found.type,
    total_fee: totalFee,
    payment: payResult.payment || payResult,
    raw_payment: payResult,
  };
}

async function simulateWechatPay(input = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 100);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findReservation(orderNo);
  assert(found, 'RESERVATION_NOT_FOUND', '未找到预约订单');
  assert(found.order.customer_type !== 'member', 'PAYMENT_NOT_REQUIRED', '会员订单由店员线下核对');
  assert(found.order.reservation_status === 'pending_payment', 'INVALID_STATUS', '当前订单不需要支付');
  await assertReservationRoomsAvailable(found);

  await db.collection(found.collectionName).doc(found.order._id).update({
    data: {
      reservation_status: 'paid_pending_confirmation',
      payment_status: 'settled',
      lock_expires_at: null,
      paid_at: now(),
      updated_at: now(),
    },
  });
  return Object.assign(reservationPublicShape(found.order, found.type), {
    reservation_status: 'paid_pending_confirmation',
    payment_status: 'settled',
    lock_expires_at: '',
    paid_at: now().toISOString(),
  });
}

async function listReservations(input = {}, wxContext = {}) {
  const openid = wxContext.OPENID || '';
  const mobile = cleanText(input.mobile, 20);
  const where = openid ? { created_by_openid: openid } : (mobile ? { mobile } : {});
  const [diningRows, accommodationRows] = await Promise.all([
    listCollection('dining_reservations', where, [['created_at', 'desc']]),
    listCollection('accommodation_reservations', where, [['created_at', 'desc']]),
  ]);
  const visibleDiningRows = diningRows.filter((row) => !row.user_deleted_at);
  const visibleAccommodationRows = accommodationRows.filter((row) => !row.user_deleted_at);
  return visibleDiningRows.map((row) => reservationPublicShape(row, 'dining'))
    .concat(visibleAccommodationRows.map((row) => reservationPublicShape(row, 'accommodation')))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

async function getReservationDetail(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 100);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findReservation(orderNo);
  assert(found, 'RESERVATION_NOT_FOUND', '未找到预约订单');
  const openid = wxContext.OPENID || '';
  const mobile = cleanText(input.mobile, 20);
  const ownerMatched = !openid || found.order.created_by_openid === openid || (mobile && found.order.mobile === mobile);
  assert(ownerMatched, 'FORBIDDEN', '无权查看该预约');
  assert(!found.order.user_deleted_at, 'RESERVATION_NOT_FOUND', '未找到预约订单');
  return reservationPublicShape(found.order, found.type);
}

async function deleteReservation(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 100);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const found = await findReservation(orderNo);
  assert(found, 'RESERVATION_NOT_FOUND', '未找到预约订单');
  const openid = wxContext.OPENID || '';
  const mobile = cleanText(input.mobile, 20);
  const ownerMatched = !openid || found.order.created_by_openid === openid || (mobile && found.order.mobile === mobile);
  assert(ownerMatched, 'FORBIDDEN', '无权删除该预约');
  const deletedAt = now();
  await db.collection(found.collectionName).doc(found.order._id).update({
    data: {
      user_deleted_at: deletedAt,
      user_deleted_by_openid: openid,
      updated_at: now(),
    },
  });
  return { order_no: orderNo, user_deleted_at: deletedAt.toISOString() };
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  const wxContext = cloud.getWXContext();
  try {
    if (action === 'getDiningRoomSelectionLimit') {
      const rooms = await listCollection('dining_rooms');
      return ok(diningRoomSelectionLimit(toNumber(event.people_count, 0), rooms.length));
    }
    if (action === 'listDiningRooms') return ok(await listDiningRooms(event));
    if (action === 'listAvailableDiningRooms') return ok(await listAvailableDiningRooms(event));
    if (action === 'getContactProfile') return ok(await getContactProfile(wxContext));
    if (action === 'listAccommodationRooms') return ok(await listAccommodationRooms(event, wxContext));
    if (action === 'listAvailableAccommodationRooms') return ok(await listAccommodationRooms(event, wxContext));
    if (action === 'createDiningReservation') return ok(await createDiningReservation(event, wxContext));
    if (action === 'createAccommodationReservation') return ok(await createAccommodationReservation(event, wxContext));
    if (action === 'createReservationPayment') return ok(await createReservationPayment(event, wxContext));
    if (action === 'simulateWechatPay') return ok(await simulateWechatPay(event));
    if (action === 'listReservations') return ok(await listReservations(event, wxContext));
    if (action === 'getReservationDetail') return ok(await getReservationDetail(event, wxContext));
    if (action === 'deleteReservation') return ok(await deleteReservation(event, wxContext));
    return fail('不支持的预约操作', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('reservationManage failed', action, error);
    return fail(error.message || '预约操作失败', error.code || 'SERVER_ERROR');
  }
};
