//index.js
//获取应用实例
const app = getApp()
//打印机设置相关
const otherApi = require("../../examples/xpsdk-demo.js");
//打印内容相关
const printApi = require("../../examples/printer-example.js");

Page({
  data: {
  },
  //事件处理函数
  bindViewTap: function () {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onLoad: function () {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    } else if (this.data.canIUse) {
      // 由于 getUserInfo 是网络请求，可能会在 Page.onLoad 之后才返回
      // 所以此处加入 callback 以防止这种情况
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    } else {
      // 在没有 open-type=getUserInfo 版本的兼容处理
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          })
        }
      })
    }
  },
  //1.批量地添加打印机
  addPrintersTest: function () {
    otherApi.addPrintersTest();
  },
  //2.设置打印机语音类型
  setVoiceTypeTest: function () {
    otherApi.setVoiceTypeTest();
  },

  //###### 打印接口样例 请参考【demo/examples/XpsdkPrintApiDemo.php】文件内容 begin ##############
  //3.小票打印字体对齐样例，不支持金额播报
  printFontAlign: function () {
    printApi.printFontAlign();
  },

  //3.小票打印字体对齐样例，支持金额播报
  printFontAlignVoiceSupport: function () {
    printApi.printFontAlignVoiceSupport();
  },

  //3.小票打印综合排版样例，不支持金额播报
  printComplexReceipt: function () {
    printApi.printComplexReceipt();
  },

  //3.小票打印综合排版样例，支持金额播报
  printComplexReceiptVoiceSupport: function () {
    printApi.printComplexReceiptVoiceSupport();
  },

  //4.标签打印综合排版样例
  printLabel: function () {
    printApi.printLabel();
  },
  //####### 打印接口样例 end ################

  //5.批量删除打印机
  delPrintersTest: function () {
    otherApi.delPrintersTest();
  },

  //6.修改打印机信息
  updPrinterTest: function () {
    otherApi.updPrinterTest();
  },

  //7.清空待打印队列
  delPrinterQueueTest: function () {
    otherApi.xpYunDelPrinterQueueTest();
  },

  //8.查询订单是否打印成功
  queryOrderStateTest: function () {
    otherApi.xpYunQueryOrderStateTest();
  },

  //9.查询指定打印机某天的订单统计数
  queryOrderStatisTest: function () {
    otherApi.queryOrderStatisTest();
  },

  //10.获取指定打印机状态
  queryPrinterStatusTest: function () {
    otherApi.xpYunQueryPrinterStatusTest();
  },

  //11.金额播报
  playVoiceTest: function () {
    otherApi.xpYunPlayVoiceTest();
  }
})
