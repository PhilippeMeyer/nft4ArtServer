import sqlite, { Database } from 'better-sqlite3';
import path from "path";
import fs from "fs";

var db : Database;

function findOne(table: string, fieldName: string, id: string) {
    const result = db.prepare('SELECT * FROM ' + table + ' WHERE '+ fieldName + '=?').all([id]);
    if (result.length == 0) return null;
    else return result[0];
}

const initDb =  function(config: any) {
    const dbFile: string = path.resolve(config.dbName);
    const dbScript: string = path.resolve(config.creationScript);

    if (fs.existsSync(dbFile)) db = new sqlite(dbFile, {fileMustExist: true});
    else {
        const script = fs.readFileSync(dbScript);
        // TODO Manage the case when the script does not exist
        db = new sqlite(dbFile, {fileMustExist: false});
        db.exec(script.toString());
    }
}

const closeDb = function() {
    db.close();
}

const findRegisteredPos = function(deviceId: string) {
    return findOne('registeredPoS', 'deviceId', deviceId);
};

const insertNewPos = function(posObj: any) {
    posObj.namePoS = "undefined";
    const {deviceId, authorized, namePoS, browser, browserVersion, ip} = posObj;
    const authorizedN: number = authorized ? 1 : 0;
    const stmt = db.prepare('INSERT INTO registeredPoS(deviceId, authorized, namePoS, browser, browserVersion, ip) VALUES (?, ?, ?, ?, ?, ?)');
    const params = [deviceId, authorizedN, namePoS, browser, browserVersion, ip];
    const result = stmt.run(params);
}

const updateAuthorizedRegisteredPos = function(id: string, authorized: string) {
    db.prepare('UPDATE registeredPoS SET authorized=? WHERE deviceId=?').run([authorized ? 1 : 0, id]);
}

const updateIpRegisteredPos = function(id: string, ip: string) {
    db.prepare('UPDATE registeredPoS SET ip=? WHERE deviceId=?').run([ip, id]);
}

const findToken = function(tokenId: string) {
    return findOne('tokens', 'tokenId', tokenId);
}

const insertNewToken = function(token: any) {
    const {id, tokenIdStr, isLocked, price} = token;
    const stmt = db.prepare('INSERT INTO tokens(tokenId, id, isLocked, price, jsonData) VALUES (?, ?, ?, ?, ?)');
    const params = [id, tokenIdStr, isLocked ? 1 : 0, price, JSON.stringify(token)];
    const result = stmt.run(params);
}

const updatePriceToken = function(tokenId: string, price: number) {
    db.prepare('UPDATE tokens SET price=? WHERE tokenId=?').run([price, tokenId]);
}

const updateLockToken = function(tokenId: string, lock: number) {
    db.prepare('UPDATE tokens SET isLocked=? WHERE tokenId=?').run([lock, tokenId]);
}

const findAppId = function(addr: string) {
    return findOne('appIds', 'addressEth', addr);
}

const insertNewAppId = function(appIdRecord: any) {
    const {appId, address, nonce} = appIdRecord;
    const stmt = db.prepare('INSERT INTO appIds(appId, addressEth, nonce) VALUES (?, ?, ?)');
    const params = [appId, address, nonce];
    const result = stmt.run(params);

}

const updateNonceAppId = function(appId: string, nonce: number) {
    db.prepare('UPDATE appIds SET nonce=? WHERE appId=?').run([nonce, appId]);
}

const removeAppId = function(appId: string) {
    db.prepare('DELETE FROM appIds WHERE appId=?').run([appId]);
}

const insertNewSmartContract = function(address: string) {
    const stmt = db.prepare('INSERT INTO smartContracts(addressEth) VALUES (?)');
    const params = [address];
    const result = stmt.run(params);
}

const findAllSmartContracts = function() {
    return db.prepare('SELECT addressEth FROM smartContracts').all([]);
}

export {    initDb, closeDb, 
            findRegisteredPos, insertNewPos, updateIpRegisteredPos, updateAuthorizedRegisteredPos,
            findToken, insertNewToken, updatePriceToken, updateLockToken,
            findAppId, insertNewAppId, updateNonceAppId, removeAppId,
            insertNewSmartContract, findAllSmartContracts };