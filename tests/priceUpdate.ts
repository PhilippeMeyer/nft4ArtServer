import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { expect } from "chai";

type DeviceResponse = {
    password?: string;
    device: DeviceFromClient;
};

type DeviceFromClient = {
    deviceId: string;
    browser: string;
    browserVersion: string;
};
const server = 'http://localhost:8999';
//const server = 'https://nft4artserver.glitch.me';
const urlLogin = server + '/apiV1/auth/signin';
const urlTokens = server + '/apiV1/tokens/list';
let urlSetPrice = server + '/apiV1/price/update';
const price = 100;

var jwt: string = "";

const deviceId = uuidv4();

const device: DeviceFromClient = { deviceId: deviceId, browser: "Chrome", browserVersion: "101" };
const resp: DeviceResponse = { password: "12345678", device: device };

describe("Setting a token's price", function() {
    it('Logging in as a manager with the correct password and setting and verifying a price', async function () {
        
        const res = await fetch(urlLogin, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(resp)
        });
    
        expect(res.status).to.equal(200);
        const ret = await res.json();
        expect (ret.accessToken).not.to.be.undefined;

        if(res.status == 200) jwt = ret.accessToken;
        const jwtHeader = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'authorization': 'Bearer ' + jwt };

        const res2 = await fetch(urlTokens, { method: 'GET', headers: jwtHeader } );
        const ret2 = await res2.json();
        expect(res2.status).to.equal(200);
        expect(ret2).to.have.lengthOf.above(0);
        if (ret2.length == 0) return;

        urlSetPrice += '?price=' + price.toString() + '&tokenId=' + ret2[0].id; 
        const res3 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res3.status).to.equal(200);

        const res4 = await fetch(urlTokens, { method: 'GET', headers: jwtHeader } );
        const ret4 = await res4.json();
        expect(ret4[0].price).to.be.equal(price);
    });

    //TODO Test if the message has been received
});

