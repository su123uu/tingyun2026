const cloud = require('wx-server-sdk');
const printer = require('./xpyun-printer');

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

function deepPick(source, keys, depth = 0, seen = new Set()) {
  if (!source || depth > 5 || typeof source !== 'object' || seen.has(source)) return '';
  seen.add(source);
  const direct = pick(source, keys);
  if (direct) return direct;
  const values = Array.isArray(source) ? source : Object.keys(source).map((key) => source[key]);
  for (const value of values) {
    const found = deepPick(value, keys, depth + 1, seen);
    if (found) return found;
  }
  return '';
}

function isSuccess(event = {}) {
  const returnCode = deepPick(event, ['return_code', 'returnCode']);
  const resultCode = deepPick(event, ['result_code', 'resultCode']);
  const tradeState = deepPick(event, ['trade_state', 'tradeState']);
  if (returnCode || resultCode) return returnCode === 'SUCCESS' && resultCode === 'SUCCESS';
  if (tradeState) return tradeState === 'SUCCESS';
  return true;
}

async function findMealOrder(orderNo) {
  const cleanOrderNo = cleanText(orderNo, 160);
  if (!cleanOrderNo) return null;
  let result = await db.collection('meal_orders')
    .where({ order_no: cleanOrderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  if (!result.data || !result.data[0]) {
    result = await db.collection('meal_orders')
      .where({ order_no: cleanOrderNo })
      .limit(1)
      .get();
  }
  const order = result.data && result.data[0] ? result.data[0] : null;
  return order && order.is_deleted !== true ? order : null;
}

async function findMealOrderByOrderId(orderId) {
  const cleanOrderId = cleanText(orderId, 160);
  if (!cleanOrderId) return null;
  let result = await db.collection('meal_orders')
    .where({ order_id: cleanOrderId, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  if (!result.data || !result.data[0]) {
    result = await db.collection('meal_orders')
      .where({ order_id: cleanOrderId })
      .limit(1)
      .get();
  }
  const order = result.data && result.data[0] ? result.data[0] : null;
  return order && order.is_deleted !== true ? order : null;
}

async function findMealOrderByPaymentTradeNo(tradeNo) {
  const cleanTradeNo = cleanText(tradeNo, 160);
  if (!cleanTradeNo) return null;
  let result = await db.collection('meal_orders')
    .where({ payment_trade_no: cleanTradeNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  if (!result.data || !result.data[0]) {
    result = await db.collection('meal_orders')
      .where({ payment_trade_no: cleanTradeNo })
      .limit(1)
      .get();
  }
  const order = result.data && result.data[0] ? result.data[0] : null;
  return order && order.is_deleted !== true ? order : null;
}

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function batchTitle(batchNo) {
  return batchNo === 1 ? '首单' : `加菜第 ${batchNo - 1} 次`;
}

function normalizeBatches(order = {}) {
  if (Array.isArray(order.batches) && order.batches.length) {
    return order.batches.map((batch, index) => {
      const batchNo = toNumber(batch.batch_no, index + 1) || index + 1;
      const amount = toNumber(batch.amount, 0);
      return Object.assign({}, batch, {
        batch_no: batchNo,
        batch_type: batch.batch_type || (batchNo === 1 ? 'primary' : 'append'),
        batch_title: batch.batch_title || batchTitle(batchNo),
        items: Array.isArray(batch.items) ? batch.items : [],
        amount,
      });
    });
  }
  return [];
}

async function findMealOrderByTradeNo(tradeNo) {
  const checkout = await findMealOrderByPaymentTradeNo(tradeNo);
  if (checkout) {
    console.log('meal payment matched by payment_trade_no', tradeNo, checkout.order_no || checkout.order_id);
    return { order: checkout, payment_no: tradeNo, is_checkout_payment: true };
  }
  const directOrder = await findMealOrder(tradeNo) || await findMealOrderByOrderId(tradeNo);
  if (directOrder) {
    console.log('meal payment matched by order no/id', tradeNo, directOrder.order_no || directOrder.order_id);
    return { order: directOrder, payment_no: tradeNo, is_checkout_payment: true };
  }
  const checkoutMatch = /^(.*)C[A-Z0-9]{3}$/.exec(cleanText(tradeNo, 160));
  if (checkoutMatch) {
    const baseOrderNo = checkoutMatch[1];
    const order = await findMealOrder(baseOrderNo) || await findMealOrderByOrderId(baseOrderNo);
    if (order) {
      console.log('meal payment matched by checkout suffix', tradeNo, baseOrderNo, order.order_no || order.order_id);
      return { order, payment_no: tradeNo, is_checkout_payment: true };
    }
  }
  console.warn('meal payment order not found', tradeNo);
  return { order: null, payment_no: tradeNo };
}

function orderForBatchPrint(order = {}, batch = {}) {
  return Object.assign({}, order, batch, {
    order_no: order.order_no || order.order_id,
    order_id: order.order_id || order.order_no,
    items: batch.items || [],
    total_amount: batch.amount,
    is_append_batch: toNumber(batch.batch_no, 1) > 1,
  });
}

async function closeMealSession(order, reason = 'checkout_settled') {
  if (!order) return;
  let result = null;
  if (order.session_id) {
    result = await db.collection('meal_table_sessions')
      .where({ session_id: order.session_id, is_deleted: _.neq(true) })
      .limit(1)
      .get();
  }
  if ((!result || !result.data || !result.data[0]) && order.table_id) {
    result = await db.collection('meal_table_sessions')
      .where({ table_id: order.table_id, session_status: 'active', is_deleted: _.neq(true) })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
  }
  const session = result && result.data && result.data[0];
  if (!session || !session._id) return;
  const closedAt = now();
  await db.collection('meal_table_sessions').doc(session._id).update({
    data: {
      session_status: 'closed',
      closed_reason: reason,
      closed_at: closedAt,
      updated_at: closedAt,
    },
  });
  const tableResult = await db.collection('meal_tables')
    .where({ table_id: session.table_id, current_session_id: session.session_id, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const table = tableResult.data && tableResult.data[0];
  if (table && table._id) {
    await db.collection('meal_tables').doc(table._id).update({
      data: { current_session_id: '', updated_at: closedAt },
    });
  }
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

async function findActivitySignup(orderNo) {
  const result = await db.collection('activity_signups')
    .where({ order_no: orderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
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

async function safePrintMealBatch(order, batchNo = 0) {
  if (!order || !order._id) return null;
  const batches = normalizeBatches(order);
  const batch = Number(batchNo) > 0
    ? batches.find((entry) => toNumber(entry.batch_no, 0) === Number(batchNo))
    : batches[batches.length - 1];
  if (!batch) return null;
  if (batch.print_status === 'success') return { skipped: true, reason: 'already printed' };

  const updateBatch = async (patch) => {
    const nextBatches = batches.map((entry) => (
      entry.batch_no === batch.batch_no ? Object.assign({}, entry, patch) : entry
    ));
    await db.collection('meal_orders').doc(order._id).update({
      data: Object.assign({ batches: nextBatches, updated_at: now() }, patch.order_patch || {}),
    });
  };

  if (!printer.hasPrinterConfig()) {
    await updateBatch({
      print_status: 'skipped',
      print_error: 'Missing XPYUN_USER, XPYUN_USER_KEY or XPYUN_PRINTER_SN',
      print_checked_at: now(),
    });
    return { skipped: true, reason: 'printer config missing' };
  }

  await updateBatch({
    print_status: 'printing',
    print_error: '',
    print_requested_at: now(),
  });

  try {
    const printOrder = orderForBatchPrint(order, batch);
    const result = await printer.printMealOrder(printOrder);
    await updateBatch({
      print_status: 'success',
      print_order_id: result.print_order_id || '',
      print_response: result.response,
      printed_at: now(),
    });
    return result;
  } catch (error) {
    console.error('printMealBatch failed', order.order_no || order.order_id, batch.batch_no, error);
    await updateBatch({
      print_status: 'failed',
      print_error: error.message || 'print failed',
      print_response: error.response || null,
      print_failed_at: now(),
    });
    return { failed: true, message: error.message };
  }
}

async function safePrintReservationOrder(reservation) {
  if (!reservation || !reservation.order || !reservation.order._id) return null;
  const order = reservation.order;
  if (order.print_status === 'success') return { skipped: true, reason: 'already printed' };

  if (!printer.hasPrinterConfig()) {
    await db.collection(reservation.collectionName).doc(order._id).update({
      data: {
        print_status: 'skipped',
        print_error: 'Missing XPYUN_USER, XPYUN_USER_KEY or XPYUN_PRINTER_SN',
        print_checked_at: now(),
        updated_at: now(),
      },
    });
    return { skipped: true, reason: 'printer config missing' };
  }

  await db.collection(reservation.collectionName).doc(order._id).update({
    data: {
      print_status: 'printing',
      print_error: '',
      print_requested_at: now(),
      updated_at: now(),
    },
  });

  try {
    const result = await printer.printReservationOrder(order, reservation.businessType);
    await db.collection(reservation.collectionName).doc(order._id).update({
      data: {
        print_status: 'success',
        print_order_id: result.print_order_id || '',
        print_response: result.response,
        printed_at: now(),
        updated_at: now(),
      },
    });
    return result;
  } catch (error) {
    console.error('printReservationOrder failed', order.order_no || order.reservation_id, error);
    await db.collection(reservation.collectionName).doc(order._id).update({
      data: {
        print_status: 'failed',
        print_error: error.message || 'print failed',
        print_response: error.response || null,
        print_failed_at: now(),
        updated_at: now(),
      },
    });
    return { failed: true, message: error.message };
  }
}

async function settleMealPayment(tradeNo, transactionId, eventTotalFee) {
  const found = await findMealOrderByTradeNo(tradeNo);
  const order = found.order;
  if (!order || !order._id) return null;

  if (!found.is_checkout_payment && order.payment_trade_no !== tradeNo) return null;
  if (order.payment_status === 'settled') {
    if (order.order_status !== 'completed') {
      await db.collection('meal_orders').doc(order._id).update({
        data: { order_status: 'completed', completed_at: now(), updated_at: now() },
      });
    }
    await closeMealSession(order, 'wechat_checkout_paid');
    return { errcode: 0, errmsg: 'already settled' };
  }
  const settledAt = now();
  const totalFee = eventTotalFee || order.payment_total_fee || 0;
  const settledOrder = Object.assign({}, order, {
    order_status: 'completed',
    payment_status: 'settled',
    wechat_transaction_id: transactionId,
    payment_callback_total_fee: totalFee,
    paid_at: settledAt,
    settled_at: settledAt,
  });

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      order_status: 'completed',
      payment_status: 'settled',
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      payment_callback_at: settledAt,
      paid_at: settledAt,
      settled_at: settledAt,
      completed_at: settledAt,
      updated_at: settledAt,
    },
  });
  await closeMealSession(order, 'wechat_checkout_paid');
  console.log('meal payment settled and table close requested', tradeNo, order.order_no || order.order_id, order.table_id || '', order.session_id || '');
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: order.order_no || order.order_id,
    title: '点餐订单已结账',
    payload: settledOrder,
  });
  return { errcode: 0, errmsg: 'success' };
}

async function settleActivityPayment(orderNo, transactionId, eventTotalFee) {
  const signup = await findActivitySignup(orderNo);
  if (!signup || !signup._id) return null;
  if (signup.payment_status === 'settled') {
    return { errcode: 0, errmsg: 'already settled' };
  }

  const totalFee = eventTotalFee || signup.payment_total_fee || 0;
  const paidAt = now();
  const settledSignup = Object.assign({}, signup, {
    payment_status: 'settled',
    wechat_transaction_id: transactionId,
    payment_callback_total_fee: totalFee,
    paid_at: paidAt,
    updated_at: paidAt,
  });

  await db.collection('activity_signups').doc(signup._id).update({
    data: {
      payment_status: 'settled',
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      payment_callback_at: paidAt,
      paid_at: paidAt,
      updated_at: paidAt,
    },
  });

  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'activity_signup',
    business_no: orderNo,
    title: '活动报名已支付',
    payload: settledSignup,
  });

  return { errcode: 0, errmsg: 'success' };
}

exports.main = async (event = {}) => {
  console.log('payCallback event', event);

  const action = event.action || '';
  if (action === 'printMealOrder') {
    const orderNo = pick(event, ['order_no', 'order_id', 'out_trade_no', 'outTradeNo']);
    const batchNo = Number(pick(event, ['batch_no', 'batchNo'])) || 0;
    const order = await findMealOrder(orderNo);
    if (!order || !order._id) return { errcode: 0, errmsg: 'meal order not found ignored' };
    await safePrintMealBatch(order, batchNo);
    return { errcode: 0, errmsg: 'success' };
  }
  if (action === 'printReservationOrder') {
    const orderNo = pick(event, ['order_no', 'order_id', 'out_trade_no', 'outTradeNo']);
    const reservation = await findReservation(orderNo);
    if (!reservation || !reservation.order || !reservation.order._id) {
      return { errcode: 0, errmsg: 'reservation not found ignored' };
    }
    await safePrintReservationOrder(reservation);
    return { errcode: 0, errmsg: 'success' };
  }

  const orderNo = deepPick(event, ['out_trade_no', 'outTradeNo', 'outtradeno', 'out_trade_no_raw']);
  if (!orderNo) return { errcode: 0, errmsg: 'missing out_trade_no ignored' };
  if (!isSuccess(event)) return { errcode: 0, errmsg: 'non-success payment ignored' };

  const transactionId = deepPick(event, ['transaction_id', 'transactionId']);
  const eventTotalFee = Number(deepPick(event, ['total_fee', 'totalFee'])) || 0;

  const mealResult = await settleMealPayment(orderNo, transactionId, eventTotalFee);
  if (mealResult) return mealResult;

  const activityResult = await settleActivityPayment(orderNo, transactionId, eventTotalFee);
  if (activityResult) return activityResult;

  const reservation = await findReservation(orderNo);
  if (!reservation || !reservation.order || !reservation.order._id) {
    return { errcode: 0, errmsg: 'order not found ignored' };
  }
  if (reservation.order.payment_status === 'settled') {
    if (reservation.order.reservation_status !== 'refunding') {
      await safePrintReservationOrder(reservation);
    }
    return { errcode: 0, errmsg: 'already settled' };
  }
  const totalFee = eventTotalFee || reservation.order.payment_total_fee || 0;
  const hasConflict = await hasReservationRoomConflict(reservation);

  if (hasConflict) {
    await db.collection(reservation.collectionName).doc(reservation.order._id).update({
      data: {
        reservation_status: 'refunding',
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
      title: '预订已支付需退款',
      payload: Object.assign({}, reservation.order, {
        reservation_status: 'refunding',
        payment_status: 'settled',
        payment_conflict_reason: 'ROOM_ALREADY_BOOKED',
        wechat_transaction_id: transactionId,
      }),
    });

    return { errcode: 0, errmsg: 'paid but room unavailable, refund required' };
  }

  const settledReservation = Object.assign({}, reservation, {
    order: Object.assign({}, reservation.order, {
      reservation_status: 'paid_pending_confirmation',
      payment_status: 'settled',
      lock_expires_at: null,
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      paid_at: now(),
      settled_at: now(),
    }),
  });

  await db.collection(reservation.collectionName).doc(reservation.order._id).update({
    data: {
      reservation_status: 'paid_pending_confirmation',
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
    title: reservation.businessType === 'dining_reservation' ? '餐厅预订已支付' : '住宿预订已支付',
    payload: settledReservation.order,
  });

  await safePrintReservationOrder(settledReservation);

  return { errcode: 0, errmsg: 'success' };
};
