async function completeMealOrder(input = {}, wxContext = {}) {
  const orderNo = cleanText(input.order_no || input.order_id, 120);
  assert(orderNo, 'ORDER_NO_REQUIRED', '缺少订单编号');
  const order = await findOrder(orderNo);
  assert(order, 'MEAL_ORDER_NOT_FOUND', '未找到点餐订单');
  const completedAt = now();
  const patch = {
    order_status: 'completed',
    updated_at: completedAt,
  };
  await db.collection('meal_orders').doc(order._id).update({ data: patch });
  return Object.assign(orderPublicShape(order), patch);
}
