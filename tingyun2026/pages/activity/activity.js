const service = require('../../services/activity-signup');

function decorateActivity(activity) {
  const canSignup = activity.remaining_capacity > 0;
  return Object.assign({}, activity, {
    can_signup: canSignup,
    status_text: canSignup ? `可报名 · 剩余 ${activity.remaining_capacity} 席` : '已满员',
    status_tone: canSignup ? (activity.status_tone || 'green') : 'disabled',
  });
}

Page({
  data: { activity: null, navTop: 28, navHeight: 32 },
  async onLoad(options) {
    this.setNavigationMetrics();
    const activity = await service.getActivityDetail({ activity_id: options.id });
    this.setData({ activity: decorateActivity(activity) });
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
    wx.showToast({ title: '客服联系方式将在正式上线前补充', icon: 'none' });
  },
  signup() {
    if (!this.data.activity.can_signup) return;
    wx.navigateTo({ url: `/pages/activity-signup/activity-signup?id=${this.data.activity.activity_id}` });
  },
});
