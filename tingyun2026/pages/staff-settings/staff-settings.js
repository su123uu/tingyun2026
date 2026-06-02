const auth = require('../../services/auth');

Page({
  data:{allowed:false},
  async onShow() {
    const user=await auth.getCurrentUser();
    const allowed=user.is_staff===true||user.role==='staff';
    this.setData({allowed});
    if(allowed) return;
    wx.showToast({title:'仅店员可进入',icon:'none'});
    setTimeout(()=>wx.navigateBack({delta:1}),500);
  },
});
