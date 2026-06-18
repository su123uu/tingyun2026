const templates = {
  mealOrderStatus: 'C4zcP7Aa--zKTf_hCrhfdBwtGt7g-NTN2V6yEQ0mJ3Q',
  reservationStatus: 'pxIcS6FOmd-u0Nw9p6n59FK1bqFBzEkYp39S7LmfRKk',
  memberConsumption: 't7Ae7NshuMt3CPQkEeati0WHdRG4jNuWc0WTa301rpM',
  activitySignupSuccess: 'xZMhkpopzqoggQ-74qPwDsGhxEvInEAmSctDSrtBCJM',
  diningReservationStatus: 'qPXI6JBsNa70p6K-mL-8zhe8kW5xFwqJ4zZU5jwBkw4',
};

function isUsableTemplateId(templateId) {
  return typeof templateId === 'string' && templateId.trim().length >= 20;
}

function enabledTemplateIds(keys) {
  return keys.map((key) => templates[key]).filter(isUsableTemplateId);
}

module.exports = {
  templates,
  enabledTemplateIds,
  isUsableTemplateId,
};
