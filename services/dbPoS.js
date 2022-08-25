import db from './db';


function registerPos(posObj) {
    const {deviceId, autorized, namePoS, browser, browserVersion, ip} = posObj;
    const result = db.run('INSERT INTO registeredPoS (deviceId, autorized, namePoS, browser, browserVersion, ip) VALUES (@deviceId, @autorized, @namePoS, @browser, @browserVersion, @ip)', {deviceId, autorized, namePoS, browser, browserVersion, ip});
}

function findOne(deviceId) {
    const data = db.query(`SELECT * FROM registeredPoS ?`, [deviceId]);
    console.log(data);
}

module.exports = {
  registerPos, findOne
}