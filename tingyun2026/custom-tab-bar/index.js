Component({
    data: {
        selected: 0,
        list: [
            {
                pagePath: '/pages/home/home',
                text: '首页'
            },
            {
                pagePath: '/pages/menu/menu',
                text: '点餐'
            },
            {
                pagePath: '/pages/intro/intro',
                text: '介绍'
            },
            {
                pagePath: '/pages/orders/orders',
                text: '订单'
            },
            {
                pagePath: '/pages/profile/profile',
                text: '我的'
            }
        ]
    },

    methods: {
        switchTab(e) {
            const data = e.currentTarget.dataset;
            const url = data.path;
            const index = data.index;

            // 更新选中状态
            this.setData({
                selected: index
            });

            // 切换 Tab
            wx.switchTab({
                url: url,
                fail: () => {
                    // 如果 switchTab 失败，尝试 navigateTo
                    wx.navigateTo({ url });
                }
            });
        }
    }
});
