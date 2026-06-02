Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/home', text: '首页', icon: 'home' },
      { pagePath: '/pages/menu/menu', text: '点餐', icon: 'fork' },
      { pagePath: '/pages/intro/intro', text: '介绍', icon: 'teahouse' },
      { pagePath: '/pages/booking/booking', text: '预订', icon: 'calendar-event' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: 'user' },
    ],
  },
  methods: {
    switchTab(event) {
      wx.switchTab({ url: event.currentTarget.dataset.path });
    },
  },
});
