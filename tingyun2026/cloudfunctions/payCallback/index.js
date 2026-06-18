const cloud = require('wx-server-sdk');
const printer = require('./xpyun-printer');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ACTIVE_RESERVATION_STATUSES = ['paid_pending_confirmation', 'pending_confirmation', 'confirmed'];
const ORDERED_SESSION_HOURS = 8;

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

async function findMealOrderByPaymentTradeNo(tradeNo) {
  const cleanTradeNo = cleanText(tradeNo, 160);
  if (!cleanTradeNo) return null;
  const result = await db.collection('meal_orders')
    .where({ payment_trade_no: cleanTradeNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function paymentNoFor(orderNo, batchNo) {
  return `${orderNo}B${batchNo}`;
}

function activeBatches(batches = []) {
  return batches.filter((batch) => !['cancelled', 'canceled'].includes(cleanText(batch.payment_status || batch.settlement_status, 40)));
}

function batchTitle(batchNo) {
  return batchNo === 1 ? '首单' : `加菜第 ${batchNo - 1} 次`;
}

function batchFromOrder(order = {}, batchNo = 1) {
  const orderNo = order.order_no || order.order_id || '';
  const amount = toNumber(order.amount || order.total_amount || order.pay_amount, 0);
  return {
    batch_no: toNumber(order.batch_no, batchNo) || batchNo,
    batch_type: batchNo === 1 ? 'primary' : 'append',
    batch_title: batchTitle(batchNo),
    order_no: orderNo,
    payment_no: order.payment_no || paymentNoFor(orderNo, batchNo),
    items: Array.isArray(order.items) ? order.items : [],
    amount,
    total_amount: amount,
    pay_amount: amount,
    wechat_pay_amount: toNumber(order.wechat_pay_amount, 0),
    remark: order.remark || '',
    quick_remarks: Array.isArray(order.quick_remarks) ? order.quick_remarks : [],
    settlement_status: order.settlement_status || '',
    payment_status: order.payment_status || '',
    order_status: order.order_status || '',
    created_at: order.created_at,
    paid_at: order.paid_at,
    settled_at: order.settled_at,
    print_status: order.print_status || '',
  };
}

function normalizeBatches(order = {}) {
  const orderNo = order.order_no || order.order_id || '';
  if (Array.isArray(order.batches) && order.batches.length) {
    return order.batches.map((batch, index) => {
      const batchNo = toNumber(batch.batch_no, index + 1) || index + 1;
      const amount = toNumber(batch.amount || batch.total_amount || batch.pay_amount, 0);
      return Object.assign({}, batch, {
        batch_no: batchNo,
        batch_type: batch.batch_type || (batchNo === 1 ? 'primary' : 'append'),
        batch_title: batch.batch_title || batchTitle(batchNo),
        order_no: orderNo,
        payment_no: batch.payment_no || paymentNoFor(orderNo, batchNo),
        items: Array.isArray(batch.items) ? batch.items : [],
        amount,
        total_amount: amount,
        pay_amount: amount,
      });
    });
  }
  return [batchFromOrder(order, 1)];
}

function aggregateItemsFromBatches(batches = []) {
  const map = {};
  activeBatches(batches).forEach((batch) => {
    (batch.items || []).forEach((item) => {
      const itemId = item.item_id || item.id;
      if (!itemId) return;
      if (!map[itemId]) map[itemId] = Object.assign({}, item, { quantity: 0, amount: 0 });
      const quantity = toNumber(item.quantity, 0);
      map[itemId].quantity += quantity;
      map[itemId].amount += toNumber(item.amount, toNumber(item.price, 0) * quantity);
    });
  });
  return Object.keys(map).map((itemId) => map[itemId]);
}

function totalAmountFromBatches(batches = []) {
  return activeBatches(batches).reduce((sum, batch) => sum + toNumber(batch.amount || batch.total_amount || batch.pay_amount, 0), 0);
}

function hasPendingWechatBatch(batches = []) {
  return activeBatches(batches).some((batch) => ['pending_wechat_pay', 'paying'].includes(cleanText(batch.payment_status, 40)));
}

async function findMealOrderByTradeNo(tradeNo) {
  const direct = await findMealOrder(tradeNo);
  if (direct) return { order: direct, payment_no: tradeNo };
  const checkout = await findMealOrderByPaymentTradeNo(tradeNo);
  if (checkout) return { order: checkout, payment_no: tradeNo, is_checkout_payment: true };
  const checkoutMatch = /^(.*)C[A-Z0-9]{3}$/.exec(cleanText(tradeNo, 160));
  if (checkoutMatch) {
    const order = await findMealOrder(checkoutMatch[1]);
    if (order) return { order, payment_no: tradeNo, is_checkout_payment: true };
  }
  const match = /^(.*)B(\d+)$/.exec(cleanText(tradeNo, 160));
  if (!match) return { order: null, payment_no: tradeNo };
  const order = await findMealOrder(match[1]);
  return { order, payment_no: tradeNo, batch_no: Number(match[2]) };
}

function batchByPaymentNo(order = {}, paymentNo = '') {
  const batches = normalizeBatches(order);
  return batches.find((batch) => batch.payment_no === paymentNo) || batches.find((batch) => ['pending_wechat_pay', 'paying'].includes(cleanText(batch.payment_status, 40))) || batches[0];
}

function orderForBatchPrint(order = {}, batch = {}) {
  return Object.assign({}, order, batch, {
    order_no: order.order_no || order.order_id,
    order_id: order.order_id || order.order_no,
    items: batch.items || [],
    amount: batch.amount,
    total_amount: batch.amount,
    pay_amount: batch.amount,
    is_append_batch: toNumber(batch.batch_no, 1) > 1,
  });
}

async function markMealSessionOrdered(order) {
  if (!order || !order.session_id) return;
  const result = await db.collection('meal_table_sessions')
    .where({ session_id: order.session_id, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const session = result.data && result.data[0];
  if (!session || !session._id) return;
  await db.collection('meal_table_sessions').doc(session._id).update({
    data: {
      has_order: true,
      ordered_at: now(),
      expires_at: new Date(Date.now() + ORDERED_SESSION_HOURS * 60 * 60 * 1000),
      updated_at: now(),
    },
  });
}

async function closeMealSession(order, reason = 'checkout_settled') {
  if (!order || !order.session_id) return;
  const result = await db.collection('meal_table_sessions')
    .where({ session_id: order.session_id, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const session = result.data && result.data[0];
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

async function safePrintMealOrder(order) {
  if (!order || !order._id) return null;
  if (order.print_status === 'success') return { skipped: true, reason: 'already printed' };

  if (!printer.hasPrinterConfig()) {
    await db.collection('meal_orders').doc(order._id).update({
      data: {
        print_status: 'skipped',
        print_error: 'Missing XPYUN_USER, XPYUN_USER_KEY or XPYUN_PRINTER_SN',
        print_checked_at: now(),
        updated_at: now(),
      },
    });
    return { skipped: true, reason: 'printer config missing' };
  }

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      print_status: 'printing',
      print_error: '',
      print_requested_at: now(),
      updated_at: now(),
    },
  });

  try {
    const result = await printer.printMealOrder(order);
    await db.collection('meal_orders').doc(order._id).update({
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
    console.error('printMealOrder failed', order.order_no || order.order_id, error);
    await db.collection('meal_orders').doc(order._id).update({
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

async function safePrintMealBatch(order, paymentNo = '') {
  if (!order || !order._id) return null;
  const batches = normalizeBatches(order);
  const batch = paymentNo ? batchByPaymentNo(order, paymentNo) : batches[batches.length - 1];
  if (!batch) return null;
  if (batch.print_status === 'success') return { skipped: true, reason: 'already printed' };

  const updateBatch = async (patch) => {
    const nextBatches = batches.map((entry) => (
      entry.payment_no === batch.payment_no ? Object.assign({}, entry, patch) : entry
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
    console.error('printMealBatch failed', order.order_no || order.order_id, batch.payment_no, error);
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

  const batches = normalizeBatches(order);
  if (found.is_checkout_payment || order.payment_trade_no === tradeNo) {
    if (order.payment_status === 'settled') {
      await closeMealSession(order, 'wechat_checkout_paid');
      return { errcode: 0, errmsg: 'already settled' };
    }
    const settledAt = now();
    const totalFee = eventTotalFee || order.payment_total_fee || 0;
    const nextBatches = batches.map((entry) => (
      activeBatches([entry]).length
        ? Object.assign({}, entry, {
          settlement_status: 'settled',
          payment_status: 'settled',
          order_status: 'preparing',
          wechat_transaction_id: transactionId,
          payment_callback_total_fee: totalFee,
          payment_callback_at: settledAt,
          paid_at: settledAt,
          settled_at: settledAt,
          updated_at: settledAt,
        })
        : entry
    ));
    const totalAmount = totalAmountFromBatches(nextBatches);
    const settledOrder = Object.assign({}, order, {
      batches: nextBatches,
      items: aggregateItemsFromBatches(nextBatches),
      amount: totalAmount,
      total_amount: totalAmount,
      pay_amount: totalAmount,
      settlement_status: 'settled',
      payment_status: 'settled',
      order_status: 'preparing',
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      paid_at: settledAt,
      settled_at: settledAt,
    });

    await db.collection('meal_orders').doc(order._id).update({
      data: {
        batches: nextBatches,
        items: settledOrder.items,
        amount: totalAmount,
        total_amount: totalAmount,
        pay_amount: totalAmount,
        settlement_status: 'settled',
        payment_status: 'settled',
        order_status: 'preparing',
        wechat_transaction_id: transactionId,
        payment_callback_total_fee: totalFee,
        payment_callback_at: settledAt,
        paid_at: settledAt,
        settled_at: settledAt,
        updated_at: settledAt,
      },
    });
    await closeMealSession(order, 'wechat_checkout_paid');
    await safeCallNotification({
      action: 'sendStaffNotification',
      business_type: 'meal_order',
      business_no: order.order_no || order.order_id,
      title: '点餐订单已结账',
      payload: settledOrder,
    });
    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'meal_order',
      business_no: order.order_no || order.order_id,
      openid: order.created_by_openid || order.user_id,
      status: 'preparing',
      payload: settledOrder,
    });
    return { errcode: 0, errmsg: 'success' };
  }

  const batch = batchByPaymentNo(order, found.payment_no);
  if (!batch) return { errcode: 0, errmsg: 'meal batch not found ignored' };
  const paymentNo = batch.payment_no || found.payment_no || tradeNo;

  if (batch.payment_status === 'settled') {
    await safePrintMealBatch(order, paymentNo);
    return { errcode: 0, errmsg: 'already settled' };
  }

  const settledAt = now();
  const totalFee = eventTotalFee || batch.payment_total_fee || order.payment_total_fee || 0;
  const nextBatches = batches.map((entry) => (
    entry.payment_no === paymentNo || (found.payment_no === tradeNo && entry.batch_no === batch.batch_no)
      ? Object.assign({}, entry, {
        settlement_status: 'settled',
        payment_status: 'settled',
        order_status: 'preparing',
        wechat_transaction_id: transactionId,
        payment_callback_total_fee: totalFee,
        payment_callback_at: settledAt,
        paid_at: settledAt,
        settled_at: settledAt,
        updated_at: settledAt,
      })
      : entry
  ));
  const settledBatch = nextBatches.find((entry) => entry.payment_no === paymentNo) || nextBatches.find((entry) => entry.batch_no === batch.batch_no) || batch;
  const pendingWechat = hasPendingWechatBatch(nextBatches);
  const totalAmount = totalAmountFromBatches(nextBatches);
  const settledOrder = Object.assign({}, order, {
    batches: nextBatches,
    items: aggregateItemsFromBatches(nextBatches),
    amount: totalAmount,
    total_amount: totalAmount,
    pay_amount: totalAmount,
    settlement_status: pendingWechat ? 'pending_wechat_pay' : 'settled',
    payment_status: pendingWechat ? 'pending_wechat_pay' : 'settled',
    order_status: 'preparing',
    wechat_transaction_id: transactionId,
    payment_callback_total_fee: totalFee,
    paid_at: settledAt,
    settled_at: settledAt,
  });

  await db.collection('meal_orders').doc(order._id).update({
    data: {
      batches: nextBatches,
      items: settledOrder.items,
      amount: totalAmount,
      total_amount: totalAmount,
      pay_amount: totalAmount,
      settlement_status: settledOrder.settlement_status,
      payment_status: settledOrder.payment_status,
      order_status: 'preparing',
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      payment_callback_at: settledAt,
      paid_at: settledAt,
      settled_at: settledAt,
      updated_at: settledAt,
    },
  });
  await markMealSessionOrdered(order);

  const payload = orderForBatchPrint(settledOrder, settledBatch);
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'meal_order',
    business_no: order.order_no || order.order_id,
    title: toNumber(settledBatch.batch_no, 1) > 1 ? '加菜已支付' : '点餐订单已支付',
    payload,
  });

  await safeCallNotification({
    action: 'sendSubscribeNotification',
    business_type: 'meal_order',
    business_no: order.order_no || order.order_id,
    openid: order.created_by_openid || order.user_id,
    status: 'preparing',
    payload: settledOrder,
  });

  await safePrintMealBatch(settledOrder, paymentNo);

  return { errcode: 0, errmsg: 'success' };
}

async function settleActivityPayment(orderNo, transactionId, eventTotalFee) {
  const signup = await findActivitySignup(orderNo);
  if (!signup || !signup._id) return null;
  if (signup.payment_status === 'settled' || signup.settlement_status === 'wechat_paid') {
    return { errcode: 0, errmsg: 'already settled' };
  }

  const totalFee = eventTotalFee || signup.payment_total_fee || 0;
  const paidAt = now();
  const settledSignup = Object.assign({}, signup, {
    settlement_status: 'wechat_paid',
    payment_status: 'settled',
    wechat_transaction_id: transactionId,
    payment_callback_total_fee: totalFee,
    paid_at: paidAt,
    updated_at: paidAt,
  });

  await db.collection('activity_signups').doc(signup._id).update({
    data: {
      settlement_status: 'wechat_paid',
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
    const paymentNo = pick(event, ['payment_no', 'paymentNo']);
    const order = await findMealOrder(orderNo);
    if (!order || !order._id) return { errcode: 0, errmsg: 'meal order not found ignored' };
    await safePrintMealBatch(order, paymentNo);
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

  const orderNo = pick(event, ['out_trade_no', 'outTradeNo', 'outtradeno']);
  if (!orderNo) return { errcode: 0, errmsg: 'missing out_trade_no ignored' };
  if (!isSuccess(event)) return { errcode: 0, errmsg: 'non-success payment ignored' };

  const transactionId = pick(event, ['transaction_id', 'transactionId']);
  const eventTotalFee = Number(pick(event, ['total_fee', 'totalFee'])) || 0;

  const mealResult = await settleMealPayment(orderNo, transactionId, eventTotalFee);
  if (mealResult) return mealResult;

  const activityResult = await settleActivityPayment(orderNo, transactionId, eventTotalFee);
  if (activityResult) return activityResult;

  const order = await findMealOrder(orderNo);
  if (order && order._id) {
    if (order.payment_status === 'settled') {
      await safePrintMealOrder(order);
      return { errcode: 0, errmsg: 'already settled' };
    }
    const totalFee = eventTotalFee || order.payment_total_fee || 0;
    const settledOrder = Object.assign({}, order, {
      settlement_status: 'settled',
      payment_status: 'settled',
      order_status: 'preparing',
      wechat_transaction_id: transactionId,
      payment_callback_total_fee: totalFee,
      paid_at: now(),
      settled_at: now(),
    });

    await db.collection('meal_orders').doc(order._id).update({
      data: {
        settlement_status: 'settled',
        payment_status: 'settled',
        order_status: 'preparing',
        wechat_transaction_id: transactionId,
        payment_callback_total_fee: totalFee,
        payment_callback_at: now(),
        paid_at: now(),
        settled_at: now(),
        updated_at: now(),
      },
    });
    await markMealSessionOrdered(order);

    await safeCallNotification({
      action: 'sendStaffNotification',
      business_type: 'meal_order',
      business_no: orderNo,
      title: '点餐订单已支付',
      payload: settledOrder,
    });

    await safeCallNotification({
      action: 'sendSubscribeNotification',
      business_type: 'meal_order',
      business_no: orderNo,
      openid: order.created_by_openid || order.user_id,
      status: 'preparing',
      payload: settledOrder,
    });

    await safePrintMealOrder(settledOrder);

    return { errcode: 0, errmsg: 'success' };
  }

  const reservation = await findReservation(orderNo);
  if (!reservation || !reservation.order || !reservation.order._id) {
    return { errcode: 0, errmsg: 'order not found ignored' };
  }
  if (reservation.order.payment_status === 'settled' || reservation.order.settlement_status === 'wechat_paid') {
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
      title: '预订已支付需退款',
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

  const settledReservation = Object.assign({}, reservation, {
    order: Object.assign({}, reservation.order, {
      reservation_status: 'paid_pending_confirmation',
      settlement_status: 'wechat_paid',
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
    title: reservation.businessType === 'dining_reservation' ? '餐厅预订已支付' : '住宿预订已支付',
    payload: settledReservation.order,
  });

  await safePrintReservationOrder(settledReservation);

  return { errcode: 0, errmsg: 'success' };
};
