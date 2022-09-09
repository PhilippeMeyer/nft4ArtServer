import express, { Request, Response } from "express";
import multer  from "multer";
import cors from "cors";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { BigNumber, constants, Contract, ContractFactory, errors, providers, utils, Wallet } from "ethers";
import { TransactionReceipt, TransactionResponse } from "@ethersproject/abstract-provider";
import fs from "fs";
import Loki from "lokijs";
import axios from "axios";
import expressWinston from "express-winston";
// TODO: is it used?
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { waitFor } from "./waitFor.js";

import { init } from "./init.js";
import { app } from "./app.js";
import { RequestCustom } from "./requestCustom.js"
import { logConf, logger } from "./loggerConfiguration.js";

import * as dbPos from './services/db.js';
import { createSmartContract } from './services/createSmartContract.js';
import { config } from "./config.js";

import { generateWallets } from "./endPoints/information/generateWallets.js";
import { tokensOwned } from "./endPoints/information/tokensOwned.js";
import { threeDmodel } from "./endPoints/information/threeDmodel.js"; 
import { video } from "./endPoints/information/video.js"; 
import { signin } from "./endPoints/auth/signin.js";
import { verifyTokenApp } from "./endPoints/auth/verifyTokenApp.js";
import { verifyToken } from "./endPoints/auth/verifyToken.js";
import { verifyTokenManager } from "./endPoints/auth/verifyTokenManager.js";
import { appLogin, appLoginDrop } from "./endPoints/auth/appLogin.js";
import { priceInCrypto } from "./endPoints/price/priceInCrypto.js";
import { priceUpdate, priceUpdates } from "./endPoints/price/priceUpdate.js";
import { authorizePoS } from "./endPoints/auth/authorizePoS.js";
import { batchMintTokenFromFiles, batchMintStart, batchMintFinalize } from "./endPoints/token/mintTokenFromFiles.js";


// TODO: Env var?
const webSite: string = "http://192.168.1.5:8999";

const NFT4ART_ETH_NETWORK = 1;
const NFT4ART_BTC_NETWORK = 2;
const NFT4ART_FIAT_NETWORK = 3;
const NFT4ART_SALE_INITIATED = 1;
const NFT4ART_SALE_INITIATED_MSG = "saleInitiated";
const NFT4ART_SALE_STORED_MSG = "saleStored";
const NFT4ART_SALE_PAID = 2;
const NFT4ART_SALE_PAID_MSG = "salePaid";
const NFT4ART_SALE_TRANSFERRED = 3;
const NFT4ART_SALE_TRANSFERRED_MSG = "saleTransferred";

const PoS_COLLECTION_NAME = "registeredPoS";
const TOKEN_COLLECTION_NAME = "tokens";
const SALES_EVENTS_COLLECTION_NAME = "saleEvents";
const APP_ID_COLLECTION_NAME = "appIds";

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })
//const upload = multer({dest: 'uploads/'});

// Global variables

var databaseInitialized = false;            // Is the database initialized? Used to wait for the database init before starting the server

//TODO: have a look if it is possible to type the loki collection
var registeredPoS: any;                     // Database collection of registered point of sale
var tokens: any;                            // Database collection of tokens
var saleEvents: any;                        // Database collection of events (lock/unlock/transfer/completedTransfer)
//var appIds: Collection<AppLoginMessage>;    // Database collection of companion app Ids
//var wallet: Wallet;                         // Wallet
//let ethProvider: providers.JsonRpcProvider; // Connection provider to Ethereum

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config.__dirname = __dirname;

// Initialize and configure the logger (winston)


// Database creation

dbPos.initDb(config);

let options: Partial<LokiConstructorOptions> & Partial<LokiConfigOptions> & Partial<ThrottledSaveDrainOptions> = {
    autoload: true,
    autoloadCallback: loadHandler,
    autosave: true,
    autosaveInterval: 4000, // 4 seconds
};
var db = new Loki(config.database, options);

// Database initialization, creating the PoS and tokens collections if they are not already existing
// When the database is initialized, the flag is set so that the server can start

function loadHandler() {
    // if database did not exist it will be empty so I will intitialize here
    registeredPoS = db.getCollection(PoS_COLLECTION_NAME) ?? db.addCollection(PoS_COLLECTION_NAME);
    tokens = db.getCollection(TOKEN_COLLECTION_NAME) ?? db.addCollection(TOKEN_COLLECTION_NAME);
    saleEvents = db.getCollection(SALES_EVENTS_COLLECTION_NAME) ?? db.addCollection(SALES_EVENTS_COLLECTION_NAME);
    //appIds = db.getCollection(APP_ID_COLLECTION_NAME) ?? db.addCollection(APP_ID_COLLECTION_NAME);
    databaseInitialized = true;
}

