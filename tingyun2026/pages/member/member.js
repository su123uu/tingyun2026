Page({
  data: {
    navTop: 28,
    navHeight: 32,
    tiers: [
      { no: '01', name: '将星', stored: '1', points: '1.2', duration: '12' },
      { no: '02', name: '辰升', stored: '2', points: '2.5', duration: '16' },
      { no: '03', name: '海尊', stored: '3', points: '3.7', duration: '18' },
      { no: '04', name: '山王', stored: '5', points: '6.2', duration: '24' },
      { no: '05', name: '云境', stored: '10', points: '12.5', duration: '36' },
    ],
    benefits: [
      { no: '01', name: '山居资源圈与跨界活动' },
      { no: '02', name: '免费住房 10 次' },
      { no: '03', name: '月度会员专题活动' },
      { no: '04', name: '禅修营与自然教育课程' },
      { no: '05', name: '专题音乐会 4 次 / 年' },
      { no: '06', name: '山居管家服务' },
      { no: '07', name: '纪念日主题布置 3 次' },
      { no: '08', name: '茶室、茶酒吧与雅室' },
      { no: '09', name: '定制储藏服务' },
      { no: '10', name: '自然采摘 20 人次 / 年' },
    ],
  },
  onLoad() {
    this.setNavigationMetrics();
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
  contact() {
    wx.makePhoneCall({ phoneNumber: '15192670475' });
  },
});
