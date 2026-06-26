const storage = require('../utils/storage');
const createBusinessId = require('../utils/id').createBusinessId;
const validators = require('../utils/validators');
const assert = validators.assert;
const assertMobile = validators.assertMobile;
const auth = require('./auth');
const catalog = require('./catalog');

const KEY = 'activity_signups';
const ACTIVE_SIGNUP_STATUSES = ['pending_confirmation', 'confirmed', 'completed'];
const get = () => storage.get(KEY, []);
const save = (items) => storage.set(KEY, items);

function canUseCloud() {
  return typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction;
}

async function callActivityCloud(action, data = {}) {
  if (!canUseCloud()) {
    const error = new Error('Cloud unavailable');
    error.code = 'CLOUD_UNAVAILABLE';
    throw error;
  }
  const result = await wx.cloud.callFunction({
    name: 'activitySignupManage',
    data: Object.assign({}, data, { action }),
  });
  const body = result && result.result ? result.result : result;
  if (!body || body.ok !== true) {
    const error = new Error((body && body.message) || '活动报名云函数调用失败');
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
    return await callActivityCloud(action, input);
  } catch (error) {
    if (options.allowFallback === false) throw error;
    if (error.fromCloudResult && !options.fallbackOnCloudError) throw error;
    console.warn(`activitySignupManage ${action} fallback to local`, error);
    return fallback();
  }
}

async function listActivitySource() {
  return catalog.listActivityItems();
}

async function find(id) {
  const source = await listActivitySource();
  const item = source.find((activity) => activity.activity_id === id);
  assert(item, 'ACTIVITY_NOT_FOUND', '未找到活动');
  return item;
}

