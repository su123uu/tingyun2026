const templates = {
  mealOrderStatus: 'C4zcP7Aa--zKTf_hCrhfdOlHftnc235j3x83-D4PS88',
  reservationStatus: 'pxIcS6FOmd-u0Nw9p6n59FK1bqFBzEkYp39S7LmfRKk',
};

function enabledTemplateIds(keys) {
  return keys.map((key) => templates[key]).filter(Boolean);
}

module.exports = {
  templates,
  enabledTemplateIds,
};
