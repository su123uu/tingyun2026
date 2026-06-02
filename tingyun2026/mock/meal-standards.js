const standards = [
  {
    meal_standard_id: 'group_meal',
    name: '团餐',
    price_per_person: 40,
    summary: '家常山居风味，荤素搭配，适合多人聚餐',
    dishes: [
      { name: '凉菜', content: '时蔬凉菜 2 道' },
      { name: '热菜', content: '山居热菜 6 道，荤素搭配' },
      { name: '主食', content: '米饭、时令主食' },
      { name: '汤品', content: '当日例汤 1 份' },
    ],
  },
  {
    meal_standard_id: 'yangyun',
    name: '养云',
    price_per_person: 168,
    summary: '时令山珍与特色菜品搭配，适合雅聚宴请',
    dishes: [
      { name: '凉菜', content: '山野冷盘 4 道' },
      { name: '热菜', content: '特色热菜 8 道，含鸡、鱼、时蔬' },
      { name: '主食', content: '手作主食、米饭' },
      { name: '汤品', content: '山菌炖汤 1 份' },
      { name: '茶饮', content: '山居茶饮 1 份' },
    ],
  },
  {
    meal_standard_id: 'guiyun',
    name: '归云',
    price_per_person: 218,
    summary: '山海鲜味入席，菜品丰盛，适合重要聚会',
    dishes: [
      { name: '凉菜', content: '精致冷盘 4 道' },
      { name: '热菜', content: '山居招牌菜 8 道，含鱼、虾、禽肉' },
      { name: '主食', content: '手作点心、米饭' },
      { name: '汤品', content: '滋补炖汤 1 份' },
      { name: '果盘', content: '时令水果拼盘 1 份' },
    ],
  },
  {
    meal_standard_id: 'tingyun',
    name: '停云',
    price_per_person: 318,
    summary: '山居宴席精选，讲究食材与摆盘，适合贵宾宴请',
    dishes: [
      { name: '凉菜', content: '迎宾冷盘 6 道' },
      { name: '热菜', content: '主厨精选菜 10 道，含山珍、河鲜与特色肉菜' },
      { name: '主食', content: '手作点心、米饭' },
      { name: '汤品', content: '主厨炖汤 1 份' },
      { name: '果盘', content: '时令水果拼盘 1 份' },
      { name: '茶饮', content: '山居茶饮 1 份' },
    ],
  },
];

module.exports = { standards };
