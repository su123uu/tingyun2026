# 山居介绍页内容块填写说明

介绍页读取 `content_pages` 集合中 `page_id = shanju_intro` 的数据。后台字段建议这样填：

```json
{
  "page_id": "shanju_intro",
  "page_type": "intro",
  "title": "停云山居",
  "summary": "山里请，云上坐。崂山首创云端社交私享空间，融合山海之灵秀，缔造尊养雅境。",
  "cover_image_url": "cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/hero.webp",
  "page_status": "published",
  "content_blocks": []
}
```

`content_blocks` 支持以下类型：

```json
{ "type": "lead", "text": "页面开头重点介绍。" }
{ "type": "section_title", "text": "小标题" }
{ "type": "paragraph", "text": "普通正文段落。" }
{ "type": "quote", "text": "强调句。" }
{ "type": "image", "image_url": "cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/brand.webp" }
```

双列卖点卡片：

```json
{
  "type": "feature_grid",
  "items": [
    { "title": "多类型场地", "text": "适配沙龙、培训、路演、团建、宴请等不同场景。" },
    { "title": "管家服务", "text": "专属管家全程跟进。" }
  ]
}
```

空间列表：

```json
{
  "type": "space_list",
  "items": [
    { "title": "会客区", "text": "温馨放松，适合小型交流、茶叙与私享会谈。" }
  ]
}
```

普通列表：

```json
{
  "type": "list",
  "items": [
    "行业主题沙龙、政策解读会、经验分享会",
    "企业内部培训、技能提升课程、员工团建活动"
  ]
}
```

联系卡片：

```json
{
  "type": "contact",
  "title": "欢迎咨询",
  "text": "山里人私人管家：椿枫\n电话：18253287888\n地址：青岛市崂山区停云山居",
  "image_url": "cloud://cloud1-d6gzs6wuu4b4e902e.636c-cloud1-d6gzs6wuu4b4e902e-1437151055/intro/contact.webp"
}
```

公众号内容建议不要整篇文章直接嵌进介绍页。更好的做法是：提炼文章内容放入上述结构化区块，文末放“公众号/文章入口”或二维码；如果要打开公众号原文，需要另做 `web-view` 页面，并确认微信后台业务域名和公众号文章链接是否满足小程序规则。
