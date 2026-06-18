const config = require('../config/notifications');

function canRequestSubscribe() {
  return typeof wx !== 'undefined' && typeof wx.requestSubscribeMessage === 'function';
}

function isAccepted(value) {
  return value === 'accept' || value === 'acceptWithAudio';
}

function isTemplateConfigError(error) {
  return error && (error.errCode === 20001 || String(error.errMsg || '').includes('No template data return'));
}

async function requestSubscribe(keys = []) {
  const templateIds = config.enabledTemplateIds(keys);
  const result = {
    accepted_template_ids: [],
    accepted_keys: [],
  };

  if (!templateIds.length || !canRequestSubscribe()) return result;

  try {
    console.info('requestSubscribeMessage templates', keys, templateIds);
    const response = await wx.requestSubscribeMessage({ tmplIds: templateIds });
    console.info('requestSubscribeMessage response', response);
    keys.forEach((key) => {
      const templateId = config.templates[key];
      if (config.isUsableTemplateId(templateId) && isAccepted(response[templateId])) {
        result.accepted_template_ids.push(templateId);
        result.accepted_keys.push(key);
      }
    });
  } catch (error) {
    if (!isTemplateConfigError(error)) {
      console.warn('requestSubscribeMessage skipped', error);
    }
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
  return requestSubscribe(['diningReservationStatus']);
}

function requestMemberConsumption() {
  return requestSubscribe(['memberConsumption']);
}

function requestActivitySignupSuccess() {
  return requestSubscribe(['activitySignupSuccess']);
}

function requestActivitySignupWithConsumption() {
  return requestSubscribe(['activitySignupSuccess', 'memberConsumption']);
}

function requestMealOrderWithConsumption() {
  return requestSubscribe(['mealOrderStatus', 'memberConsumption']);
}

function requestReservationWithConsumption() {
  return requestSubscribe(['reservationStatus', 'memberConsumption']);
}

function requestDiningReservationWithConsumption() {
  return requestSubscribe(['diningReservationStatus', 'memberConsumption']);
}

module.exports = {
  requestMealOrderStatus,
  requestReservationStatus,
  requestDiningReservationStatus,
  requestMemberConsumption,
  requestActivitySignupSuccess,
  requestActivitySignupWithConsumption,
  requestMealOrderWithConsumption,
  requestReservationWithConsumption,
  requestDiningReservationWithConsumption,
};
