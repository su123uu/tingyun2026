const auth = require('../../services/auth');
const activitySignups = require('../../services/activity-signup');

const signupStatus = {
  pending_confirmation: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
};

const sampleActivity = {
  activity_id: 'tea',
  title: '山间茶艺品鉴会',
  date: '2026-06-20',
  location: '茶空间',
  people_count: 2,
  status_text: '待确认',
};

function maskMobile(mobile) {
  return mobile ? mobile.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '尚未绑定';
}

function decorateSignup(signup) {
  return Object.assign({}, signup, {
    status_text: signupStatus[signup.signup_status] || signup.signup_status,
  });
}

Page({
  data: {
    user: {},
    isMember: false,
    mobileText: '尚未绑定',
    navTop: 28,
    navHeight: 32,
    benefits: [
      { no: '01', name: '免费住宿', usage: '已使用 2 次 · 剩余 8 次' },
      { no: '02', name: '自然采摘', usage: '已使用 6 人次 · 剩余 14 人次' },
      { no: '03', name: '茶室雅集', usage: '已使用 3 次 · 剩余 7 次' },
      { no: '04', name: '私人纪念日布置', usage: '已使用 1 次 · 剩余 2 次' },
    ],
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
    this.setData({
      user,
      isMember,
      mobileText: maskMobile(user.mobile),
      activities: isMember ? (signups.length ? signups.map(decorateSignup) : [sampleActivity]) : [],
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
  bindMember() {
    wx.showModal({
      title: '模拟手机号授权',
      content: '使用测试手机号 13800136688 绑定会员档案。',
      confirmText: '授权绑定',
      success: async (result) => {
        if (!result.confirm) return;
        const user = await auth.bindMobile({ mobile: '13800136688' });
        this.setData({
          user,
          isMember: user.customer_type === 'member',
          mobileText: maskMobile(user.mobile),
          activities: [sampleActivity],
        });
      },
    });
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
});
