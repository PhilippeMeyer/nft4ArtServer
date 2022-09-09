import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const server = 'http://localhost:8999';
const urlMint = server + '/apiV1/token/batchMintTokenFromFiles';
const urlMintStart = server + '/apiV1/token/batchMintStart';
const urlMintFinalize = server + '/apiV1/token/batchMintFinalize';
const dirFolder = '../../../Nft4Art - Sphere Fragments Pictures';


async function mintSpheres() {
    let colstr: string;
    let tokenId: string;
    let name: string;
    let shardId: string;
    let collection: any = {};
    let json: any = {};

    fs.readdirSync(dirFolder).forEach(element => {
        colstr = element.substring(0,2);
        tokenId = element.substring(0,4);
        shardId = element.substring(1,3);
        name = element.substring(4,6) == "AA" ? 'image_front' : 'image_back';

        if(json[tokenId] == undefined) {
            json[tokenId] = {};
            json[tokenId]['image_raw'] = 'image_front';
            json[tokenId]['tokenId'] = tokenId;
        }
        json[tokenId][name] = element;

        if(collection[colstr] === undefined) collection[colstr] = [];
        collection[colstr].push(tokenId);
    });

    console.log(collection);
    let key: string;
    for (key in json) {
        if(json[key].image_front == undefined) json[key].image = 'image_back';
        console.log(json[key]);
    }

    let res: any;
    res = await fetch(urlMintStart, {method: 'POST'})
    console.log('init:', res.status);

    for (key in json) {
        let frontStream:any, backStream:any;
        var formData = new FormData();

        if (json[key].image_front !== undefined) {
            frontStream = fs.createReadStream(dirFolder + "/" + json[key].image_front);
            formData.append('image_front', frontStream);
        }
        if (json[key].image_back !== undefined) {
            backStream = fs.createReadStream(dirFolder + "/" + json[key].image_back);
            formData.append('image_back', backStream);
        }
        formData.append('tokenId', key);
        formData.append('description', 'Shard #' + key.substring(2,4));
        formData.append('author', 'Thomas Julier');
        formData.append('image_raw', json[key].image_raw);
        formData.append('name', 'Sphere #' + key.substring(0,2) + ' explosion simulation - shard #' + key.substring(2,4));
    
        res = await fetch(urlMint, {method: 'POST', body: formData});
        console.log('creation ', key, ' status:', res.status);
    }

    var formData = new FormData();
    console.log(JSON.stringify(collection));
    formData.append('collections', JSON.stringify(collection));
    res = await fetch(urlMintFinalize, {method: 'POST', body: formData});
    console.log(res.status);
}

mintSpheres();
