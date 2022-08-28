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
var jwt: string = "";

const deviceId = uuidv4();

const device: DeviceFromClient = { deviceId: deviceId, browser: "Chrome", browserVersion: "101" };
const resp: DeviceResponse = { password: "12345678", device: device };

describe('Retrieving the tokens', function() {
    it('Logging in as a manager with the correct password and retrieving the tokens', async function () {
        
        const res = await fetch(urlLogin, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
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
        if (ret2.length > 0) {
            expect(ret2[0]).to.have.property('id');
            expect(ret2[0]).to.have.property('description');
            expect(ret2[0]).to.have.property('image_raw');
            expect(ret2[0]).to.have.property('image');
            expect(ret2[0]).to.have.property('name');
            expect(ret2[0]).to.have.property('tokenIdStr');
            expect(ret2[0]).to.have.property('tokenId');
            expect(ret2[0]).to.have.property('addr');
            expect(ret2[0]).to.have.property('isLocked');
            expect(ret2[0]).to.have.property('price');
            expect(ret2[0]).to.have.property('iconUrl');
            expect(ret2[0]).to.have.property('imgUrl');
        }
    });

    it('Logging in as a salesman and retrieving the tokens', async function () {
        const resp2: DeviceResponse = { device: device };

        const res = await fetch(urlLogin, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resp2)
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
        if (ret2.length > 0) {
            expect(ret2[0]).to.have.property('id');
            expect(ret2[0]).to.have.property('description');
            expect(ret2[0]).to.have.property('image_raw');
            expect(ret2[0]).to.have.property('image');
            expect(ret2[0]).to.have.property('name');
            expect(ret2[0]).to.have.property('tokenIdStr');
            expect(ret2[0]).to.have.property('tokenId');
            expect(ret2[0]).to.have.property('addr');
            expect(ret2[0]).to.have.property('isLocked');
            expect(ret2[0]).to.have.property('price');
            expect(ret2[0]).to.have.property('iconUrl');
            expect(ret2[0]).to.have.property('imgUrl');
        }
    });
});

