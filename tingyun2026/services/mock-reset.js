const storage = require('../utils/storage');
async function resetMockData() {
  storage.reset(['current_user', 'table_session', 'cart', 'meal_orders', 'reservations', 'activity_signups']);
}
module.exports = { resetMockData };
