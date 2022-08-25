import { utils, Wallet } from "ethers";
import fetch from 'node-fetch';

const server = 'http://localhost:8999';
const appId = 'test';
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
console.log('message: ', JSON.stringify(appLoginMessage));
const signature = await wallet.signMessage(JSON.stringify(appLoginMessage));
console.log('signature:', signature);

try {
    let msg: AppLogin = {
        message: appLoginMessage,
        signature: signature
    };

    const res1 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg)
    }); 

    const ret1 = await res1.json();
    console.log(ret1);

    if(res1.status == 200) jwt = ret1.accessToken;

    const res2 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg)
    }); 

    const ret2 = await res2.json();
    console.log(ret2);

    msg.message.nonce++;
    msg.signature = await wallet.signMessage(JSON.stringify(msg.message));

    const res3 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg)
    }); 

    const ret3 = await res3.json();
    console.log(ret3);

    // Should not work as the address has been registered with test and not test2
    msg.message.appId = 'test2';
    msg.signature = await wallet.signMessage(JSON.stringify(msg.message));

    const res4 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg)
    }); 

    const ret4 = await res4.json();
    console.log(ret4);

    const jwtHeader = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'authorization': 'Bearer ' + jwt };

    const res5 = await fetch(urlDrop, { method: 'POST', headers: jwtHeader, body: JSON.stringify(msg) }); 

    const ret5 = await res5.json();
    console.log(ret5);
}
catch(e) {console.log(e);}