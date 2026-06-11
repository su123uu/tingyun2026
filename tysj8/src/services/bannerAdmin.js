import cloudbase from '@cloudbase/js-sdk';
import { cloudbaseConfig } from '../config/cloudbase';

let appInstance;
let signInPromise;

function getToken() {
  return window.sessionStorage.getItem(cloudbaseConfig.tokenStorageKey) || '';
}

export function saveToken(token) {
  const nextToken = String(token || '').trim();
  window.sessionStorage.setItem(cloudbaseConfig.tokenStorageKey, nextToken);
  return nextToken;
}

export function readSavedToken() {
  return getToken();
}

export function clearToken() {
  window.sessionStorage.removeItem(cloudbaseConfig.tokenStorageKey);
}

async function getApp() {
  if (!appInstance) {
    appInstance = cloudbase.init({
      env: cloudbaseConfig.envId,
      region: cloudbaseConfig.region,
    });
  }
  await ensureLogin(appInstance);
  return appInstance;
}

async function ensureLogin(app) {
  if (signInPromise) return signInPromise;

  signInPromise = (async () => {
    try {
      if (typeof app.auth === 'function') {
        const auth = app.auth({ persistence: 'local' });
        if (auth && typeof auth.getLoginState === 'function') {
          const loginState = await auth.getLoginState();
          if (loginState) return;
        }
        if (auth && typeof auth.signInAnonymously === 'function') {
          await auth.signInAnonymously();
          return;
        }
        if (auth && auth.anonymousAuthProvider) {
          await auth.anonymousAuthProvider().signIn();
          return;
        }
      }

      if (app.auth && typeof app.auth.signInAnonymously === 'function') {
        const result = await app.auth.signInAnonymously();
        if (result && result.error) throw new Error(result.error.message || '匿名登录失败');
      }
    } catch (error) {
      signInPromise = null;
      throw new Error('云开发匿名登录未开启，请在身份源列表开启匿名登录后再刷新页面。');
    }
  })();

  return signInPromise;
}

export async function loginAdmin(username, password) {
  const data = await invokeAdmin('login', { username, password });
  saveToken(data.token);
  return data;
}

export async function callAdmin(action, payload = {}) {
  const adminToken = getToken();
  if (!adminToken) throw new Error('请先登录后台。');

  return invokeAdmin(action, {
    ...payload,
    admin_token: adminToken,
  });
}

async function invokeAdmin(action, payload = {}) {
  const app = await getApp();
  const response = await app.callFunction({
    name: cloudbaseConfig.functionName,
    data: {
      ...payload,
      action,
    },
    parse: true,
  });

  const body = response && response.result ? response.result : response;
  if (!body || body.ok !== true) {
    throw new Error((body && body.message) || '云函数调用失败。');
  }

  return body.data;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });
}
