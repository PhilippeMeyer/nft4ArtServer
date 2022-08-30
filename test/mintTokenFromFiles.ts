import fs from 'fs';
import FormData from 'form-data';
import { expect } from "chai";
import chai from "chai";
import chaiHttp from 'chai-http';

const server = 'http://localhost:8999';
const image = './test/testImage.jpg'
const model = './test/appLogin.js'
const urlMint = '/apiV1/token/mintTokenFromFiles';

chai.use(chaiHttp);

describe('Minting tokens', function() {
    it('Sending a picture and a model to be minted', function (done) {

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
        chai.request(server)
        .post(urlMint)
        .type('form')
        .attach('image_raw', image, image)
        .attach('files', model, model)
        .field('description', 'Sweet spot')
        .field('author', 'Creative Commons')
        .then((res) => {
            expect(res).to.have.status(200);
            done();
        });
    });
})
