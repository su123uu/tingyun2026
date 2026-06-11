const { getContentPage } = require('../../services/home');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeBlock(block) {
  const next = Object.assign({}, block || {});
  next.type = next.type || 'paragraph';
  next.text = next.text || '';
  next.title = next.title || '';
  next.description = next.description || '';
  next.image_url = next.image_url || '';
  next.items = asArray(next.items);
  next.rich_nodes = next.nodes || next.html || '';
  return next;
}

function normalizePage(page) {
  const source = page || {};
  return {
    title: source.title || '停云山居',
    summary: source.summary || '',
    cover_image_url: source.cover_image_url || '',
    content_blocks: asArray(source.content_blocks).map(normalizeBlock),
  };
}

Page({
  data: {
    page: normalizePage(),
    loading: true,
    loadError: '',
  },

  onLoad() {
    this.loadPage();
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 2 });
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const page = await getContentPage({});
      this.setData({ page: normalizePage(page), loading: false });
    } catch (error) {
      console.warn('load intro page failed', error);
      this.setData({
        page: normalizePage(),
        loading: false,
        loadError: '当前没有可展示的介绍内容，请稍后再试。',
      });
    }
  },

  copyContact() {
    wx.setClipboardData({
      data: '成龙 18253287888',
      success: () => wx.showToast({ title: '联系方式已复制', icon: 'success' }),
    });
  },
});
