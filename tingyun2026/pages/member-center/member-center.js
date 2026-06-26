const auth = require('../../services/auth');
const activitySignups = require('../../services/activity-signup');
const memberService = require('../../services/member');

const signupStatus = {
  pending_confirmation: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
};

function maskMobile(mobile) {
  return mobile ? mobile.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '尚未绑定';
}

function decorateSignup(signup) {
  return Object.assign({}, signup, {
    order_no: signup.order_no || signup.signup_id,
    status_text: signupStatus[signup.signup_status] || signup.signup_status,
  });
}

function padNo(index) {
  return String(index + 1).padStart(2, '0');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function formatValidity(user) {
  const start = formatDate(user.benefit_start_at);
  const end = formatDate(user.benefit_end_at);
  if (start && end) return `${start} - ${end}`;
  if (end) return `有效期至 ${end}`;
  return '权益有效期以后台登记为准';
}

function quotaUsage(item) {
  const unit = item.quota_unit || '次';
  const total = Number(item.total_quota) || 0;
  const used = Number(item.used_quota) || 0;
  const locked = Number(item.locked_quota) || 0;
  const remaining = Number(item.remaining_quota);
  const safeRemaining = Number.isFinite(remaining) ? remaining : Math.max(total - used - locked, 0);
  const chunks = [`剩余 ${safeRemaining}${unit}`];
  if (total) chunks.push(`共 ${total}${unit}`);
  if (used) chunks.push(`已用 ${used}${unit}`);
  if (locked) chunks.push(`锁定 ${locked}${unit}`);
  return chunks.join(' · ');
}

function truthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function buildBenefitSections(profile) {
  const levelBenefits = Array.isArray(profile.level_benefits) ? profile.level_benefits : [];
  const accounts = Array.isArray(profile.benefit_accounts) ? profile.benefit_accounts : [];
  const accountMap = accounts.reduce((map, account) => {
    map[account.benefit_key] = account;
    return map;
  }, {});

  const serviceBenefits = levelBenefits
    .filter((item) => item.benefit_type === 'service')
    .map((item, index) => Object.assign({}, item, {
      no: padNo(index),
      name: item.benefit_name,
      copy: item.description || '会员有效期内可享受',
    }));

  const quotaSource = accounts.length
    ? accounts
    : levelBenefits.filter((item) => item.benefit_type === 'quota').map((item) => Object.assign({}, item, {
      remaining_quota: item.total_quota,
      used_quota: 0,
      locked_quota: 0,
    }));
  const quotaBenefits = quotaSource
    .map((item, index) => {
      const levelBenefit = accountMap[item.benefit_key] ? levelBenefits.find((benefit) => benefit.benefit_key === item.benefit_key) : item;
      return Object.assign({}, item, {
        no: padNo(index),
        name: item.benefit_name,
        usage: quotaUsage(item),
        copy: (levelBenefit && levelBenefit.description) || item.description || '',
      });
    });

  return {
    serviceBenefits,
    quotaBenefits,
    cardServices: serviceBenefits.filter((item) => truthy(item.show_on_card)).slice(0, 3),
  };
}

Page({
  data: {
    user: {},
    isMember: false,
    mobileText: '尚未绑定',
    validityText: '权益有效期以后台登记为准',
    navTop: 28,
    navHeight: 32,
    serviceBenefits: [],
    quotaBenefits: [],
    cardServices: [],
    activities: [],
  },
  onLoad() {
    this.setNavigationMetrics();
  },
  async onShow() {
    const [user, signups] = await Promise.all([
      auth.getCurrentUser(),
      activitySignups.listSignups(),
    ]);
    const isMember = user.customer_type === 'member';
    const profile = isMember
      ? await memberService.getMemberProfile({ member_id: user.member_id, mobile: user.mobile })
      : { level_benefits: [], benefit_accounts: [] };
    const sections = isMember
      ? buildBenefitSections(profile)
      : { serviceBenefits: [], quotaBenefits: [], cardServices: [] };
    this.setData({
      user,
      isMember,
      mobileText: maskMobile(user.mobile),
      validityText: formatValidity(user),
      serviceBenefits: sections.serviceBenefits,
      quotaBenefits: sections.quotaBenefits,
      cardServices: sections.cardServices,
      activities: isMember ? signups.map(decorateSignup) : [],
    });
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
    wx.navigateBack({
      delta: 1,
      fail: () => wx.switchTab({ url: '/pages/profile/profile' }),
    });
  },
  intro() {
    wx.navigateTo({ url: '/pages/member/member' });
  },
  async bindMember(event) {
    const code = event && event.detail && event.detail.code;
    if (!code) {
      wx.showToast({ title: '未完成手机号授权', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '匹配会员中', mask: true });
      await auth.bindMobile({ phoneCode: code });
      wx.hideLoading();
      await this.onShow();
      wx.showToast({ title: this.data.isMember ? '会员匹配成功' : '未匹配到会员', icon: this.data.isMember ? 'success' : 'none' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '手机号授权失败', icon: 'none' });
    }
  },
  contact() {
    wx.makePhoneCall({ phoneNumber: '15192670475' });
  },
  viewActivities() {
    wx.navigateTo({ url: '/pages/activity-list/activity-list' });
  },
  openActivity(event) {
    wx.navigateTo({ url: `/pages/activity/activity?id=${event.currentTarget.dataset.id}` });
  },
  cancelActivity(event) {
    const order_no = event.currentTarget.dataset.id;
    wx.showModal({
      title: '取消报名',
      content: '免费活动可自行取消，取消后名额将释放。',
      confirmText: '确认取消',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await activitySignups.cancelSignup({ order_no });
          const signups = await activitySignups.listSignups();
          this.setData({ activities: signups.length ? signups.map(decorateSignup) : [] });
          wx.showToast({ title: '已取消报名', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message, icon: 'none' });
        }
      },
    });
  },
});
