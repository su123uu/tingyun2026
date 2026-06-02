const service = require('../../services/activity-signup');

function decorateActivity(activity) {
  if (activity.remaining_capacity <= 0) {
    return Object.assign({}, activity, { status_text: '已满员', status_tone: 'disabled' });
  }
  return Object.assign({}, activity, {
    status_text: `剩余 ${activity.remaining_capacity} 席`,
    status_tone: activity.status_tone || 'green',
  });
}

Page({
  data: { activities: [], navTop: 28, navHeight: 32 },
  onLoad() {
    this.setNavigationMetrics();
  },
  async onShow() {
    const activities = await service.listActivities();
    this.setData({ activities: activities.map(decorateActivity) });
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
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/home' }) });
  },
  detail(event) {
    wx.navigateTo({ url: `/pages/activity/activity?id=${event.currentTarget.dataset.id}` });
  },
});
