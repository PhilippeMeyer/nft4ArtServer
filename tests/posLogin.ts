import fetch from 'node-fetch';

type DeviceResponse = {
    password: string;
    device: DeviceFromClient;
};

type DeviceFromClient = {
    deviceId: string;
    browser: string;
    browserVersion: string;
};
//const server = 'http://localhost:8999';
const server = 'https://nft4artserver.glitch.me';
const url = server + '/apiV1/auth/signin';

const device: DeviceFromClient = { deviceId: "12345", browser: "Chrome", browserVersion: "101" };
const resp: DeviceResponse = { password: "12345678", device: device };

try {
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
}
catch(e) {console.log(e);}

