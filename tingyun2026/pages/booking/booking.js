Page({
  data: { navTop: 28, navHeight: 32 },
  onLoad() { this.setNavigationMetrics(); },
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
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 3 });
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
  },
  onShareAppMessage() {
    return {
      title: '停云山居 · 提前预约，尊享最佳体验',
      path: '/pages/booking/booking',
    };
  },
  onShareTimeline() {
    return {
      title: '停云山居 · 提前预约，尊享最佳体验',
    };
  },
  goDining() { wx.navigateTo({ url: '/pages/booking-dining/booking-dining' }); },
  goStay() { wx.navigateTo({ url: '/pages/booking-accommodation/booking-accommodation' }); },
  consult(event) {
    wx.showModal({
      title: event.currentTarget.dataset.type,
      content: '请拨打电话咨询：15192670475',
      showCancel: false,
    });
  },
});
