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
const urlSetPriceRoot = server + '/apiV1/price/update';
const urlGetPriceRoot = server + '/apiV1/price/priceInCrypto';
let urlSetPrice: string;
let urlGetPrice: string;
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

        urlSetPrice = urlSetPriceRoot + '?price=' + price.toString() + '&tokenId=' + ret2[0].id; 
        const res3 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res3.status).to.equal(200);

        const res4 = await fetch(urlTokens, { method: 'GET', headers: jwtHeader } );
        const ret4 = await res4.json();
        expect(ret4[0].price).to.be.equal(price);
    });

    it('Logging in as a manager with the correct password and setting a price on a non existing token ', async function () {

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

        urlSetPrice = urlGetPriceRoot + '?price=' + price.toString() + '&tokenId=123';
        const res2 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res2.status).to.equal(404);
    });

    it('Logging in as a manager with the correct password and not sending the price in the request', async function () {

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

        urlSetPrice = urlSetPriceRoot +  '?tokenId=' + ret2[0].id;
        const res3 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res3.status).to.equal(400);
    });

    it('Logging in as a manager with the correct password and not sending the token in the request', async function () {

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

        urlSetPrice = urlSetPriceRoot + '?price=100';
        const res3 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res3.status).to.equal(400);
    });

    it('Retrieving a price in BTC', async function () {

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

        urlSetPrice = urlSetPriceRoot + '?price=' + price.toString() + '&tokenId=' + ret2[0].id;
        const res3 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res3.status).to.equal(200);

        urlGetPrice = urlGetPriceRoot + '?tokenId=' + ret2[0].id + '&crypto=btc';
        const res4 = await fetch(urlGetPrice, { method: 'GET', headers: jwtHeader } );
        const ret4 = await res4.json();
        expect(ret4.tokenId).to.be.equal(ret2[0].id);
        expect(ret4.crypto).to.be.equal('btc');
        expect(ret4).to.have.property('price');
        expect(ret4).to.have.property('priceFiat');
        expect(ret4).to.have.property('rate');
    });

    it('Retrieving a price in ETH', async function () {

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

        urlSetPrice = urlSetPriceRoot + '?price=' + price.toString() + '&tokenId=' + ret2[0].id;
        const res3 = await fetch(urlSetPrice, { method: 'PUT', headers: jwtHeader } );
        expect(res3.status).to.equal(200);

        urlGetPrice = urlGetPriceRoot + '?tokenId=' + ret2[0].id + '&crypto=eth';
        const res4 = await fetch(urlGetPrice, { method: 'GET', headers: jwtHeader } );
        const ret4 = await res4.json();
        expect(ret4.tokenId).to.be.equal(ret2[0].id);
        expect(ret4.crypto).to.be.equal('eth');
        expect(ret4).to.have.property('price');
        expect(ret4).to.have.property('priceFiat');
        expect(ret4).to.have.property('rate');
    });

    //TODO Test if the message has been received
});

