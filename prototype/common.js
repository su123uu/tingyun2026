function navigateTo(page, query) {
  const target = page + ".html" + (query || "");
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", target: page, page: target }, "*");
  } else {
    window.location.href = target;
  }
}
function goBack(fallback) {
  if (window.history.length > 1) window.history.back();
  else navigateTo(fallback || "home");
}
function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}
function money(value) {
  return "¥" + Number(value || 0).toFixed(2);
}
