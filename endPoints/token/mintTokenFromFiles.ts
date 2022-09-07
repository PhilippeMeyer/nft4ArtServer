import fs from 'fs';
import os from 'os';
import path from 'path';
import { Request, Response } from "express";
import sharp from 'sharp';
import { NFTStorage, File, Blob } from 'nft.storage';
import { filesFromPath } from 'files-from-path'
import axios from "axios";

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

async function batchMintTokenFromFiles(req: Request, res: Response) {
    console.log('Folder:', app.locals.batchMintFolder);
    console.log(req.files);
    console.log(req.body);

    // Find among the fileds a field name image_raw which should point to the file containing the image
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

    const client = new NFTStorage({ token: config.nftSorageToken });
    var metadata: any = {};

    for (const file of files) {
        var cid = await client.storeBlob(new Blob([file.buffer]));
        console.log(cid);
        metadata[file.fieldname] = "ipfs://" + cid;
    };

    console.log('resize');
    const vignette = await sharp(image_raw.buffer).resize({width:350}).jpeg().toBuffer();
    var cid = await client.storeBlob(new Blob([vignette]));
    console.log('vignette:', cid);
    metadata.image = "ipfs://" + cid;  

    let key;
    for (key in req.body)  metadata[key] = req.body[key];
    
    console.log(metadata);
    console.log(path.join(app.locals.batchMintFolder, app.locals.batchMintTokenId.toString() + ".json"));
    fs.writeFileSync(path.join(app.locals.batchMintFolder, app.locals.batchMintTokenId.toString() + ".json"), JSON.stringify(metadata));

    res.sendStatus(200);
}

async function batchMintFinalize(req: Request, res: Response) {
    console.log('Finalize:', app.locals.batchMintFolder);

    const client = new NFTStorage({ token: config.nftSorageToken });
    const files = filesFromPath(app.locals.batchMintFolder, { pathPrefix: path.resolve(app.locals.batchMintFolder), hidden: false });
    const cid = await client.storeDirectory(files);
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