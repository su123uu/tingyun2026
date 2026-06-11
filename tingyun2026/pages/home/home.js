const homeService = require('../../services/home');

Page({
  data: { home: { banner_interval: 4200, banners: [], quick_entries: [], feature_cards: [] }, activeBanner: {} },
  async onLoad() {
    const home = await homeService.getHomeContent();
    this.setData({ home, activeBanner: home.banners[0] || {} });
  },
  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 0 });
  },
  changeBanner(event) { this.setData({ activeBanner: this.data.home.banners[event.detail.current] || {} }); },
  goEntry(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'menu') return this.goMenu();
    if (action === 'booking') return this.goBooking();
    if (action === 'intro') return this.goIntro();
    if (action === 'activities') return this.goActivities();
  },
  goMenu() { wx.switchTab({ url: '/pages/menu/menu' }); },
  goBooking() { wx.switchTab({ url: '/pages/booking/booking' }); },
  goIntro() { wx.switchTab({ url: '/pages/intro/intro' }); },
  goActivities() { wx.navigateTo({ url: '/pages/activity-list/activity-list' }); },
});
