import fs from "fs";
import QRCode from "qrcode";
import { logger } from "./loggerConfiguration.js";
import { BigNumber, constants, Contract, ContractFactory, errors, providers, utils, Wallet } from "ethers";
import axios from "axios";
import path from "path";

import { receivedEthCallback } from "./services/receivedEthCallback.js"
import * as dbPos from './services/db.js';
import { app } from "./app.js";
import { createSmartContract } from "./services/createSmartContract.js";
import { config } from "./config.js"

//
// Server initialization
//
// This function retrieves the tokens' information on Ethereum via Infura and caches the images in a local directory
// If the images have not been cached, it retrieves those from Ipfs
//
// This function fills:
// 	- the meta global variable with the tokens' data
//	- the icons map (global variable) with the icons
//	- the image map (global variable) with the images
//
// Those global variables are stored in the locals property of the app object
//
//  app.locals.gvdNftDef:       Contract Abi of the GovernedNft
//  app.locals.ethProvider      Connection to the Ethereum provider
//  app.locals.token            Proxy to the smart contract
//  app.locals.metas            List of the Nfts loaded from the smart contract
//  app.locals.metasMap         Same information but organised in a map
//  app.locals.icons            Cache of the icons of the different tokens
//  app.locals.images           Cache of the different images
//  app.locals.passHash         Contains the hash of the wallet's password
//  app.locals.wallet           Refers to the server's wallet
//  app.locals.ipfsFolder       Contains the default URI from the smartcontract
//

async function init(exApp: any, config: any) {  
    // Read the ABI of the GovernedNft contract
    let rawAbi = fs.readFileSync(config.gvdNftAbiFile);
    const gvdNftDef = JSON.parse(rawAbi.toString());
    exApp.locals.gvdNftDef = gvdNftDef;

    exApp.locals.passHash = "";
    exApp.locals.wallet = {};
    exApp.locals.ethProvider = await new providers.InfuraProvider(config.network, config.infuraKey);


    let tokenList = dbPos.findAllSmartContracts();
    if (tokenList.length == 0) {
        logger.info('server.init.noSmartContractDefined');
        return;
    }

    let token: Contract;
    
    token = await new Contract(tokenList[0].addressEth, exApp.locals.gvdNftDef.abi, exApp.locals.ethProvider);
    loadToken(token, exApp);
}

