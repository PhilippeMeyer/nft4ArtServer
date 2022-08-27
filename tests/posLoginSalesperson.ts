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
const url = server + '/apiV1/auth/signin';

const deviceId = uuidv4();

const device: DeviceFromClient = { deviceId: deviceId, browser: "Chrome", browserVersion: "101" };
const resp: DeviceResponse = { device: device };

describe('Testing logging in as salesperson', function() {
    it('Attempt to connect to a non registered PoS' , async function() {
    
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resp)
        });

        expect(res.status).to.equal(403);
        const ret = await res.json();
        expect(ret.error.name).to.equal('posNotAuthorized');
    });

    it("Registering the PoS using the manager's password" , async function() {

        const resp2 = {password: '12345678', device: device };

        const res = await fetch(url, {
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
    });

    it("Registering the PoS using the manager's password" , async function() {

        const res = await fetch(url, {
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
    });
});