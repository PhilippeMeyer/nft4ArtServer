import { utils, Wallet } from "ethers";
import fetch from 'node-fetch';
import { expect } from "chai";
import { v4 as uuidv4 } from 'uuid';


const server = 'http://localhost:8999';
const appId = uuidv4();

//const server = 'https://nft4artpos.glitch.me';
//const appId = 'fa70a269-784b-4c81-ad0c-06e63beec5d9';

const url = server + '/apiV1/auth/appLogin';
const urlDrop = server + '/apiV1/auth/appLoginDrop';
//const wallet: Wallet = Wallet.createRandom();
const wallet: Wallet = Wallet.fromMnemonic('ski ring tiny nephew beauty develop diesel gadget defense discover border cactus');
var jwt: string = "";

type AppLogin = {
    signature: string;
    message: AppLoginMessage;
};
type AppLoginMessage = {
    appId: string;
    address: string;
    nonce: number;
};

const addr = await wallet.getAddress();
const appLoginMessage: AppLoginMessage = { appId: appId, address: addr, nonce: Date.now()};
//console.log('message: ', JSON.stringify(appLoginMessage));
const signature = await wallet.signMessage(JSON.stringify(appLoginMessage));
//console.log('signature:', signature);
let msg: AppLogin = {
    message: appLoginMessage,
    signature: signature
};

describe('Testing logging in as a mobile app', function() {

    it('Attempt to connect and register to the server' , async function() {

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        }); 

        const ret = await res.json();
        expect(res.status).to.equal(200);
        expect (ret.accessToken).not.to.be.undefined;

        if(res.status == 200) jwt = ret.accessToken;
    });

    it('Attempt to connect to the server with the same message' , async function() {

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        }); 

        const ret = await res.json();
        expect(ret.error.name).to.equal('messageUsed');
        expect(res.status).to.equal(403);
    });

    it('Reattempt to connect to the server incrementing the nonce' , async function() {

        msg.message.nonce++;
        msg.signature = await wallet.signMessage(JSON.stringify(msg.message));

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        }); 

        const ret = await res.json();
        expect(res.status).to.equal(200);
        expect (ret.accessToken).not.to.be.undefined;
    });

    it('Attempt to connect to the server with another device' , async function() {

        // Should not work as the address has been registered with test and not test2
        msg.message.appId = 'test2';
        msg.signature = await wallet.signMessage(JSON.stringify(msg.message));

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        }); 

        const ret = await res.json();
        expect(ret.error.name).to.equal('addressRegistered');
        expect(res.status).to.equal(403);
    });

    it('Drop the device registration' , async function() {
        const jwtHeader = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'authorization': 'Bearer ' + jwt };

        const res = await fetch(urlDrop, { method: 'POST', headers: jwtHeader, body: JSON.stringify(msg) }); 
        const ret = await res.json();

        expect(res.status).to.equal(200);
    });

    it('Testing with a random address', async function() {
        
        const wallet: Wallet = Wallet.createRandom();
        const addr = await wallet.getAddress();
        const appLoginMessage: AppLoginMessage = { appId: appId, address: addr, nonce: Date.now()};
        const signature = await wallet.signMessage(JSON.stringify(appLoginMessage));
        let msg: AppLogin = {
            message: appLoginMessage,
            signature: signature
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        }); 

        const ret = await res.json();
        expect(res.status).to.equal(403);
        expect(ret.error.name).to.equal('noTokenOwner');
    });
});