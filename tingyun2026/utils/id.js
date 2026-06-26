function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function timestamp(date) {
  return [
    String(date.getFullYear()).slice(-2),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function randomCode(length) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function createBusinessId(prefix) {
  return `${prefix}${timestamp(new Date())}${randomCode(3)}`;
}

module.exports = { createId: createId, createBusinessId: createBusinessId };