type SaleEventRecord = {
    typeMsg: string;
    id: string;
    isLocked: boolean;
    destinationAddr?: string;
    isStored?: boolean,
    isTransferred?: boolean;
    isFinalized?: boolean;
    txId?: string;
    error?: string;
};

// Express cleanup function. Saving the database when the server terminates

const cleanup = (callback: () => void) => {
    process.on("exit", callback);

    // catch ctrl+c event and exit normally
    process.on("SIGINT", () => {
        logger.info("server %s", "Ctrl-C...");
        process.exit(2);
    });

    //catch uncaught exceptions, trace, then exit normally
    process.on("uncaughtException", (e) => {
        logger.error("server %s", "Uncaught Exception...");
        logger.error("server %s", e.stack);
        process.exit(99);
    });
};

const exitHandler = () => {
    db.saveDatabase();
    dbPos.closeDb();
    console.log("Server stopping...saved database");
};

cleanup(exitHandler);

//
// Server Init:
//
// For security reasons, the server does not store the wallet's password.
// Therefore, no action can be performed before loading the wallet with /apiV1/auth/signin where the wallet owner submits the password
// This password is used to unlock the wallet and the hash of this password is kept in memory so that further admin functions can be checked
// against this password. If a wrong password is given to unlock the wallet, this generates an error an the password hash is empty blocking
// any further operation.
//
// Client Connections:
//
// Each Point of Sale has to be registered first. The registration is performed on the PoS side by generating a key pair and sending to the server
// the mobile unique Id encrypted with the private key together with the public key. The server stores in sqlite the mobile Id and its associated
// public key. The server's admin is then invited to validate this registration.
//
// Once a PoS registered, the connection is performed sending a signature of the mobile unique Id when the biometrics on the PoS have been validated
// When this signature is received, the server creates then a JWT which is used between the PoS and the server
//


init(app, config);

//initialize a simple http server
const server = http.createServer(app);

//initialize the WebSocket server instance
//const wss = new WebSocketServer({ noServer: true });
const wss = new WebSocketServer({ server: server });

app.use(express.static("public"));
app.use(express.static("build"));
app.use(cors());
//app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(expressWinston.logger(logConf));
app.set('views', path.join(config.__dirname, 'views'));
app.set('view engine', 'ejs');


waitFor(() => databaseInitialized).then(() =>
    server.listen(process.env.PORT || 8999, () => {
        //console.log(`Server started on port ${server.address().port} :)`);
        logger.info("server.started %s", `on port ${process.env.PORT || 8999}`);
    }),
);

/*
app.get('/*', function (req :Request, res :Response) {
	res.sendFile(path.join(__dirname, 'build', 'index.html'));
});
*/




//
// /apiV1/auth/authorizePoS
// Authorize or not a registered Point of Sale
//
// This end point receives the public key the PoS has generated and the encrypted mobile unique Id
//
//app.post("/apiV1/auth/registerPoS", function (req: Request, res: Response) {});

type registeredPosRecord = {
    deviceId: string;
    autorized: number; 
    namePoS: string;
    browser: string;
    browserVersion: string;
    ip: string;
}

app.post("/apiV1/auth/signin", signin);
app.post("/apiV1/auth/appLogin", appLogin); 
app.post("/apiV1/auth/appLoginDrop", verifyTokenApp, appLoginDrop);
app.put("/apiV1/auth/authorizePoS", verifyTokenManager, authorizePoS);


app.get('/apiV1/information/video', verifyTokenApp, video);
app.get('/apiV1/information/tokensOwned', verifyTokenApp, tokensOwned);
//app.get('/apiV1/information/3Dmodel', verifyTokenApp, threeDmodel);
app.get('/apiV1/information/3Dmodel', threeDmodel);
app.get("/apiV1/information/generateWallets", verifyTokenManager, generateWallets);

app.get('/apiV1/price/priceInCrypto', priceInCrypto);
app.put("/apiV1/price/update", verifyTokenManager, priceUpdate);
app.put("/apiV1/price/updates", verifyTokenManager, priceUpdates);

app.post('/apiV1/token/batchMintStart', batchMintStart); 
app.post('/apiV1/token/batchMintTokenFromFiles', upload.any(), batchMintTokenFromFiles); 
app.post('/apiV1/token/batchMintFinalize', upload.any(), batchMintFinalize); 

