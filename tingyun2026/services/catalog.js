const menu = require('../mock/menu');
const rooms = require('../mock/rooms').rooms;
const standards = require('../mock/meal-standards').standards;

async function listMealCategories() {
  const map = {};
  menu.items.forEach((item) => {
    if (!map[item.category_key]) {
      map[item.category_key] = {
        category_key: item.category_key,
        name: item.category_name,
        sort_order: item.category_sort_order,
      };
    }
  });
  return Object.keys(map).map((key) => map[key]).sort((a, b) => a.sort_order - b.sort_order);
}
async function listMealItems() { return menu.items; }
async function listDiningRooms() { return rooms.filter((room) => room.room_type === 'dining'); }
async function listAccommodationRooms() { return rooms.filter((room) => room.room_type === 'accommodation'); }
async function listDiningStandards() { return standards; }

module.exports = {
  listMealCategories,
  listMealItems,
  listDiningRooms,
  listAccommodationRooms,
  listDiningStandards,
  listMenuCategories: listMealCategories,
  listMenuItems: listMealItems,
  listRooms: async (type) => rooms.filter((room) => !type || room.room_type === type),
  listMealStandards: listDiningStandards,
};
