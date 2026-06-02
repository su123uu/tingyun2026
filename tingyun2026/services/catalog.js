const menu = require('../mock/menu');
const rooms = require('../mock/rooms').rooms;
const standards = require('../mock/meal-standards').standards;

async function listMenuCategories() { return menu.categories; }
async function listMenuItems() { return menu.items; }
async function listRooms(type) { return rooms.filter((room) => !type || room.room_type === type); }
async function listMealStandards() { return standards; }

module.exports = { listMenuCategories, listMenuItems, listRooms, listMealStandards };
