const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ACTIVE_SIGNUP_STATUSES = ['pending_confirmation', 'confirmed', 'completed'];
const DEFAULT_ENV_ID = 'cloud1-d6gzs6wuu4b4e902e';
const DEFAULT_PAY_SUB_MCH_ID = '1113835285';
const PAY_CALLBACK_FUNCTION = 'payCallback';

function now() {
  return new Date();
}

function userVisibleWhere(where = {}) {
  return Object.assign({ user_deleted_at: _.exists(false) }, where);
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

function toSortTime(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sortActivities(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const leftPinned = left.is_pinned === true ? 1 : 0;
    const rightPinned = right.is_pinned === true ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    const startDiff = toSortTime(left.start_at) - toSortTime(right.start_at);
    if (startDiff !== 0) return startDiff;
    return String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hans-CN');
  });
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

function assertMobile(mobile) {
  assert(/^1[3-9]\d{9}$/.test(String(mobile || '')), 'INVALID_MOBILE', '请输入正确的手机号');
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

function normalizeCloudDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return value;
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatActivityDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatActivityClock(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function activityDisplayTime(activity = {}) {
  const startText = formatActivityClock(activity.start_at);
  const endText = formatActivityClock(activity.end_at);
  return {
    date: activity.date || formatActivityDate(activity.start_at),
    time: activity.time || (startText && endText ? `${startText}-${endText}` : startText || endText || ''),
  };
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

async function findUserByOpenid(openid) {
  const cleanOpenid = cleanText(openid, 120);
  if (!cleanOpenid) return null;
  const result = await db.collection('users')
    .where({ openid: cleanOpenid, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function memberCustomer(member) {
  return member
    ? {
      customer_type: 'member',
      member_id: member.member_id,
      member_name: member.member_name,
      mobile: member.mobile,
    }
    : null;
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
  const memberId = cleanText(profile.member_id, 120);
  const customerType = cleanText(profile.customer_type, 20);

  if (mobile) data.mobile = mobile;
  if (nickname) data.nickname = nickname;
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

  const result = await db.collection('users').where({ openid }).limit(1).get();
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

async function getCustomer(input, wxContext = {}) {
  const user = await findUserByOpenid(wxContext.OPENID);
  if (user && (user.customer_type === 'member' || user.member_id)) {
    const member = await findActiveMemberById(user.member_id);
    const customer = memberCustomer(member);
    if (customer) return customer;
  }

  const inputMember = await findActiveMemberById(input.member_id);
  const inputCustomer = memberCustomer(inputMember);
  if (inputCustomer) return inputCustomer;

  const mobileMember = await findActiveMember(input.mobile || input.contact_mobile);
  const mobileCustomer = memberCustomer(mobileMember);
  if (mobileCustomer) return mobileCustomer;

  return {
    customer_type: 'guest',
    member_id: '',
    member_name: '',
    mobile: cleanText(input.mobile || input.contact_mobile, 20),
  };
}

async function findActivity(activityId) {
  const result = await db.collection('activity_items')
    .where({ activity_id: cleanText(activityId, 120), is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const activity = result.data && result.data[0];
  assert(activity, 'ACTIVITY_NOT_FOUND', '未找到活动');
  return activity;
}

async function activeSignupPeopleCount(activityId) {
  const rows = await listCollection('activity_signups', {
    activity_id: cleanText(activityId, 120),
    signup_status: _.in(ACTIVE_SIGNUP_STATUSES),
  });
  return rows
    .filter((row) => !row.user_deleted_at)
    .reduce((sum, row) => sum + toNumber(row.people_count || row.participant_count, 0), 0);
}

async function findExistingActiveSignup(activityId, customer = {}, wxContext = {}, contactMobile = '') {
  const rows = await listCollection('activity_signups', {
    activity_id: cleanText(activityId, 120),
    signup_status: _.in(ACTIVE_SIGNUP_STATUSES),
  });
  const openid = cleanText(wxContext.OPENID, 120);
  const memberId = cleanText(customer.member_id, 120);
  const mobile = cleanText(contactMobile || customer.mobile, 20);
  return rows.find((row) => {
    if (row.user_deleted_at) return false;
    if (openid && row.created_by_openid === openid) return true;
    if (memberId && row.member_id === memberId) return true;
    return Boolean(mobile && (row.mobile === mobile || row.contact_mobile === mobile));
  }) || null;
}

async function remainingFor(activity) {
  const capacity = toNumber(activity.capacity, 0);
  const reserved = toNumber(activity.reserved_count, 0);
  const signed = await activeSignupPeopleCount(activity.activity_id);
  return Math.max(0, capacity - reserved - signed);
}

function activityOpen(activity) {
  if (activity.status && activity.status !== 'open') return false;
  if (!activity.signup_deadline) return true;
  const deadline = activity.signup_deadline instanceof Date
    ? activity.signup_deadline
    : new Date(activity.signup_deadline);
  return Number.isNaN(deadline.getTime()) || deadline >= now();
}

async function activityPublicShape(activity) {
  const remainingCapacity = await remainingFor(activity);
  const rows = await resolveCloudImages([activity], ['image_url', 'video_url', 'intro_images', 'highlight_images']);
  const normalized = rows[0] || activity;
  const displayTime = activityDisplayTime(normalized);
  return Object.assign({}, normalized, {
    date: displayTime.date,
    time: displayTime.time,
    subtitle: normalized.subtitle || normalized.list_description || normalized.description || '',
    intro_text: normalized.intro_text || (Array.isArray(normalized.intro) ? normalized.intro.join('\n\n') : ''),
    intro_images: Array.isArray(normalized.intro_images) ? normalized.intro_images : [],
    highlight_images: Array.isArray(normalized.highlight_images) ? normalized.highlight_images : [],
    remaining_capacity: remainingCapacity,
    can_signup: activityOpen(activity) && remainingCapacity > 0,
    start_at: normalizeCloudDate(activity.start_at),
    end_at: normalizeCloudDate(activity.end_at),
    signup_deadline: normalizeCloudDate(activity.signup_deadline),
  });
}

async function listActivities() {
  const rows = await listCollection('activity_items', { status: _.neq('closed') }, [['start_at', 'asc']]);
  return Promise.all(sortActivities(rows).map(activityPublicShape));
}

async function listActivityBanners() {
  const rows = await listCollection('activity_banners', { is_enabled: true }, [['sort_order', 'asc']]);
  return resolveCloudImages(rows, ['image_url']);
}

async function getActivityDetail(input = {}) {
  return activityPublicShape(await findActivity(input.activity_id));
}

function signupPublicShape(signup, activity) {
  const orderNo = signup.order_no || signup.signup_id;
  const title = signup.activity_title || signup.title || (activity && activity.title) || '';
  const imageUrl = signup.image_url || (activity && activity.image_url) || '';
  const peopleCount = signup.people_count || signup.participant_count || 0;
  const displayTime = activity ? activityDisplayTime(activity) : {};
  return {
    _id: signup._id,
    signup_id: signup.signup_id || orderNo,
    order_no: orderNo,
    activity_id: signup.activity_id,
    activity_title: title,
    title,
    image_url: imageUrl,
    date: signup.date || displayTime.date || '',
    time: signup.time || displayTime.time || '',
    location: signup.location || (activity && activity.location) || '',
    people_count: peopleCount,
    participant_count: peopleCount,
    contact_name: signup.contact_name || '',
    mobile: signup.mobile || signup.contact_mobile || '',
    contact_mobile: signup.contact_mobile || signup.mobile || '',
    customer_type: signup.customer_type || 'guest',
    member_id: signup.member_id || '',
    amount: signup.amount || 0,
    signup_status: signup.signup_status,
    payment_status: signup.payment_status || '',
    remark: signup.remark || '',
    admin_remark: signup.admin_remark || '',
    unit_price: signup.unit_price || 0,
    display_items: signup.display_items || [],
    can_cancel: toNumber(signup.amount, 0) <= 0 && signup.signup_status !== 'cancelled',
    created_at: normalizeCloudDate(signup.created_at),
    updated_at: normalizeCloudDate(signup.updated_at),
  };
}

function activityUnitPrice(activity, customerType) {
  return customerType === 'member'
    ? toNumber(activity.member_price, 0)
    : toNumber(activity.guest_price, 0);
}

async function createSignup(input = {}, wxContext = {}) {
  const activityId = cleanText(input.activity_id, 120);
  const peopleCount = toNumber(input.people_count || input.participant_count, 0);
  const contactName = cleanText(input.contact_name, 80);
  const mobile = cleanText(input.mobile || input.contact_mobile, 20);
  const remark = cleanText(input.remark, 200);

  assert(activityId, 'ACTIVITY_REQUIRED', '请选择活动');
  assert(contactName, 'CONTACT_REQUIRED', '请填写联系人');
  assert(peopleCount > 0, 'ACTIVITY_SIGNUP_LIMIT', '请输入正确的报名人数');
  assertMobile(mobile);

  const activity = await findActivity(activityId);
  assert(activityOpen(activity), 'ACTIVITY_CLOSED', '活动报名已截止');

  const customer = await getCustomer({ mobile, member_id: input.member_id }, wxContext);
  assert(activity.signup_scope !== 'members_only' || customer.customer_type === 'member', 'MEMBERS_ONLY', '该活动仅限会员报名');
  const existingSignup = await findExistingActiveSignup(activity.activity_id, customer, wxContext, mobile);
  assert(!existingSignup, 'ACTIVITY_ALREADY_SIGNED', '你已报名该活动，请勿重复提交');
  const unitPrice = activityUnitPrice(activity, customer.customer_type);
  assert(unitPrice > 0 || peopleCount <= 2, 'ACTIVITY_SIGNUP_LIMIT', '免费活动单次最多报名 2 人');
  assert(await remainingFor(activity) >= peopleCount, 'ACTIVITY_FULL', '活动剩余名额不足');

  await ensureUser(wxContext, {
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    member_name: customer.member_name,
    contact_name: contactName,
    mobile: customer.customer_type === 'member' ? customer.mobile || mobile : mobile,
    clear_member: customer.customer_type === 'guest',
  });

  const amount = unitPrice * peopleCount;
  const displayTime = activityDisplayTime(activity);
  const requiresWechatPay = customer.customer_type !== 'member' && amount > 0;
  const orderNo = createBusinessId('TYW');
  const data = {
    signup_id: orderNo,
    order_no: orderNo,
    activity_id: activity.activity_id,
    activity_title: activity.title,
    title: activity.title,
    image_url: activity.image_url || '',
    date: displayTime.date,
    time: displayTime.time,
    location: activity.location || '',
    contact_name: contactName,
    mobile,
    contact_mobile: mobile,
    people_count: peopleCount,
    participant_count: peopleCount,
    customer_type: customer.customer_type,
    member_id: customer.member_id,
    unit_price: unitPrice,
    amount,
    signup_status: 'pending_confirmation',
    payment_status: requiresWechatPay ? 'pending_wechat_pay' : customer.customer_type === 'member' ? 'offline_pending' : 'settled',
    remark,
    admin_remark: '',
    success_notice_remark: cleanText(activity.success_notice_remark, 200),
    display_items: [{
      id: activity.activity_id,
      image: activity.image_url || '',
      name: activity.title,
      meta: `${displayTime.time} · ${activity.location || ''}`,
    }],
    created_by_openid: wxContext.OPENID || '',
    created_at: now(),
    updated_at: now(),
    is_deleted: false,
  };

  await db.collection('activity_signups').add({ data });
  await safeCallNotification({
    action: 'registerSubscription',
    business_type: 'activity_signup',
    business_no: orderNo,
    openid: wxContext.OPENID || '',
    template_keys: customer.customer_type === 'member'
      ? ['activitySignupSuccess', 'memberConsumption']
      : ['activitySignupSuccess'],
    accepted_template_ids: input.notification_subscriptions && input.notification_subscriptions.accepted_template_ids,
    page: `pages/activity/activity?id=${activity.activity_id}`,
  });
  await safeCallNotification({
    action: 'sendStaffNotification',
    business_type: 'activity_signup',
    business_no: orderNo,
    title: '新活动报名',
    payload: data,
  });
  return signupPublicShape(data, activity);
}

async function findSignup(orderNo) {
  const cleanOrderNo = cleanText(orderNo, 120);
  assert(cleanOrderNo, 'ORDER_NO_REQUIRED', '缺少报名编号');
  const byOrderNo = await db.collection('activity_signups')
    .where({ order_no: cleanOrderNo, is_deleted: _.neq(true) })
    .limit(1)
    .get();
  const bySignupId = byOrderNo.data && byOrderNo.data.length
    ? byOrderNo
    : await db.collection('activity_signups')
      .where({ signup_id: cleanOrderNo, is_deleted: _.neq(true) })
      .limit(1)
      .get();
  const signup = bySignupId.data && bySignupId.data[0];
  assert(signup, 'SIGNUP_NOT_FOUND', '未找到活动报名');
  return signup;
}

async function simulateWechatPay(input = {}) {
  const signup = await findSignup(input.order_no || input.signup_id);
  assert(signup.customer_type !== 'member', 'PAYMENT_NOT_REQUIRED', '会员报名由店员线下核对');
  assert(signup.payment_status === 'pending_wechat_pay', 'INVALID_STATUS', '当前报名不需要支付');
  const paidAt = now();
  await db.collection('activity_signups').doc(signup._id).update({
    data: {
      payment_status: 'settled',
      paid_at: paidAt,
      updated_at: now(),
    },
  });
  return signupPublicShape(Object.assign({}, signup, {
    payment_status: 'settled',
    paid_at: paidAt,
  }));
}

async function createActivityPayment(input = {}, wxContext = {}) {
  const signup = await findSignup(input.order_no || input.signup_id);
  assert(signup.created_by_openid === wxContext.OPENID, 'FORBIDDEN', '无权支付该活动报名');
  assert(signup.customer_type !== 'member', 'PAYMENT_NOT_REQUIRED', '会员活动报名由店员线下核销');
  assert(signup.payment_status === 'pending_wechat_pay', 'INVALID_STATUS', '当前报名不需要支付');
  assert(signup.payment_status !== 'settled', 'ORDER_ALREADY_PAID', '活动报名已支付');

  const totalFee = moneyToCents(signup.amount);
  assert(totalFee > 0, 'INVALID_PAY_AMOUNT', '支付金额必须大于 0 元');
  assert(cloud.cloudPay && cloud.cloudPay.unifiedOrder, 'CLOUD_PAY_UNAVAILABLE', '当前云函数环境不支持 cloudPay.unifiedOrder');

  const orderNo = signup.order_no || signup.signup_id;
  const payResult = await cloud.cloudPay.unifiedOrder({
    body: `停云山居活动-${signup.activity_title || signup.title || ''}`.slice(0, 120),
    outTradeNo: orderNo,
    spbillCreateIp: cleanText(input.spbill_create_ip, 64) || '127.0.0.1',
    subMchId: getPaySubMchId(),
    totalFee,
    envId: getPayEnvId(),
    functionName: getPayCallbackFunction(),
    attach: 'activity_signup',
  });

  await db.collection('activity_signups').doc(signup._id).update({
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
    signup_id: orderNo,
    total_fee: totalFee,
    payment: payResult.payment || payResult,
    raw_payment: payResult,
  };
}

async function cancelSignup(input = {}, wxContext = {}) {
  const signup = await findSignup(input.order_no || input.signup_id);
  const openid = wxContext.OPENID || '';
  const mobile = cleanText(input.mobile, 20);
  const ownerMatched = !openid || signup.created_by_openid === openid || (mobile && (signup.mobile === mobile || signup.contact_mobile === mobile));
  assert(ownerMatched, 'FORBIDDEN', '无权取消该报名');
  assert(toNumber(signup.amount, 0) <= 0, 'PAID_ACTIVITY_CANCEL_NEED_CONTACT', '收费活动请联系客服取消');
  assert(signup.signup_status !== 'cancelled', 'SIGNUP_ALREADY_CANCELLED', '该报名已取消');
  const cancelledAt = now();
  await db.collection('activity_signups').doc(signup._id).update({
    data: {
      signup_status: 'cancelled',
      cancelled_at: cancelledAt,
      updated_at: now(),
    },
  });
  return signupPublicShape(Object.assign({}, signup, { signup_status: 'cancelled', cancelled_at: cancelledAt }));
}

async function deleteSignup(input = {}, wxContext = {}) {
  const signup = await findSignup(input.order_no || input.signup_id);
  const openid = wxContext.OPENID || '';
  const mobile = cleanText(input.mobile, 20);
  const ownerMatched = !openid || signup.created_by_openid === openid || (mobile && (signup.mobile === mobile || signup.contact_mobile === mobile));
  assert(ownerMatched, 'FORBIDDEN', '无权删除该报名');
  const deletedAt = now();
  await db.collection('activity_signups').doc(signup._id).update({
    data: {
      user_deleted_at: deletedAt,
      user_deleted_by_openid: openid,
      updated_at: now(),
    },
  });
  return { order_no: signup.order_no || signup.signup_id, signup_id: signup.signup_id, user_deleted_at: deletedAt.toISOString() };
}

async function listSignups(input = {}, wxContext = {}) {
  const openid = wxContext.OPENID || '';
  const mobile = cleanText(input.mobile, 20);
  const where = openid ? { created_by_openid: openid } : (mobile ? { mobile } : {});
  const rows = await listCollection('activity_signups', userVisibleWhere(where), [['created_at', 'desc']]);
  return rows.map((row) => signupPublicShape(row));
}

exports.main = async (event = {}) => {
  const action = event.action || '';
  const wxContext = cloud.getWXContext();
  try {
    if (action === 'listActivities') return ok(await listActivities());
    if (action === 'listActivityBanners') return ok(await listActivityBanners());
    if (action === 'getActivityDetail') return ok(await getActivityDetail(event));
    if (action === 'createSignup') return ok(await createSignup(event, wxContext));
    if (action === 'createActivityPayment') return ok(await createActivityPayment(event, wxContext));
    if (action === 'simulateWechatPay') return ok(await simulateWechatPay(event));
    if (action === 'cancelSignup') return ok(await cancelSignup(event, wxContext));
    if (action === 'deleteSignup') return ok(await deleteSignup(event, wxContext));
    if (action === 'listSignups') return ok(await listSignups(event, wxContext));
    return fail('不支持的活动报名操作', 'UNKNOWN_ACTION');
  } catch (error) {
    console.error('activitySignupManage failed', action, error);
    return fail(error.message || '活动报名操作失败', error.code || 'SERVER_ERROR');
  }
};