app.get(["/tokens", "/apiV1/tokens/list"], verifyToken, (req: Request, res: Response) => {
    res.status(200).json(app.locals.metas);
});

app.get("/token", verifyToken, (req: Request, res: Response) => {
    console.log(req.query.id);
    const id = parseInt(req.query.id as string);
    res.status(200).json(app.locals.metas[id]);
});

app.get("/map", function (req: Request, res: Response) {
    res.sendFile(path.join(__dirname, "public/mapping_rects.json"));
});

app.get("/icon", function (req: Request, res: Response) {
    res.type("png");
    res.status(200).send(app.locals.icons.get(req.query.id));
});

app.get("/image", function (req: Request, res: Response) {
    res.type("jpeg");
    res.status(200).send(app.locals.images.get(req.query.id));
});

app.get("/QRCode", function (req: Request, res: Response) {
    res.type("png");
    res.status(200).sendFile(path.join(config.cache, config.addressToken + '.png'));
});


//
// /apiV1/auth/registeredPoS
//
// This end point sends back all the registered PoS
//
app.get("/apiV1/auth/registeredPoS", verifyTokenManager, function (req: Request, res: Response) {
    res.status(200).json(registeredPoS.find());
});

//
// /apiV1/log/allEvents
//
// This end point sends back the events of the day
//
app.get("/apiV1/log/allEvents", verifyTokenManager, function (req: Request, res: Response) {
    let start: Date = new Date();
    start.setUTCHours(0, 0, 0, 0);
    let end: Date = new Date();
    end.setUTCHours(23, 59, 59, 999);

    var results: any = saleEvents.find({
        "meta.created": { $between: [start.getTime(), end.getTime()] },
    });
    res.status(200).json(results);
});


//
// /apiV1/sale/createToken, parameters: the token's Uri
//
// This end point deploys on the blockchain a new token
//
app.post('/apiV1/sale/createToken', verifyToken, async function(req :RequestCustom, res :Response) {
    if (typeof req.query.uri === 'undefined') {
          res.sendStatus(400).json({error: {name: 'noURISpecified', message: 'The Uri for the contract is missing'}});
          return;
      }
    let contract:any = createSmartContract();
    res.status(200).json({contractAddress: contract.address});
    
  });
  
//
// /apiV1/sale/transfer, parameters: the token's id and the destination address
//
// This end point transfers the specified token to the new owner.
// It performs the Blockchain transaction
//
app.post("/apiV1/sale/transfer", verifyToken, async function (req: RequestCustom, res: Response) {
    const tokenAddr: string = req.body.tokenAddr;
    const tokenId: string = req.body.tokenId;
    const destinationAddr: string = req.body.destinationAddress;
    console.log("transfer tokenId: ", tokenAddr, tokenId, destinationAddr);

    logger.info("server.transfer.requested - token: %s, destination: %s", tokenId, destinationAddr);
    const saleEvent: SaleEventRecord = {
        typeMsg: "transferRequest",
        id: req.body.id as string,
        isLocked: true,
        destinationAddr,
    };
    saleEvents.insert(saleEvent);

    let tokenWithSigner = app.locals.token.connect(app.locals.wallet);
    console.log(tokenWithSigner);
    console.log("token");
    console.log(app.locals.token);
    console.log("wallet");
    console.log(app.locals.wallet);
    tokenWithSigner
        .safeTransferFrom(app.locals.wallet.address, destinationAddr, tokenId, 1, [])
        .then((transferResult: TransactionResponse) => {
            res.sendStatus(200);
            const saleEvent: SaleEventRecord = {
                typeMsg: "transferInitiated",
                id: req.body.tokenId as string,
                isLocked: true,
                destinationAddr,
                isTransferred: true,
            };
            saleEvents.insert(saleEvent);
            logger.info("server.transfer.initiated - token: %s, destination: %s", tokenId, destinationAddr);
            transferResult.wait().then((transactionReceipt: TransactionReceipt) => {
                const saleEvent: SaleEventRecord = {
                    typeMsg: "transferCompleted",
                    id: req.body.tokenId as string,
                    isLocked: true,
                    destinationAddr,
                    isTransferred: true,
                    isFinalized: true,
                    txId: transactionReceipt.transactionHash,
                };

                saleEvents.insert(saleEvent);
                logger.info(
                    "server.transfer.performed token %s destination %s - TxHash: %s",
                    tokenId,
                    destinationAddr,
                    transactionReceipt.transactionHash,
                );
                // Update the balance once the transfer has been performed
                app.locals.token.balanceOf(app.locals.wallet.address, tokenId).then((balance: any) => {
                    const tk = app.locals.metasMap.get(tokenAddr + tokenId);
                    if (tk != null) {
                        tk.availableTokens = balance.toString();
                        if (balance.isZero()) {
                            tk.isLocked = true;
                            sendLock(tokenId, true);
                        }
                    }
                });
            });
        })
        .catch((error: errors) => {
            res.status(412).json(error);
            logger.error("server.transfer.error %s", error);
            const saleEvent: SaleEventRecord = {
                typeMsg: "transferInitiated",
                id: req.body.tokenId as string,
                isLocked: true,
                destinationAddr,
                isTransferred: false,
                isFinalized: false,
                txId: undefined,
                error,
            };
            saleEvents.insert(saleEvent);
        });
});

