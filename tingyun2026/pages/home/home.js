Page({
    data: {
        // 近期活动数据
        activities: [
            {
                id: 1,
                title: '禅修冥想体验课',
                desc: '专业导师带领，感受内心平静，开启内在智慧之旅',
                date: '6月15日 14:00-17:00',
                image: '/images/meditation.jpg'
            },
            {
                id: 2,
                title: '茶艺品鉴交流会',
                desc: '品味好茶，在山水间感受茶道之美，结交同好',
                date: '6月20日 16:00-18:00',
                image: '/images/tea.jpg'
            },
            {
                id: 3,
                title: '山居素斋晚宴',
                desc: '时令山野食材，匠心烹制，会员专享体验',
                date: '6月25日 18:30-21:30',
                image: '/images/dinner.jpg'
            }
        ]
    },

    onLoad() {
        // 页面加载
    },

    onShow() {
        // 更新自定义 TabBar 选中状态
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
            this.getTabBar().setData({ selected: 0 });
        }
    },

    // 跳转扫码点餐
    goToOrder() {
        wx.switchTab({
            url: '/pages/menu/menu'
        });
    },

    // 跳转预约预订
    goToBooking() {
        wx.navigateTo({
            url: '/pages/booking/booking'
        });
    },

    // 跳转特色体验详情
    goToFeature(e) {
        const feature = e.currentTarget.dataset.feature;
        wx.navigateTo({
            url: `/pages/feature/feature?type=${feature}`
        });
    },

    // 跳转活动详情
    goToActivity(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/activity/activity?id=${id}`
        });
    },

    onShareAppMessage() {
        return {
            title: '停云山居 - 青岛崂山禅意生活空间',
            path: '/pages/home/home'
        };
    }
});
