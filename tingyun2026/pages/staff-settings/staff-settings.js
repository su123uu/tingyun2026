const auth = require('../../services/auth');

Page({
  data:{allowed:false},
  async onShow() {
    const user=await auth.getCurrentUser();
    const allowed=user.is_staff===true||user.role==='staff';
    this.setData({allowed});
    wx.showShareMenu({menus:['shareAppMessage','shareTimeline']});
    if(allowed) return;
    wx.showToast({title:'仅店员可进入',icon:'none'});
    setTimeout(()=>wx.navigateBack({delta:1}),500);
  },
  onShareAppMessage() {
    return {
      title: '发现一处山居，推荐给你',
      path: '/pages/profile/profile',
    };
  },
  onShareTimeline() {
    return {
      title: '发现一处山居，推荐给你',
      query: '',
    };
  },
});