//
// /apiV1/sale/transferEth
// parameters: 
//  - the token's id
//  - the token's address
//  - destination address (which the address from which the token is going to be paid)
//  - the final token's price
//
// This end point records the sale of the specified token to the new owner when paid in Ether
// The effective transfer is performed whan the ethers have been received
// When ethers are reaching the smart contract, it is triggering an event which is received by the server and triggers the transfer
//
app.post("/apiV1/sale/transferEth", verifyToken, async function (req: RequestCustom, res: Response) {
    const tokenAddr: string = req.body.tokenAddr;
    const tokenId: string = req.body.tokenId;
    const finalPrice: string = req.body.finalPrice;
    const destinationAddr: string = req.body.destinationAddress;
    const decimalsEth = 18;
    console.log("transfer tokenId: ", tokenAddr, tokenId, destinationAddr);

    logger.info("server.transfer.requested - token: %s, destination: %s, price: %s", tokenId, destinationAddr, finalPrice);
    const saleEvent: SaleEventRecord = {
        typeMsg: "transferRequest",
        id: req.body.id as string,
        isLocked: true,
        destinationAddr,
    };
    saleEvents.insert(saleEvent);

    /* 
    
    The NFT Smart contract is able to store sales records in the following format:

    struct SaleRecord {
        bytes32 buyer;                  // Buyer's address (can also be a bitcoin address)
        uint128 price;                  // Price as an integer
        uint8   decimals;               // Decimals applied to the price
        bytes3  currency;               // Currency 3 letters Iso country code + ETH and BTC 
        bytes1  network;                // Network on which the payment is performed
        bytes1  status;                 // Sale's status: initiated, payed, completed, ....
    }
    */

    const saleRecord = {
        buyer: utils.formatBytes32String(destinationAddr),
        decimals: decimalsEth,
        price: parseFloat(finalPrice) * 10 ** decimalsEth,
        currency: 'eth',
        network: NFT4ART_ETH_NETWORK,
        status: NFT4ART_SALE_INITIATED
    };

    let tokenWithSigner = app.locals.token.connect(app.locals.wallet);
    tokenWithSigner
        .saleRecord(tokenId, saleRecord)
        .then((transferResult: TransactionResponse) => {
            res.sendStatus(200);
            const saleEvent: SaleEventRecord = {
                typeMsg: NFT4ART_SALE_INITIATED_MSG,
                id: tokenId,
                isLocked: true,
                destinationAddr: destinationAddr,
                isTransferred: false,
                isStored: false
            };
            saleEvents.insert(saleEvent);
            logger.info("server.store.sale.init - token: %s, destination: %s", tokenId, destinationAddr);
            transferResult.wait().then((transactionReceipt: TransactionReceipt) => {
                const saleEvent: SaleEventRecord = {
                    typeMsg: NFT4ART_SALE_STORED_MSG,
                    id: tokenId,
                    isLocked: true,
                    destinationAddr: destinationAddr,
                    isTransferred: false,
                    isFinalized: false,
                    isStored: true,
                    txId: transactionReceipt.transactionHash,
                };

                saleEvents.insert(saleEvent);
                logger.info("server.store.sale.performed token %s destination %s - TxHash: %s", tokenId, destinationAddr, transactionReceipt.transactionHash );
            });
        })
        .catch((error: errors) => {
            res.status(412).json(error);
            logger.error("server.store.sale.error %s", error);
            const saleEvent: SaleEventRecord = {
                typeMsg: NFT4ART_SALE_INITIATED_MSG,
                id: tokenId,
                isLocked: true,
                destinationAddr: destinationAddr,
                isTransferred: false,
                isFinalized: false,
                isStored: false,
                txId: undefined,
                error,
            };
            saleEvents.insert(saleEvent);
        });
});

