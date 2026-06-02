const getNights = require('./validators').getNights;

function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function accommodationTotal(rooms, customerType, checkIn, checkOut) {
  const nights = getNights(checkIn, checkOut);
  const field = customerType === 'member' ? 'member_price' : 'regular_price';
  const nightly_amount = rooms.reduce((sum, room) => sum + room[field], 0);
  return { nights, nightly_amount, amount: nightly_amount * nights };
}

module.exports = { cartTotal, accommodationTotal };
