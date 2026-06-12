const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ACTIVE_RESERVATION_STATUSES = ['paid_pending_confirmation', 'pending_confirmation', 'confirmed'];

function now() {
  return new Date();
}

function pick(event, keys) {
  for (const key of keys) {
    if (event && event[key] !== undefined && event[key] !== null && event[key] !== '') {
      return event[key];
    }
  }
  return '';
}

function isSuccess(event = {}) {
  const returnCode = pick(event, ['return_code', 'returnCode']);
  const resultCode = pick(event, ['result_code', 'resultCode']);
  const tradeState = pick(event, ['trade_state', 'tradeState']);
  if (returnCode || resultCode) return returnCode === 'SUCCESS' && resultCode === 'SUCCESS';
  if (tradeState) return tradeState === 'SUCCESS';
  return true;
}

async function findMealOrder(orderNo) {
  const result = await db.collection('meal_orders')
    .where({ order_no: orderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function findReservation(orderNo) {
  const collections = [
    ['dining_reservations', 'dining_reservation'],
    ['accommodation_reservations', 'accommodation_reservation'],
  ];
  for (const [collectionName, businessType] of collections) {
    const result = await db.collection(collectionName)
      .where({ order_no: orderNo, is_deleted: _.neq(true) })
      .limit(1)
      .get();
    if (result.data && result.data[0]) {
      return { collectionName, businessType, order: result.data[0] };
    }
  }
  return null;
}

function overlaps(startA, endA, startB, endB) {
  return Date.parse(`${startA}T00:00:00+08:00`) < Date.parse(`${endB}T00:00:00+08:00`)
    && Date.parse(`${startB}T00:00:00+08:00`) < Date.parse(`${endA}T00:00:00+08:00`);
}

function roomIds(order) {
  return order.room_ids || (order.room_id ? [order.room_id] : []);
}

function isActiveReservation(order) {
  return Boolean(order && ACTIVE_RESERVATION_STATUSES.includes(order.reservation_status));
}

async function hasReservationRoomConflict(reservation) {
  const order = reservation.order || {};
  const selectedRoomIds = roomIds(order);
  if (!selectedRoomIds.length) return false;

  if (reservation.businessType === 'dining_reservation') {
    const result = await db.collection('dining_reservations')
      .where({
        date: order.date || order.reservation_date,
        time_slot: order.time_slot || order.reservation_time,
        is_deleted: _.neq(true),
      })
      .limit(100)
      .get();
    return (result.data || []).filter(isActiveReservation).some((entry) => (
      entry._id !== order._id && roomIds(entry).some((roomId) => selectedRoomIds.includes(roomId))
    ));
  }

  const checkInDate = order.check_in_date || order.checkin_date;
  const checkOutDate = order.check_out_date || order.checkout_date;
  const result = await db.collection('accommodation_reservations')
    .where({ is_deleted: _.neq(true) })
    .limit(100)
    .get();
  return (result.data || []).filter(isActiveReservation).some((entry) => (
    entry._id !== order._id
    && roomIds(entry).some((roomId) => selectedRoomIds.includes(roomId))
    && overlaps(checkInDate, checkOutDate, entry.check_in_date || entry.checkin_date, entry.check_out_date || entry.checkout_date)
  ));
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

exports.main = async (event = {}) => {
  console.log('payCallback event', event);

  const orderNo = pick(event, ['out_trade_no', 'outTradeNo', 'outtradeno']);
  if (!orderNo) return { errcode: 0, errmsg: 'missing out_trade_no ignored' };
  if (!isSuccess(event)) return { errcode: 0, errmsg: 'non-success payment ignored' };

  const transactionId = pick(event, ['transaction_id', 'transactionId']);
  const eventTotalFee = Number(pick(event, ['total_fee', 'totalFee'])) || 0;

  const order = await findMealOrder(orderNo);
  if (order && order._id) {
    if (order.payment_status === 'settled') return { errcode: 0, errmsg: 'already settled' };
    const totalFee = eventTotalFee || order.payment_total_fee || 0;

    await db.collection('meal_orders').doc(order._id).update({
      data: {
        settlement_status: 'settled',
        payment_status: 'settled',
        kitchen_status: 'kitchen_notified',
        order_status: 'kitchen_notified',
        wechat_transaction_id: transactionId,
        payment_callback_total_fee: totalFee,
        payment_callback_at: now(),
        paid_at: now(),
        settled_at: now(),
        updated_at: now(),
      },
    });

    await safeCallNotification({
      action: 'sendStaffNotification',
      business_type: 'meal_order',
      business_no: orderNo,
      title: order.parent_order_no ? 'Paid append meal order' : 'Paid meal order',
      payload: Object.assign({}, order, {
        settlement_status: 'settled',
        payment_status: 'settled',
        kitchen_status: 'kitchen_notified',
        order_status: 'kitchen_notified',
        wechat_transaction_id: transactionId,
      }),
    });

    return { errcode: 0, errmsg: 'success' };
  }

  const reservation = await findReservation(orderNo);
  if (!reservation || !reservation.order || !reservation.order._id) {
    return { errcode: 0, errmsg: 'order not found ignored' };
  }
  if (reservation.order.payment_status === 'settled' || reservation.order.settlement_status === 'wechat_paid') {
    return { errcode: 0, errmsg: 'already settled' };
  }
  const totalFee = eventTotalFee || reservation.order.payment_total_fee || 0;
  const hasConflict = await hasReservationRoomConflict(reservation);

  if (hasConflict) {
    await db.collection(reservation.collectionName).doc(reservation.order._id).update({
      data: {
        reservation_status: 'refunding',
        settlement_status: 'wechat_paid',
        payment_status: 'settled',
        lock_expires_at: null,
        payment_conflict_reason: 'ROOM_ALREADY_BOOKED',
        wechat_transaction_id: transactionId,
        payment_callback_total_fee: totalFee,
        payment_callback_at: now(),
        paid_at: now(),
        updated_at: now(),
      },
    });

    await safeCallNotification({
      action: 'sendStaffNotification',
      business_type: reservation.businessType,
      business_no: orderNo,
      title: 'Paid reservation needs refund',
      payload: Object.assign({}, reservation.order, {
        reservation_status: 'refunding',
        settlement_status: 'wechat_paid',
        payment_status: 'settled',
        payment_conflict_reason: 'ROOM_ALREADY_BOOKED',
        wechat_transaction_id: transactionId,
      }),
    });

    return { errcode: 0, errmsg: 'paid but room unavailable, refund required' };
  }

  await db.collection(reservation.collectionName).doc(reservation.order._id).update({
    data: {
      reservation_status: 'paid_pending_confirmation',
      settlement_status: 'wechat_paid',
      payment_status: 'settled',
      lock_expires_at: null,
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      payment_callback_at: now(),
      paid_at: now(),
      settled_at: now(),
      updated_at: now(),
    },
  });

  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: reservation.businessType,
    business_no: orderNo,
    title: reservation.businessType === 'dining_reservation' ? 'Paid dining reservation' : 'Paid accommodation reservation',
    payload: Object.assign({}, reservation.order, {
      reservation_status: 'paid_pending_confirmation',
      settlement_status: 'wechat_paid',
      payment_status: 'settled',
      wechat_transaction_id: transactionId,
    }),
  });

  return { errcode: 0, errmsg: 'success' };
};
