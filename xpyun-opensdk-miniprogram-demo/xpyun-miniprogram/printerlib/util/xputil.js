//引入模块
const crypto = require('./crypto')

/**
 * 哈稀签名
 * @param signSource - 源字符串
 * @return
 */
function sign(signSource) {
   let signature = crypto.hex_sha1(signSource);
    return signature;
}

/**
 *获得毫秒数
*/
function getMillisecond() {
    return new Date().getTime();
}

/**
 * 获得字符串重复
 * @param str - 要进行重复的字符串
 * @param repeatTimes - 重复次数
*/
function strRepeat(str, repeatTimes) {
    let len = repeatTimes + 1
    return new Array(len).join(str);
}

module.exports = { sign, getMillisecond, strRepeat };