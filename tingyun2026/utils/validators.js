const createBusinessError = require('./business-error').createBusinessError;

function assert(condition, code, message) {
  if (!condition) throw createBusinessError(code, message);
}

function assertMobile(mobile) {
  assert(/^1[3-9]\d{9}$/.test(String(mobile || '')), 'INVALID_MOBILE', '请输入正确的手机号');
}

function parseDate(date) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  assert(!Number.isNaN(parsed.getTime()), 'INVALID_DATE_RANGE', '请选择正确的日期');
  return parsed;
}

function getNights(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  assert(end > start, 'INVALID_DATE_RANGE', '离店日期必须晚于入住日期');
  return Math.round((end - start) / 86400000);
}

module.exports = { assert, assertMobile, parseDate, getNights };
