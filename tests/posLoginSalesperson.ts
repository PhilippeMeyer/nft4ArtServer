import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

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

try {
    console.log('Attempt to connect to a non registered PoS');
    const res1 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(resp)
    });

    const ret1 = await res1.json();
    console.log(ret1);

    const resp2 = {password: '12345678', device: device };

    console.log("Registering the PoS using the manager's password");
    const res2 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(resp2)
    });

    const ret2 = await res2.json();
    console.log(ret2);

    console.log("Reattempting to connect to the PoS");
    const res3 = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(resp)
    });

    const ret3 = await res3.json();
    console.log(ret3);
}
catch(e) {console.log(e);}

