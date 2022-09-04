import fs from 'fs';
import FormData from 'form-data';
import { expect } from "chai";
import chai from "chai";
import chaiHttp from 'chai-http';

const server = 'http://localhost:8999';
const image = './test/testImage.png'
const model = './test/appLogin.js'
const urlMint = '/apiV1/token/batchMintTokenFromFiles';
const urlMintStart = '/apiV1/token/batchMintStart';
const urlMintFinalize = '/apiV1/token/batchMintFinalize';

chai.use(chaiHttp);
var res: any;

describe('Minting tokens', function() {
    it('Sending a picture and a model to be minted', async function (done) {
        this.timeout(100000);
/*
        let imgStream = fs.createReadStream(image);
        let mdlStream = fs.createReadStream('appLogin.js');
        var formData = new FormData();
        formData.append('image_raw', imgStream);
        formData.append('files', mdlStream);
        formData.append('description', 'Sweet spot');
        formData.append('author', 'Creative Commons');
        formData.append('name', 'Paradise');
*/
        res = await chai.request(server)
        .post(urlMintStart);
        expect(res).to.have.status(200);

        res = await chai.request(server)
        .post(urlMint)
        .type('form')
        .attach('image_front', image, image)
        .attach('test', model, model)
        .field('description', 'Sweet spot')
        .field('image_raw', 'image_front')
        .field('author', 'Creative Commons');
        console.log(res);
        
        expect(res).to.have.status(200);

        res =  await chai.request(server)
        .post(urlMintFinalize);
        expect(res).to.have.status(200);

        done();
    });
})