//
// /apiV1/token/mintIpfsFolder
// parameter:
//  - folderName: Ipfs CID of the folder where the tokens' metadata are stored
//
// This end point retrieves from Ipfs the content of the CID which should be a folder containig metadata files for eaxh token
// For each metadata file the id is used to mint the corresponding token in the start contract
// The quantity minted is defined in the metadata. If no amount is specified, default is one piece
//
app.post("/apiV1/token/mintIpfsFolder", verifyTokenManager, async function (req: Request, res: Response) {
    if (req.query.folderName === undefined)   return res.status(400).json({error: {name: 'noFolderSpecified', message: 'The Ipfs folder is missing'}});

    const urlIpfs = config.urlIpfs + req.query.folderName;
    let resp = await axios.get(urlIpfs);

    var ids = resp.data.Objects[0].Links.map( (item: any) =>  path.parse(item.Name).name );
    var existingIds = ids.filter((item: any) => app.locals.metasMap.get(config.addressToken + item) !== undefined )
    if (existingIds.length !=0 ) return res.status(400).json({error: {name: 'alreadyExistingToken', message: 'The contract already contains tokens Ids requested to mint'}});
    var bigIntIds = ids.map((item: any) => {
        try { return BigNumber.from(item);  }
        catch(e) {return undefined}
    })
    if (bigIntIds.findIndex(Object.is.bind(null, undefined)) != -1) return res.status(400).json({error: {name: 'invalidId', message: 'One of the Ids to mint is invalid'}});
    
    var amounts = resp.data.Objects[0].Links.map( (item: any) => item.amount === undefined ? constants.One : BigNumber.from(item.amount));
    let tokenWithSigner = app.locals.token.connect(app.locals.wallet);
    try {
        var tx = await tokenWithSigner.mintBatch(bigIntIds, amounts, [] );
        await tx.wait();
        res.sendStatus(200);
    } catch(e) { res.status(400).json({error: {name: 'errorMintingTokens', message: 'Error minting the tokens'}}); }
});


interface ExtWebSocket extends WebSocket {
    isAlive: boolean;
    address: string;
    pos: any;
}

function sendLock(id: string, isLocked: boolean) {
    sendMessage(JSON.stringify(new LockMessage(id, isLocked)));
}

function sendMessage(msg: string) {
    setTimeout(() => {
        wss.clients.forEach((client) => {
            console.log("send " + msg + client);
            client.send(msg);
        });
    }, 1000);
}

export { sendMessage };

export class LockMessage {
    public typeMsg: string = "lock";

    constructor(public id: string, public isLocked: boolean = true) {}
}

wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    const extWs = ws as ExtWebSocket;

    extWs.address = req.socket.remoteAddress as string;
    logger.info("server.ws.connection %s", extWs.address);
    const pos: any = registeredPoS.findOne({ ip: extWs.address });
    if (pos == null) {
        logger.warn("server.ws.connection.rejected %s", extWs.address);
        ws.close();
        return;
    }
    if (!pos.authorized) {
        logger.warn("server.ws.connection.unauthorized %s", extWs.address);
        ws.close();
        return;
    }

    pos.isConnected = true;
    registeredPoS.update(pos);
    extWs.pos = pos;

    extWs.isAlive = true;

    extWs.on("pong", () => {
        extWs.isAlive = true;
    });

    extWs.on("error", (err) => {
        logger.warn("server.ws.disconnection %s %s", err, extWs.address);
        extWs.pos.isConnected = false;
        registeredPoS.update(pos);
    });

    extWs.on("close", (code: any, buffer: any) => {
        logger.info("server.ws.close %s", buffer);
        extWs.pos.isConnected = false;
        registeredPoS.update(pos);
    });
});

setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
        const extWs = ws as ExtWebSocket;

        if (!extWs.isAlive) return ws.terminate();

        extWs.isAlive = false;
        ws.ping(null, undefined);
    });
}, 10000);

app.put("/lockUnlock", async (req: Request, res: Response) => {
    let id: string = req.query.id as string;
    let token: any = app.locals.metasMap.get(id);
    let lock: any = req.query.lock;

    if (typeof token === null) {
        console.log("error: non existing token " + req.query.id);
        res.status(404).send();
        return;
    }

    token.isLocked = lock === "true";
    const saleEvent = { typeMsg: "lock", id, lock };
    saleEvents.insert(saleEvent);
    sendLock(req.query.id as string, token.isLocked);
    //tokens.update(token);
    dbPos.updateLockToken(id, token.isLocked ? 1 : 0)
    res.status(204).send();
});


