const service = require('../../services/activity-signup');
const auth = require('../../services/auth');
const notification = require('../../services/notification');

function moneyText(value) {
  const number = Number(value) || 0;
  return number % 1 === 0 ? String(number) : number.toFixed(2);
}

function customerTypeOf(user = {}) {
  return user.customer_type === 'member' || Boolean(user.member_id) ? 'member' : 'guest';
}

function unitFee(activity, user) {
  if (!activity) return 0;
  return customerTypeOf(user) === 'member'
    ? Number(activity.member_price) || 0
    : Number(activity.guest_price) || 0;
}

function signupLimit(activity, user) {
  const freeLimit = unitFee(activity, user || {}) <= 0 ? 2 : 999;
  const remaining = Number(activity && activity.remaining_capacity) || 0;
  return remaining > 0 ? Math.min(freeLimit, remaining) : freeLimit;
}

function feeState(activity, user, people) {
  const unit = unitFee(activity, user || {});
  const total = unit * (Number(people) || 1);
  const method = total <= 0 ? '免费' : (customerTypeOf(user) === 'member' ? '会员线下核销' : '微信支付');
  return {
    unit_fee: unit,
    total_fee: total,
    fee_text: total <= 0 ? '免费' : `¥${moneyText(unit)} / 人`,
    total_fee_text: total <= 0 ? '免费' : `¥${moneyText(total)}`,
    payment_method_text: method,
    max_people: signupLimit(activity, user || {}),
    people_hint: unit <= 0 ? '免费活动单次最多报名 2 人' : '收费活动按剩余名额报名',
  };
}

function hasActiveSignup(signups, activityId) {
  const activeStatuses = ['pending_confirmation', 'confirmed', 'completed'];
  return Array.isArray(signups) && signups.some((item) => (
    item.activity_id === activityId
    && activeStatuses.includes(item.signup_status)
    && !item.user_deleted_at
  ));
}

Page({
  data: {
    activity: null,
    user: null,
    people: 1,
    contact: '山里人',
    mobile: '13800136688',
    remark: '',
    unit_fee: 0,
    total_fee: 0,
    fee_text: '免费',
    total_fee_text: '免费',
    payment_method_text: '免费',
    max_people: 2,
    people_hint: '免费活动单次最多报名 2 人',
    navTop: 28,
    navHeight: 32,
    identityInitial: '停',
    effectiveCustomerType: 'guest',
    memberLevel: '',
    submitting: false,
    submitted: false,
  },
  async onLoad(options) {
    this.setNavigationMetrics();
    const [activity, user, signups] = await Promise.all([
      service.getActivityDetail({ activity_id: options.id }),
      auth.getCurrentUser().catch(() => ({})),
      service.listSignups().catch(() => []),
    ]);
    const effectiveCustomerType = this.resolveCustomerType(user);
    const alreadySigned = hasActiveSignup(signups, activity.activity_id);
    this.setData({
      activity,
      user,
      contact: user.nickname || user.customer_name || this.data.contact,
      mobile: user.mobile || this.data.mobile,
      identityInitial: this.formatIdentityInitial(effectiveCustomerType, user),
      effectiveCustomerType,
      memberLevel: user.member_level || '',
      submitted: alreadySigned,
      ...feeState(activity, user, this.data.people),
    });
    if (alreadySigned) wx.showToast({ title: '你已报名该活动', icon: 'none' });
  },
  resolveCustomerType(user = {}) {
    return customerTypeOf(user);
  },
  formatIdentityInitial(type, user = {}) {
    if (type !== 'member') return '停';
    const name = user.nickname || user.customer_name || '';
    return String(name).trim().charAt(0) || '会';
  },
  setNavigationMetrics() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let navTop = (windowInfo.statusBarHeight || 20) + 6;
    let navHeight = 32;
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      if (capsule && capsule.top && capsule.height) { navTop = capsule.top; navHeight = capsule.height; }
    } catch (error) {}
    this.setData({ navTop, navHeight });
  },
  goBack() { wx.navigateBack({ delta: 1, fail: () => wx.navigateTo({ url: '/pages/activity-list/activity-list' }) }); },
  people(event) {
    const step = Number(event.currentTarget.dataset.step);
    const limit = signupLimit(this.data.activity, this.data.user);
    if (step > 0 && this.data.people >= limit) {
      wx.showToast({
        title: unitFee(this.data.activity, this.data.user || {}) <= 0 ? '免费活动最多 2 人' : '已达剩余名额上限',
        icon: 'none',
      });
      return;
    }
    const people = Math.max(1, Math.min(limit, this.data.people + step));
    this.setData({
      people,
      ...feeState(this.data.activity, this.data.user, people),
    });
  },
  contact(event) {
    this.setData({ contact: event.detail.value });
  },
  mobile(event) {
    this.setData({ mobile: event.detail.value });
  },
  remark(event) {
    this.setData({ remark: event.detail.value });
  },
  async submit() {
    if (this.data.submitting || this.data.submitted) return;
    try {
      if (this.data.people > signupLimit(this.data.activity, this.data.user)) {
        wx.showToast({ title: '报名人数超过限制', icon: 'none' });
        return;
      }
      this.setData({ submitting: true });
      const subscription = this.data.effectiveCustomerType === 'member'
        ? await notification.requestActivitySignupWithConsumption()
        : await notification.requestActivitySignupSuccess();
      const user = await auth.getCurrentUser();
      let signup = await service.createSignup({
        activity_id: this.data.activity.activity_id,
        people_count: this.data.people,
        contact_name: this.data.contact,
        mobile: this.data.mobile,
        member_id: user.member_id || '',
        customer_type: customerTypeOf(user),
        remark: this.data.remark,
        notification_subscriptions: subscription,
      });
      if (signup.settlement_status === 'pending_wechat_pay') {
        await this.payActivity(signup.order_no || signup.signup_id);
        signup = Object.assign({}, signup, {
          settlement_status: 'wechat_paid',
          payment_status: 'settled',
        });
      }
      this.setData({ submitted: true });
      wx.showModal({
        title: '报名已提交',
        content: signup.customer_type === 'member'
          ? '请等待店员线下核销会员账户或活动权益。'
          : '当前状态为待确认。',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 2 }),
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    } finally {
      if (!this.data.submitted) this.setData({ submitting: false });
    }
  },
  async payActivity(orderNo) {
    const paymentResult = await service.createActivityPayment({ order_no: orderNo });
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
});