function isActivityOpen(activity) {
  if (activity.status && activity.status !== 'open') return false;
  if (!activity.signup_deadline) return true;
  const deadline = activity.signup_deadline instanceof Date
    ? activity.signup_deadline
    : new Date(activity.signup_deadline);
  return Number.isNaN(deadline.getTime()) || deadline >= new Date();
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

function activePeopleCount(activityId) {
  return get()
    .filter((signup) => (
      signup.activity_id === activityId
      && ACTIVE_SIGNUP_STATUSES.includes(signup.signup_status)
      && !signup.user_deleted_at
    ))
    .reduce((sum, signup) => sum + Number(signup.people_count || signup.participant_count || 0), 0);
}

function remainingFor(activity) {
  const capacity = Number(activity.capacity) || 0;
  const reserved = Number(activity.reserved_count) || 0;
  return Math.max(0, capacity - reserved - activePeopleCount(activity.activity_id));
}

async function remaining(id) {
  return remainingFor(await find(id));
}

function signupPublicShape(signup, activity) {
  const orderNo = signup.order_no || signup.signup_id;
  const title = signup.activity_title || signup.title || (activity && activity.title) || '';
  const peopleCount = signup.people_count || signup.participant_count || 0;
  const displayTime = activity ? activityDisplayTime(activity) : {};
  return Object.assign({}, signup, {
    order_no: orderNo,
    signup_id: signup.signup_id || orderNo,
    title,
    activity_title: title,
    image_url: signup.image_url || (activity && activity.image_url) || '',
    date: signup.date || displayTime.date || '',
    time: signup.time || displayTime.time || '',
    location: signup.location || (activity && activity.location) || '',
    mobile: signup.mobile || signup.contact_mobile || '',
    contact_mobile: signup.contact_mobile || signup.mobile || '',
    people_count: peopleCount,
    participant_count: peopleCount,
    unit_price: signup.unit_price || 0,
    can_cancel: (Number(signup.amount) || 0) <= 0 && signup.signup_status !== 'cancelled',
  });
}

function customerTypeOf(user = {}) {
  return user.customer_type === 'member' || Boolean(user.member_id) ? 'member' : 'guest';
}

function activityUnitPrice(activity, customerType) {
  return customerType === 'member'
    ? Number(activity.member_price) || 0
    : Number(activity.guest_price) || 0;
}

async function listActivities() {
  const source = await listActivitySource();
  return source.map((activity) => {
    const remainingCapacity = remainingFor(activity);
    return Object.assign({}, activity, {
      remaining_capacity: remainingCapacity,
      can_signup: isActivityOpen(activity) && remainingCapacity > 0,
      ...activityDisplayTime(activity),
    });
  });
}

async function listActivityBanners() {
  return catalog.listActivityBanners();
}

async function getActivityDetail(input) {
  const activity = await find(input.activity_id);
  const remainingCapacity = remainingFor(activity);
  return Object.assign({}, activity, {
    remaining_capacity: remainingCapacity,
    can_signup: isActivityOpen(activity) && remainingCapacity > 0,
    ...activityDisplayTime(activity),
  });
}

async function createSignup(input) {
  const peopleCount = Number(input.people_count || input.participant_count || 0);
  assert(peopleCount > 0, 'ACTIVITY_SIGNUP_LIMIT', '请输入正确的报名人数');
  assert(input.contact_name, 'CONTACT_REQUIRED', '请填写联系人');
  assertMobile(input.mobile);
  const activity = await find(input.activity_id);
  assert(isActivityOpen(activity), 'ACTIVITY_CLOSED', '活动报名已截止');
  const user = await auth.getCurrentUser();
  const customerType = customerTypeOf(user);
  assert(activity.signup_scope !== 'members_only' || customerType === 'member', 'MEMBERS_ONLY', '该活动仅限会员报名');
  const unitPrice = activityUnitPrice(activity, customerType);
  assert(unitPrice > 0 || peopleCount <= 2, 'ACTIVITY_SIGNUP_LIMIT', '免费活动单次最多报名 2 人');
  assert(await remaining(activity.activity_id) >= peopleCount, 'ACTIVITY_FULL', '活动剩余名额不足');

  const amount = unitPrice * peopleCount;
  const displayTime = activityDisplayTime(activity);
  const requiresWechatPay = customerType !== 'member' && amount > 0;
  const orderNo = createBusinessId('TYW');
  const signup = {
    order_no: orderNo,
    signup_id: orderNo,
    activity_id: activity.activity_id,
    activity_title: activity.title,
    title: activity.title,
    image_url: activity.image_url,
    date: displayTime.date,
    time: displayTime.time,
    location: activity.location,
    people_count: peopleCount,
    participant_count: peopleCount,
    contact_name: input.contact_name,
    mobile: input.mobile,
    contact_mobile: input.mobile,
    customer_type: customerType,
    member_id: user.member_id || '',
    unit_price: unitPrice,
    amount,
    signup_status: 'pending_confirmation',
    payment_status: requiresWechatPay ? 'pending_wechat_pay' : customerType === 'member' ? 'offline_pending' : 'settled',
    remark: input.remark || '',
    created_at: new Date().toISOString(),
  };
  const items = get();
  items.push(signup);
  save(items);
  return signup;
}

async function simulateWechatPay(input) {
  const orderNo = input.order_no || input.signup_id;
  const items = get();
  const signup = items.find((item) => (item.order_no || item.signup_id) === orderNo);
  assert(signup, 'SIGNUP_NOT_FOUND', '未找到活动报名');
  signup.payment_status = 'settled';
  signup.paid_at = new Date().toISOString();
  save(items);
  return signup;
}

async function cancelSignup(input) {
  const orderNo = input.order_no || input.signup_id;
  const items = get();
  const signup = items.find((item) => (item.order_no || item.signup_id) === orderNo);
  assert(signup, 'SIGNUP_NOT_FOUND', '未找到活动报名');
  const activity = await find(signup.activity_id);
  assert((Number(signup.amount) || 0) <= 0, 'PAID_ACTIVITY_CANCEL_NEED_CONTACT', '收费活动请联系客服取消');
  assert(signup.signup_status !== 'cancelled', 'SIGNUP_ALREADY_CANCELLED', '该报名已取消');
  signup.signup_status = 'cancelled';
  signup.cancelled_at = new Date().toISOString();
  save(items);
  return signupPublicShape(signup, activity);
}

async function deleteSignup(input) {
  const orderNo = input.order_no || input.signup_id;
  const items = get();
  const signup = items.find((item) => (item.order_no || item.signup_id) === orderNo);
  assert(signup, 'SIGNUP_NOT_FOUND', '未找到活动报名');
  signup.user_deleted_at = new Date().toISOString();
  save(items);
  return { order_no: orderNo, user_deleted_at: signup.user_deleted_at };
}

async function listSignups() {
  const source = await listActivitySource();
  return get()
    .filter((signup) => !signup.user_deleted_at)
    .map((signup) => signupPublicShape(signup, source.find((activity) => activity.activity_id === signup.activity_id)));
}

const localActivitySignup = {
  listActivities,
  listActivityBanners,
  getActivityDetail,
  createSignup,
  simulateWechatPay,
  cancelSignup,
  deleteSignup,
  listSignups,
};

async function cloudListActivities() {
  return cloudOrFallback('listActivities', {}, () => localActivitySignup.listActivities(), { fallbackOnCloudError: true });
}

async function cloudListActivityBanners() {
  return cloudOrFallback('listActivityBanners', {}, () => localActivitySignup.listActivityBanners(), { fallbackOnCloudError: true });
}

async function cloudGetActivityDetail(input) {
  return cloudOrFallback('getActivityDetail', input, () => localActivitySignup.getActivityDetail(input), { fallbackOnCloudError: true });
}

async function cloudCreateSignup(input) {
  return cloudOrFallback('createSignup', input, () => localActivitySignup.createSignup(input), { allowFallback: false });
}

async function cloudSimulateWechatPay(input) {
  return cloudOrFallback('simulateWechatPay', input, () => localActivitySignup.simulateWechatPay(input));
}

async function createActivityPayment(input = {}) {
  return callActivityCloud('createActivityPayment', input);
}

async function cloudCancelSignup(input) {
  const payload = await withCurrentMobile(input);
  return cloudOrFallback('cancelSignup', payload, () => localActivitySignup.cancelSignup(input));
}

async function cloudDeleteSignup(input) {
  const payload = await withCurrentMobile(input);
  return cloudOrFallback('deleteSignup', payload, () => localActivitySignup.deleteSignup(input));
}

async function cloudListSignups() {
  const payload = await withCurrentMobile();
  return cloudOrFallback('listSignups', payload, () => localActivitySignup.listSignups(), { fallbackOnCloudError: true });
}

module.exports = {
  listActivities: cloudListActivities,
  listActivityBanners: cloudListActivityBanners,
  getActivityDetail: cloudGetActivityDetail,
  createSignup: cloudCreateSignup,
  createActivityPayment,
  simulateWechatPay: cloudSimulateWechatPay,
  cancelSignup: cloudCancelSignup,
  deleteSignup: cloudDeleteSignup,
  listSignups: cloudListSignups,
};
