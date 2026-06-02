const PREFIX = 'tingyun_mock_';
const memory = {};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getAdapter() {
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    return {
      get: (key) => wx.getStorageSync(key),
      set: (key, value) => wx.setStorageSync(key, value),
      remove: (key) => wx.removeStorageSync(key),
    };
  }
  return {
    get: (key) => memory[key],
    set: (key, value) => { memory[key] = value; },
    remove: (key) => { delete memory[key]; },
  };
}

function get(key, fallback) {
  const value = getAdapter().get(PREFIX + key);
  return clone(value === '' || value === null || value === undefined ? fallback : value);
}

function set(key, value) {
  getAdapter().set(PREFIX + key, clone(value));
  return clone(value);
}

function remove(key) {
  getAdapter().remove(PREFIX + key);
}

function reset(keys) {
  keys.forEach(remove);
}

module.exports = { get, set, remove, reset };
