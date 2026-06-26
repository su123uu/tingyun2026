const service = require('../../services/activity-signup');
const auth = require('../../services/auth');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseScene(scene) {
  const text = decodeURIComponent(scene || '');
  return text.split('&').reduce((params, pair) => {
    const [key, value] = pair.split('=');
    if (key) params[key] = value || '';
    return params;
  }, {});
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function moneyText(value) {
  const number = Number(value) || 0;
  return number % 1 === 0 ? String(number) : number.toFixed(2);
}

function customerTypeOf(user = {}) {
  return user.customer_type === 'member' || Boolean(user.member_id) ? 'member' : 'guest';
}

function activityUnitFee(activity, user = {}) {
  if (!activity) return 0;
  return customerTypeOf(user) === 'member'
    ? Number(activity.member_price) || 0
    : Number(activity.guest_price) || 0;
}

function activityFeeText(activity, user = {}) {
  const amount = activityUnitFee(activity, user);
  if (amount <= 0) return '免费';
  const suffix = customerTypeOf(user) === 'member' ? ' / 人 · 线下核销' : ' / 人 · 微信支付';
  return `¥${moneyText(amount)}${suffix}`;
}

function splitHighlights(images) {
  const rows = asArray(images).filter(Boolean);
  const midpoint = Math.ceil(rows.length / 2);
  const top = rows.slice(0, midpoint);
  const bottom = rows.slice(midpoint);
  return {
    top,
    bottom,
    topLoop: top.concat(top).map((url, index) => ({ url, key: `top-${index}-${url}` })),
    bottomLoop: bottom.concat(bottom).map((url, index) => ({ url, key: `bottom-${index}-${url}` })),
    show: rows.length >= 2,
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

function decorateActivity(activity, user = {}, signups = []) {
  const remaining = Number(activity.remaining_capacity) || 0;
  const open = activity.can_signup !== undefined ? activity.can_signup : remaining > 0;
  const membersOnly = activity.signup_scope === 'members_only';
  const isMember = customerTypeOf(user) === 'member';
  const memberBlocked = membersOnly && !isMember;
  const alreadySigned = hasActiveSignup(signups, activity.activity_id);
  const canSignup = open && !memberBlocked && !alreadySigned;
  const highlights = splitHighlights(activity.highlight_images);
  return Object.assign({}, activity, {
    subtitle: activity.subtitle || '',
    intro_text: activity.intro_text || '',
    intro_images: asArray(activity.intro_images).filter(Boolean),
    highlight_top: highlights.top,
    highlight_bottom: highlights.bottom,
    highlight_top_loop: highlights.topLoop,
    highlight_bottom_loop: highlights.bottomLoop,
    show_highlights: highlights.show,
    signup_deadline_text: formatDateTime(activity.signup_deadline),
    fee_text: activityFeeText(activity, user),
    already_signed: alreadySigned,
    can_signup: canSignup,
    button_text: alreadySigned ? '已报名' : (memberBlocked ? '会员专属' : (canSignup ? '立即报名' : '报名已结束')),
    status_text: alreadySigned ? '已报名' : (memberBlocked ? '会员专属' : (canSignup ? `可报名 · 剩余 ${remaining} 席` : '报名已结束')),
    status_tone: alreadySigned ? 'green' : (memberBlocked ? 'gold' : (canSignup ? 'green' : 'disabled')),
  });
}

Page({
  data: { activity: null, navTop: 28, navHeight: 32 },
  async onLoad(options) {
    this.setNavigationMetrics();
    const scene = parseScene(options.scene);
    const activityId = options.id || options.a || options.activity_id || scene.a || scene.activity_id || '';
    const [activity, user, signups] = await Promise.all([
      service.getActivityDetail({ activity_id: activityId }),
      auth.getCurrentUser().catch(() => ({})),
      service.listSignups().catch(() => []),
    ]);
    this.setData({ activity: decorateActivity(activity, user, signups) });
  },
  onShow() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
  setNavigationMetrics() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let navTop = (windowInfo.statusBarHeight || 20) + 6;
    let navHeight = 32;
    try {
      const capsule = wx.getMenuButtonBoundingClientRect();
      if (capsule && capsule.top && capsule.height) {
        navTop = capsule.top;
        navHeight = capsule.height;
      }
    } catch (error) {}
    this.setData({ navTop, navHeight });
  },
  goBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.navigateTo({ url: '/pages/activity-list/activity-list' }) });
  },
  contact() {
    wx.makePhoneCall({ phoneNumber: '15192670475' });
  },
  signup() {
    if (this.data.activity.already_signed) {
      wx.showToast({ title: '你已报名该活动', icon: 'none' });
      return;
    }
    if (!this.data.activity.can_signup) return;
    wx.navigateTo({ url: `/pages/activity-signup/activity-signup?id=${this.data.activity.activity_id}` });
  },
  onShareAppMessage() {
    const activity = this.data.activity || {};
    const activityId = activity.activity_id || '';
    const baseTitle = (activity.title || '停云山居活动').slice(0, 20);
    return {
      title: `${baseTitle} · 停云山居`,
      path: activityId ? `/pages/activity/activity?a=${activityId}` : '/pages/activity/activity',
    };
  },
  onShareTimeline() {
    const activity = this.data.activity || {};
    const activityId = activity.activity_id || '';
    const baseTitle = (activity.title || '停云山居活动').slice(0, 20);
    return {
      title: `${baseTitle} · 停云山居`,
      query: activityId ? `a=${activityId}` : '',
    };
  },
});
