import fs from 'fs';
import os from 'os';
import path from 'path';
import { Request, Response } from "express";
import sharp from 'sharp';
import { NFTStorage, File, Blob } from 'nft.storage';
import { filesFromPath } from 'files-from-path'

import { app } from "../../app.js";
import { create } from "ipfs-http-client";
import { config } from "../../config.js";
import { logger } from "../../loggerConfiguration.js";

let tmpDir;
const appPrefix = 'nft4art';


function batchMintStart(req: Request, res: Response) {
    try {
        app.locals.batchMintFolder = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
        // TODO find the first free token 
        app.locals.batchMintTokenId = 0;
    } catch { res.sendStatus(500); }
    
    res.sendStatus(200);
}

async function batchMintTokenFromFiles(req: Request, res: Response) {
    console.log('Folder:', app.locals.batchMintFolder);
    console.log(req.files);
    console.log(req.body);
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

    /*const cid2 = 'bafkreif6tp7ipnpqb3ntbkuytpv2t2ambcabx3vlt5bn7y2j534evrwx54'

    for await (const file of ipfs.ls(cid2)) {
        console.log(file.path)
    }
    */
     
    //const fileInput: object[] = req.files as object[];
    //fileInput.forEach((file: sharp.SharpOptions | undefined) => {sharp(file).resize({width:100}).toFile('test')});
    res.sendStatus(200);
}

async function batchMintFinalize(req: Request, res: Response) {
    console.log('Finalize:', app.locals.batchMintFolder);

    const client = new NFTStorage({ token: config.nftSorageToken });
    const files = filesFromPath(app.locals.batchMintFolder, { pathPrefix: path.resolve(app.locals.batchMintFolder), hidden: false });
    const cid = await client.storeDirectory(files);
}

export { batchMintStart, batchMintTokenFromFiles, batchMintFinalize };