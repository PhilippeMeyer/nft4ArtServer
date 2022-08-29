import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';


const server = 'http://localhost:8999';
const urlMint = server + '/apiV1/token/mintTokenFromFiles';

var formData = new FormData();
let readStream = fs.createReadStream('appLogin.ts');
formData.append('files', readStream);
formData.append('files', readStream);
formData.append('files', readStream);
formData.append('property', 'model1');
formData.append('property', 'model2');
const res = await fetch(urlMint, { method: 'POST', body: formData});