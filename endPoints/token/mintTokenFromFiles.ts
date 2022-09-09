import fs from 'fs';
import os from 'os';
import path from 'path';
import { Request, Response } from "express";
import sharp from 'sharp';
import { NFTStorage, File, Blob } from 'nft.storage';
import { filesFromPath } from 'files-from-path'
import axios from "axios";
import { BigNumber, constants, Contract, ContractFactory, errors, providers, utils, Wallet } from "ethers";


import { app } from "../../app.js";
import { config } from "../../config.js";
import { logger } from "../../loggerConfiguration.js";

let tmpDir;
const appPrefix = 'nft4art';

//
// batchMintStart
//
// This end point has no parameter
//
// This end point is used to initiate the minting of a collection.
//
// It creates a temp folder where all the metadata files will be stored (copying first the old content if any) and stores in
// app.locals.batchMintTokenId the last tokenId minted of the collection (in case the tokenIds are not already attributed) and in
// app.locals.batchMintFolder the folder where the files are stored
//

function batchMintStart(req: Request, res: Response) {
    try {
        app.locals.batchMintFolder = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
        // TODO find the first free token 
        app.locals.batchMintTokenId = 0;

        if (app.locals.ipfsFolder !== undefined) {
            let ipfsFolder = app.locals.ipfsFolder;
            ipfsFolder.replace('/{id}', ''); 
            readIpfsFolder(ipfsFolder, app.locals.batchMintFolder);
        }
    } catch { res.sendStatus(500); }
    
    res.sendStatus(200);
}

//
// batchMintTokenFromFiles
//
// Transfer a token to be minted
//
// Parameters: formdata containing:
//  - the files associated to the token
//  - properties:
//      - image_raw: name of the file containing the image
//      - numTokens: number of tokens to mint. default is 1
//      - tokenId: tokenId of the token, if not provided, it will be incremented
//      - description: decription of the token
//      - author: token's author
//      - name: token's name
//
// The files are stored on ipfs and their correponding cid inserted in the json describing the token
// All the provided properties are copied into the json file which saved into the temp folder
//

async function batchMintTokenFromFiles(req: Request, res: Response) {
    let tokenId:string;
    let numTokens:string;

    logger.info('server.mintFromFiles.createFolder: %s', app.locals.batchMintFolder);

    // Find among the fileds a field named image_raw which should point to the file containing the image
    if (req.body.image_raw === undefined) {
        logger.info('server.batchMintTokenFromFiles.noLabelToImage');
        res.status(400).json({error: {name: 'noLabelToImage', message: 'No label to image has been provided'}});
		return;
    }

    const files: any[] = req.files as any[];
    const image_raw: any = files.find((file) =>  file.fieldname == req.body.image_raw);

    if( image_raw === undefined) {
        logger.info('server.batchMintTokenFromFiles.noImageProvided');
        res.status(400).json({error: {name: 'noImageProvided', message: 'No image has been provided'}});
		return;
    }

    numTokens = (req.body.numTokens === undefined) ? '1' : req.body.numTokens;

    const client = new NFTStorage({ token: config.nftSorageToken });
    var metadata: any = {};

    for (const file of files) {
        var cid = await client.storeBlob(new Blob([file.buffer]));
        logger.info('server.mintFromFiles.createIpfsFile %s', cid);
        metadata[file.fieldname] = "ipfs://" + cid;
    };

    const vignette = await sharp(image_raw.buffer).resize({width:350}).jpeg().toBuffer();
    var cid = await client.storeBlob(new Blob([vignette]));
    logger.info('server.mintFromFiles.createIpfsVignette %s', cid);
    metadata.image = "ipfs://" + cid;  

    let key;
    for (key in req.body)  metadata[key] = req.body[key];
    
    if(req.body.tokenId === undefined) {
        tokenId = app.locals.batchMintTokenId.toString();
        app.locals.batchMintTokenId++;
    }
    else 
        tokenId = req.body.tokenId;
    
    const tid = parseInt(tokenId); 
    fs.writeFileSync(path.join(app.locals.batchMintFolder, tid.toString() + ".json"), JSON.stringify(metadata));

    const token:Contract = app.locals.token;
    const txResp = await token.mint(tokenId, numTokens, []);
    const txReceipt = await txResp.wait();
    
    res.sendStatus(200);
}

async function batchMintFinalize(req: Request, res: Response) {
    let key;
    let newCol:any = {};

    if(req.body.collections !== undefined) {
        let colFilename = app.locals.batchMintFolder + '/' + 'collections.json';
        if(fs.existsSync(colFilename)) {
            const data = fs.readFileSync(colFilename);
            const collection = JSON.parse(data.toString());
            newCol = JSON.parse(req.body.collections);
            for (key in newCol)  collection[key] = newCol[key];
            fs.writeFileSync(colFilename, JSON.stringify(collection));
        }
    }

    const client = new NFTStorage({ token: config.nftSorageToken });
    const files = filesFromPath(app.locals.batchMintFolder, { pathPrefix: path.resolve(app.locals.batchMintFolder), hidden: false });
    const cid = await client.storeDirectory(files);
    app.locals.ipfsFolder = cid;

    const token:Contract = app.locals.token;
    const txResp = await token.setDefaultURI('ipfs://' + cid + '/{id}.json');
    const txReceipt = await txResp.wait();
    logger.info('server.mintFromFiles.uriInserted %s', cid);

    res.sendStatus(200);
}

//
// readIpfsFolder
// 
// Parameters: 
//  - the CID of the Ipfs folder to copy
//  - the destination folder on the local filesystem
//
// This function copies the content of the ipfs folder into the local folder in order to merge together old and new content
// When new tokens are minted, the metadata files will be added into the same folder and when the minting is finalized the whole folder containing 
// old and new metadata files is then transferred to Ipfs
//    
async function readIpfsFolder(cid: string, folder:string) {
    let res:any = await axios('https://dweb.link/api/v0/ls?arg=' + cid);        //TODO Parametrize the request to the IPFS Gateway

    if(res.data.Objects === undefined) return null;

    res.data.Objects[0].Links.forEach( async (file:any) => {
        const results = await axios({
            method: "get",
            url: 'https://' + file.Hash + '.ipfs.dweb.link',
            responseType: "stream"});

        if (results.status != 200) {
            logger.error('server.readIpfsFolder.errFetchExisting');
            return null;
        }
        if(results.data === undefined || results.data == null) {
            logger.error('server.readIpfsFolder.errFetchExisting');
            return null;
        }

        const writeStream = fs.createWriteStream(folder + "/" + file.Name);
        results.data.pipe(writeStream);
    });
}

export { batchMintStart, batchMintTokenFromFiles, batchMintFinalize };