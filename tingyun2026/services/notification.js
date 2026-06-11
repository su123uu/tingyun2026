const config = require('../config/notifications');

function canRequestSubscribe() {
  return typeof wx !== 'undefined' && typeof wx.requestSubscribeMessage === 'function';
}

function isAccepted(value) {
  return value === 'accept' || value === 'acceptWithAudio';
}

async function requestSubscribe(keys = []) {
  const templateIds = config.enabledTemplateIds(keys);
  const result = {
    accepted_template_ids: [],
    accepted_keys: [],
  };

  if (!templateIds.length || !canRequestSubscribe()) return result;

  try {
    const response = await wx.requestSubscribeMessage({ tmplIds: templateIds });
    keys.forEach((key) => {
      const templateId = config.templates[key];
      if (templateId && isAccepted(response[templateId])) {
        result.accepted_template_ids.push(templateId);
        result.accepted_keys.push(key);
      }
    });
  } catch (error) {
    console.warn('requestSubscribeMessage skipped', error);
  }

  return result;
}

function requestMealOrderStatus() {
  return requestSubscribe(['mealOrderStatus']);
}

function requestReservationStatus() {
  return requestSubscribe(['reservationStatus']);
}

function requestDiningReservationStatus() {
  return requestSubscribe(['mealOrderStatus']);
}

module.exports = {
  requestMealOrderStatus,
  requestReservationStatus,
  requestDiningReservationStatus,
};
