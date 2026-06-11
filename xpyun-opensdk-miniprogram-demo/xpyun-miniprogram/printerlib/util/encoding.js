const TextEncoder = require('./text-encoding').TextEncoder;

function CalcGbkLenForPrint(data) {
    let _encoder = new TextEncoder("gb2312", { NONSTANDARD_allowLegacyEncoding: true });
    let gbkData = _encoder.encode(data);
    return gbkData.length;
}

function CalcAsciiLenForPrint(data) {
    return data.length;
}

module.exports = {CalcGbkLenForPrint, CalcAsciiLenForPrint};