async function loadToken(token: Contract, exApp:any ) {
    logger.info('server.init.loadToken');
    exApp.locals.token = token;

    var receivedEth = token.filters.ReceivedEth();
    token.on(receivedEth, receivedEthCallback)
    logger.info("server.init %s", token.address);

    let metas: Object[] = [];                   // list of the Nfts loaded from the smart contract
    let metasMap = new Map<String, any>();      // Same but as a map
    let icons = new Map();                      // Icons of the Nfts
    let images = new Map();                     // Images of the Nfts

    exApp.locals.metas = metas;
    exApp.locals.metasMap = metasMap;
    exApp.locals.icons = icons;
    exApp.locals.images = images;


    if (!fs.existsSync(config.cacheFolder)) fs.mkdirSync(config.cacheFolder);

    const QRaddr: string = path.join(config.cacheFolder, token.address + '.png');
    if(!fs.existsSync(QRaddr)) await QRCode.toFile(QRaddr, token.address);
    
    let i: number = 0;
    let str: string, strToken: string;
    let data: any;
    let loop: boolean = true;
    let errTimeout: number = 0;

    // Retrieve the past events on this contract to find out which id have been minted
    // Mints are coming from address '0x0000000000000000000000000000000000000000' and can be performed by any operator (first topic)
    const events = await token.queryFilter(
        token.filters.TransferSingle(null, "0x0000000000000000000000000000000000000000"),
        0,
        "latest",
    );

    const eventsB = await token.queryFilter(
        token.filters.TransferBatch(null, "0x0000000000000000000000000000000000000000"),
        0,
        "latest",
    );

    var ids: any[] = [];
    events.forEach((evt) => ids.push(evt?.args?.id));
    eventsB.forEach((evt) => ids.push(...evt?.args?.ids));

    for (i = 0; i < ids.length; i++) {
        const id = ids[i];
        strToken = await token.uri(id);
        app.locals.ipfsFolder = strToken;
        str = strToken.replace('ipfs:', 'https:').replace('/{id}', '.ipfs.dweb.link/' + id); //TODO parametrize the ipfs gateway

        if (errTimeout == 2) break; // If we face a timeout we retry twice

        try {
            var dataFromDb = dbPos.findToken(token.address + id );
            if (dataFromDb == null) {
                logger.info("server.init.loadTokens.fromIpfs %s", str);
                let resp = await axios.get(str); // The data is not in cache, we retrieve the JSON from Ipfs
                data = resp.data;
                data.id = token.address + id;
                data.tokenIdStr = id?.toString();
                data.tokenId = id;
                data.addr = token.address;
                data.isLocked = false;
                data.price = 0;
                //tokens.insert(data);
                dbPos.insertNewToken(data);
            } else {
                data = JSON.parse(dataFromDb.jsonData);
                logger.info("server.init.loadTokens.fromCache %s", str);
            }
        } catch (error) {
            const err = error as any;
            if (typeof err.response != "undefined") {
                // We have received a proper response but containing an error
                logger.warn("server.init.loadTokens %s", str, err.response.status);
                if (err.response.status == 504) {
                    errTimeout++;
                    continue;
                } // 504 = Gateway timeout
                if (err.response.status == 408) {
                    errTimeout++;
                    continue;
                } // 408 = Request timeout
                if (err.response.status == 404) break; // 404 = not found, we stop as the information is not available
            } else logger.error("server.init.loadTokens %s", err); // We log here network errors
        }

        metas.push(data);
        metasMap.set(data.id, data);

        errTimeout = 0;
    }

    // TODO: store incrementally the transfers in the database so that the loading time does not increase over time
    // This can be performed storing the last block id retrieved and re querying from there
    //const transfersSingle = await token.queryFilter( token.filters.TransferSingle(null, null), 0, "latest");
    //const transfersBatch = await token.queryFilter( token.filters.TransferBatch(null, null), 0, "latest");

    //console.log('Single transfers', transfersSingle);
    //console.log('Batch transfers', transfersBatch);

    //
    // Retrieve the icons, looking at the cache in case the icon has been already retrieved
    //
    let buf: Buffer;

    const getIcons = Promise.all(
        metas.map(async (meta: any) => {
            let cid = config.cacheFolder + meta.image.replace("ipfs://", ""); // We remove the ipfs prefix to only keep the cid
            let icon = meta.image.replace("ipfs", "https").concat(".ipfs.dweb.link"); // We form an url for dweb containing the ipfs cid
            try {
                if (fs.existsSync(cid)) {
                    // We try to find this cid in the cache
                    logger.info("server.init.loadIcons.cache %s", cid);
                    buf = Buffer.from(fs.readFileSync(cid, { encoding: "binary" }), "binary");
                } else {
                    // Not available in the cache, we get it from ipfs
                    logger.info("server.init.loadIcons.ipfs %s", cid);
                    const resp = await axios.get(icon, { responseType: "arraybuffer" });
                    buf = Buffer.from(resp.data, "binary");
                    fs.writeFileSync(cid, buf, { flag: "w", encoding: "binary" }); // Save the file in cache
                }

                icons.set(meta.id, buf); // Store the icon in memory
            } catch (error) {
                logger.error("server.init.loadIcons %s", error);
            }

            meta.iconUrl = config.iconUrl + meta.id; // Reference the icon's url
        }),
    );

    //
    // Retrieve the images, looking at the cache in case the image has been already retrieved
    //
    const getImages = Promise.all(
        metas.map(async (meta: any) => {
            const img = meta.image_raw;
            let cid = config.cacheFolder + meta[img].replace("ipfs://", "");
            try {
                if (fs.existsSync(cid)) {
                    logger.info("server.init.loadImages.cache %s", cid);
                    buf = Buffer.from(fs.readFileSync(cid, { encoding: "binary" }), "binary");
                } else {
                    logger.info("server.init.loadImages.ipfs %s", cid);
                    let image = meta[img].replace("ipfs", "https").concat(".ipfs.dweb.link");
                    const resp = await axios.get(image, { responseType: "arraybuffer" });
                    buf = Buffer.from(resp.data, "binary");
                    fs.writeFileSync(cid, buf, { flag: "w", encoding: "binary" });
                }

                images.set(meta.id, buf);
            } catch (error) {
                logger.error("server.init.loadIcons %s", error);
            }

            meta.imgUrl = config.imgUrl + meta.id;
        }),
    );

    await Promise.all([getIcons, getImages]);
    logger.info('server.init.loadTerminated');
}

export { init, loadToken };
