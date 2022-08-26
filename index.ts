import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { BigNumber, constants, Contract, ContractFactory, errors, providers, utils, Wallet } from "ethers";
import { TransactionReceipt, TransactionResponse } from "@ethersproject/abstract-provider";
import fs from "fs";
import jwt from "jsonwebtoken";
import Loki from "lokijs";
import axios from "axios";
import expressWinston from "express-winston";
// TODO: is it used?
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { waitFor } from "./waitFor.js";
import { logConf, logger } from "./loggerConfiguration.js";

import { init } from "./init.js";
import { app } from "./app.js";
import { RequestCustom } from "./requestCustom.js"

import * as dbPos from './services/db.js';

import { generateWallets } from "./endPoints/information/generateWallets.js";
import { tokensOwned,  tokensOwnedByAddress } from "./endPoints/information/tokensOwned.js";
import { threeDmodel } from "./endPoints/information/threeDmodel.js"; 

// TODO: Env var?
const webSite: string = "http://192.168.1.5:8999";
const jwtExpiry: number = 60 * 60;

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

var config: any = {};
config.secret = process.env.APP_SECRET;
config.walletFileName = process.env.APP_WALLET_FILE;
config.database = process.env.APP_DB_FILE;
config.infuraKey = process.env.APP_INFURA_KEY;
config.network = process.env.APP_NETWORK;
config.addressToken = process.env.APP_TOKEN_ADDR;
config.cacheFolder = process.env.APP_CACHE_FOLDER;
config.priceFeedETH = process.env.APP_PRICE_FEED_ETH;
config.priceFeedBTC = process.env.APP_PRICE_FEED_BTC;
config.priceFeedCHF = process.env.APP_PRICE_FEED_CHF;
config.gvdNftAbiFile = process.env.APP_GVDNFT_ABI_FILE;
config.urlIpfs = process.env.APP_IPFS_URL;
config.dbName = process.env.APP_DB_NAME;
config.creationScript = process.env.APP_DB_CREATION_SCRIPT;
config.iconUrl = webSite + "/icon?id=";
config.imgUrl = webSite + "/image?id=";



// Global variables

let passHash: string = "";                  // Hash of the password. If empty, means that the wallet has not been loaded
var databaseInitialized = false;            // Is the database initialized? Used to wait for the database init before starting the server

//TODO: have a look if it is possible to type the loki collection
var registeredPoS: any;                     // Database collection of registered point of sale
var tokens: any;                            // Database collection of tokens
var saleEvents: any;                        // Database collection of events (lock/unlock/transfer/completedTransfer)
var appIds: Collection<AppLoginMessage>;    // Database collection of companion app Ids
var wallet: Wallet;                         // Wallet
//let ethProvider: providers.JsonRpcProvider; // Connection provider to Ethereum

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    appIds = db.getCollection(APP_ID_COLLECTION_NAME) ?? db.addCollection(APP_ID_COLLECTION_NAME);
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
// Therefore, no action can be performed before loading the wallet with /loadWAllet where the wallet owner enters interactively the password
// This password is used to unlock the wallet and the hash of this password is kept in memory so that further admin functions can be checked
// against this password. If a wrong password is given to unlock the wallet, this generates an error an the password hash is empty blocking
// any further operation.
//
// Client Connections:
//
// Each Point of Sale has to be registered first. The registration is performed on the PoS side by genereting a key pair and sending to the server
// the mobile unique Id encrypted with the priavte key together with the public key. The server stores in lowDb the mobile Id and its associated
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
// verifyToken
// Helper function to verify a token. This is called by the end points to verify if the JWT is valid
//
// When the token is expired, the PoS will reinitiate a login procedure which is simply performed through
// a biometric check
//
const verifyToken = (req: RequestCustom, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        logger.info("server.verifyToken.missingToken");
        return res.status(401).json({
            error: { message: "No token provided!", name: "NoTokenProvided" },
        });
    }
    jwt.verify(token, config.secret, (err: any, decoded: any) => {
        if (err) {
            const status = err.name == "TokenExpiredError" ? 401 : 403;

            return res.status(status).json({
                error: err,
            });
        }

        req.deviceId = decoded.id;
        req.manager = decoded.manager;
        req.address = decoded.address;
        next();
    });
};

//
// verifyTokenManager
// Helper function to verify if a token belongs to a manager This is called by the end points to verify if the JWT is valid and owned by a manager
//
// When the token is expired, the PoS will reinitiate a login procedure which is simply performed through
// a biometric check
//
const verifyTokenManager = (req: RequestCustom, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        logger.info("server.verifyToken.missingToken");
        return res.status(401).json({
            error: { message: "No token provided!", name: "NoTokenProvided" },
        });
    }
    jwt.verify(token, config.secret, (err: any, decoded: any) => {
        if (err) {
            const status = err.name == "TokenExpiredError" ? 401 : 403;

            return res.status(status).json({
                error: err,
            });
        }

        req.deviceId = decoded.id;
        req.manager = decoded.manager;
        if (!req.manager)
            return res.status(403).json({
                error: { message: "Not authorized !", name: "NotAuthorized" },
            });

        next();
    });
};

//
// verifyTokenApp
// Helper function to verify a token coming from the mobile app.
// This is called by the end points to verify if the JWT is valid
//
// When the token is expired, the app will reinitiate a login procedure
//
const verifyTokenApp = (req: RequestCustom, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        logger.info("server.verifyToken.missingToken");
        return res.status(401).json({
            error: { message: "No token provided!", name: "NoTokenProvided" },
        });
    }
    jwt.verify(token, config.secret, (err: any, decoded: any) => {
        if (err) {
            const status = err.name == "TokenExpiredError" ? 401 : 403;

            return res.status(status).json({
                error: err,
            });
        }

        req.appId = decoded.appId;
        req.address = decoded.address;
        next();
    });
};

//
// /apiV1/auth/authorizePoS
// Authorize or not a registered Point of Sale
//
// This end point receives the public key the PoS has generated and the encrypted mobile unique Id
//
//app.post("/apiV1/auth/registerPoS", function (req: Request, res: Response) {});

type DeviceResponse = {
    password: string;
    device: DeviceFromClient;
};

type DeviceFromClient = {
    deviceId: string;
    browser: string;
    browserVersion: string;
};

type DeviceServerSide = {
    ip?: string;
    authorized?: boolean;
};

type registeredPosRecord = {
    deviceId: string;
    autorized: number; 
    namePoS: string;
    browser: string;
    browserVersion: string;
    ip: string;
}
//
// /apiV1/auth/sigin
// Signin into the server
//
// For this the client is sending the unique mobile Id and some devices characteristics.
// The server is then able to identify the registered PoS and sends back a JWT to the PoS
// In case the login is requested on a manager role, a password is provided in the object
// When no device have been registered and the manager's password is valid (as it unlocks
// the wallet), the device is automatically registered.
// For the following devices, the manager registration will be required
//
// In the case, a regular login is attempted, while the wallet has not been provided to the
// server to unlock the wallet, the ende point returns a 403
//
app.post("/apiV1/auth/signin", function (req: Request, res: Response) {
    const response = req.body as DeviceResponse;

    let { device, password } = response;
    const verification: DeviceServerSide = {};
    verification.ip = req.headers['x-forwarded-for'] as string || req.ip ;
    logger.info("server.signin %s %s", device.deviceId, verification.ip);

    // Check if a password has been provided -> the user is attempting to login as manager
    if (password) {
        let pass: string = password as string;

        if (passHash == "") {
            // The password has not been provided yet -> try to unlock the wallet
            let jsonWallet = fs.readFileSync(config.walletFileName);

            Wallet.fromEncryptedJson(jsonWallet.toString(), pass)
                .then(function (data) {
                    loadWallet(data, pass, app);
                    verification.authorized = true;
                    registerPoS({ ...device, ...verification }, pass, res);
                })
                .catch(function (data) {
                    console.log(data);
                    logger.info("server.signin.wrongCredentials");
                    res.status(403).send({
                        error: {
                            name: "walletPassError",
                            message: "Wrong credentials for the wallet password",
                        },
                    });
                });
        } else {
            // The password has already been provided, the wallet is unlocked. Verify if the passwaord is Ok
            if (passHash != utils.keccak256(utils.toUtf8Bytes(pass))) {
                logger.info("server.signin.wrongCredentials");
                res.status(403).send({
                    error: {
                        name: "walletPassError",
                        message: "Wrong credentials for the wallet password",
                    },
                });
            } else {
                // The credentials are Ok -> register the device
                logger.info("server.signin.registerPoS");
                verification.authorized = true;
                registerPoS(device, password, res);
            }
        }
    } else {
        if (passHash == "") {
            // The wallet has not been loaded, the server is not ready and cannot accept PoS connections
            logger.info("server.signin.walletNotLoaded");
            res.status(403).json({
                error: {
                    name: "walletNotLoaded",
                    message: "The server's wallet has not been loaded, manager's login required",
                },
            });
        } else {
            // The wallet is loaded, the server can accept connections. We verify that this PoS has been registered
            logger.info("server.signin.registerPoS");
            registerPoS(device, req.body.password, res);
        }
    }
});

function loadWallet(w: Wallet, pass: string, app: any) {
    wallet = w.connect(app.locals.ethProvider);
    logger.info("server.signin.loadedWallet");
    passHash = utils.keccak256(utils.toUtf8Bytes(pass));
    //console.log(w.mnemonic);

    app.locals.metas.forEach(async (nft: any) => {
        let balance = await app.locals.token.balanceOf(wallet.address, nft.tokenId);
        nft.availableTokens = balance.toString();
        if (balance.isZero()) nft.isLocked = true;
    });
}

//
// registerPoS, parameters: the device to be registered, the password if the user is a manager and the result object
//
// This function registers a new PoS in the database
// If the PoS does not exists, it is created if a manager's password has been provided and in that case, it sends back a Jwt
// If the PoS has already been registered and authorized, it simply sends back a token
//
function registerPoS(device: DeviceServerSide & DeviceFromClient, pass: string, res: any) {
    let manager: boolean;

    if (!device.authorized) device.authorized = false;
    manager = typeof pass !== "undefined";

//    const pos: any = registeredPoS.findOne({ deviceId: device.deviceId });
    const pos: any = dbPos.findRegisteredPos(device.deviceId);
    console.log(pos);
    if (pos == null) {
        if (!device.authorized) {
            // The PoS has not been registered and no password has been provided -> reject
            logger.info("server.signin.posNotAuthorized");
            res.status(403).json({
                error: {
                    name: "posNotAuthorized",
                    message: "The Point of Sale has not been authorized",
                },
            });
            return;
        } else {
            // This is a new PoS connected with the manager's login -> register
            logger.info("server.signin.newPoS %s", device);
            device.authorized = true;
            //registeredPoS.insert(device);
            dbPos.insertNewPos(device);
            const token = jwt.sign({ id: device.deviceId, manager: manager }, config.secret, { expiresIn: jwtExpiry });
            res.status(200).send({ id: device.deviceId, accessToken: token });
            return;
        }
    } else {
        // The PoS has been registered
        if (pos.authorized == 0) {
            logger.info("server.signin.posNotAuthorized");
            res.status(403).json({
                error: {
                    name: "posNotAuthorized",
                    message: "The Point of Sale has not been authorized",
                },
            });
            return;
        } else {
            // The PoS is authorized -> Ok
            logger.info("server.signin.success %s", device);
            pos.ip = device.ip; // Updating the client's ip address
            //registeredPoS.update(pos);
            dbPos.updateIpRegisteredPos(device.deviceId, device.ip as string);
            const token = jwt.sign({ id: device.deviceId, manager: manager }, config.secret, { expiresIn: jwtExpiry });
            res.status(200).send({ id: device.deviceId, accessToken: token });
            return;
        }
    }
}

//
// /apiV1/auth/appLogin
// Companion app login into the server
//
// The companion app stores the customer's private key and sends a signed message for the login
// This message contains the uuid associated with the app. This end point verifies the signature and checks that 
// the associated ethereum address is not already associated with a different uuid. If no uuid is associated with that
// address, the uuid is stored in the server's database
//
type AppLogin = {
    signature: string;
    message: AppLoginMessage;
};
type AppLoginMessage = {
    appId: string;
    address: string;
    nonce: number;
};

app.post("/apiV1/auth/appLogin", async function (req: Request, res: Response) {
    const login = req.body as AppLogin;
    logger.info('server.loginApp %s', login.message.address);

    //let app = appIds.findOne({address: login.message.address}); 
    let app = dbPos.findAppId(login.message.address); 
    //if (app == null) appIds.insert(login.message);
    if (app == null) dbPos.insertNewAppId(login.message);
    else {
        if (app.appId != login.message.appId) {
            logger.info('server.loginApp.alreadyRegistered');
            return res.status(403).json({error: 'address already registered with device: ' + app.appId})
        }
        if (login.message.nonce <= app.nonce) {
            logger.info('server.loginApp.messageAlreadyUsed');
            return res.status(403).json({error: 'login message already received'})
        }
        
        app.nonce = login.message.nonce;
        //appIds.update(app);
        dbPos.updateNonceAppId(login.message.appId, login.message.nonce);
    }
    
    if(!isSignatureValid(login)) {
        logger.info('server.loginApp.invalidSignature');
        return res.status(403).json({error: 'invalid signature'})       
    }
    if(! await isAddressOwningToken(login.message.address)) return res.status(403).json({error: 'address is not an owner of a token'});

    const token = jwt.sign({ id: login.message.appId, address: login.message.address }, config.secret, { expiresIn: jwtExpiry });
    return  res.status(200).json({ appId: login.message.appId, accessToken: token });
});

//
// /apiV1/auth/appLoginDrop
// Drop a registration for a companion app
//
// The companion app logs into the system via 
app.post("/apiV1/auth/appLoginDrop", verifyTokenApp, async function (req: RequestCustom, res: Response) {
    if (req.deviceId === undefined) return res.status(403).json({error: 'no appId provided in the token'});
    if (req.address === undefined) return res.status(403).json({error: 'no address provided in the token'});
    logger.info('server.appLoginDrop %s', req.deviceId);

    //let app = appIds.findOne({address: req.address}); 
    let app = dbPos.findAppId(req.address); 
    if (app == null) return res.status(200).json({status: 'no app registered for this address'});
    
    //appIds.remove(app);
    dbPos.removeAppId(app.appId);
    return res.status(200).json({status: 'appId ' + req.deviceId + ' removed for address ' + req.address});
});

//
// isAddressOwningToken
// - address: the owner's address
//
// This function checks the Ethereum logs to find out whether the address is owning a token or not.
async function isAddressOwningToken(address: string) {
    let ret = await tokensOwnedByAddress(address || "", app.locals.token);
    return ret.length != 0;
}


//
// isSignatureValid
// - login: AppLogin containing the information sent by the application
//
// This function verifies the signature received from the companion app
//
function isSignatureValid(login: AppLogin) {
    const lg: AppLoginMessage = {
        appId: login.message.appId,
        address: login.message.address,
        nonce: login.message.nonce
    };
    const message: string = JSON.stringify(lg);

    const signerAddress = utils.verifyMessage(message, login.signature);
    return (signerAddress == login.message.address);
}

app.get("/tokens", verifyToken, (req: Request, res: Response) => {
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


app.get('/apiV1/information/video', verifyTokenApp, function(req: Request, res: Response) {
    logger.info('server.playVideo %s', req.query.address);

    //TODO select the video to be played from the customer's address

    const filePath = path.join(__dirname, "public/sample-mp4-file.mp4");
    const stat = fs.statSync(filePath);
    const fileSize = stat.size
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(200, head)
    fs.createReadStream(filePath).pipe(res)
  })

app.get('/apiV1/information/tokensOwned', verifyTokenApp, tokensOwned);

app.get('/apiV1/information/3Dmodel', verifyTokenApp, threeDmodel);

//
// /apiV1/priceInCrypto
// Get the price of a token in a given currency
//
// Parameters:  tokenId: the id of the token (concatenation of the token address and the tokenId)
//              crypto : crypto currency in which the price is converted (eth or btc)  
//
// Returns:     tokenId: the id of the token (concatenation of the token address and the tokenId)
//              crypto : crypto currency in which the price is converted (eth or btc)  
//              price : the price converted in fiat currency
//              priceFiat : the original price
//              rate : the rate which has been used for the conversion
//
app.get('/apiV1/priceInCrypto', function (req :Request, res :Response) {
	console.log('price request: ', req.query.tokenId, req.query.crypto);
	if (typeof req.query.tokenId === 'undefined') {
		res.status(400).json({error: {name: 'noTokenIdSpecified', message: 'The token Id is missing'}});
		return;
	}
	if (typeof req.query.crypto === 'undefined') {
		res.status(400).json({error: {name: 'noCryptoSpecified', message: 'The crypto is missing'}});
		return;
	}

	//var token: any = tokens.findOne({id: req.query.tokenId});
    var token: any = dbPos.findToken(req.query.tokenId as string);
	if (token == null) {
		res.status(404).json({error: {name: 'tokenNotFound', message: 'The specified token is not in the database'}});
		return;
	}
  
    Promise.all([
        axios.get(config.priceFeedCHF),
        axios.get(req.query.crypto == 'eth' ? config.priceFeedETH : config.priceFeedBTC)
    ])
    .then(response => {
        let rate: number = response[1].data.data.rateUsd * response[0].data.data.rateUsd;
        res.status(200).json({  tokenid: req.query.tokenId, 
                                crypto: req.query.crypto, 
                                price: token.price / rate,
                                priceFiat: token.price,
                                rate:  rate})
    });
});

//
// /apiV1/price/update
// Update the price of a token
//
// This is an endpoint used when the manager updates the price of a token
// The parameters are:
// 	- the token identifier (which is the concatenation of the token's address and the token's id)
//	- the price
//
app.put("/apiV1/price/update", verifyTokenManager, (req: Request, res: Response) => {
    if (typeof req.query.tokenId === "undefined") {
        res.status(400).json({
            error: {
                name: "noTokenIdSpecified",
                message: "The token Id is missing",
            },
        });
        return;
    }
    if (typeof req.query.price === "undefined") {
        res.status(400).json({
            error: { name: "noPriceSpecified", message: "The price is missing" },
        });
        return;
    }

    //const token: any = tokens.findOne({ id: req.query.tokenId });
    var token: any = dbPos.findToken(req.query.tokenId as string);
    if (token == null) {
        res.status(404).json({
            error: {
                name: "tokenNotFound",
                message: "The specified token is not in the database",
            },
        });
        return;
    }

    //token.price = req.query.price;
    //tokens.update(token);
    dbPos.updatePriceToken(req.query.tokenId as string, parseFloat(req.query.price as string));
    res.sendStatus(200);
    sendPrice(token.id, token.price);
});

//
// /apiV1/price/updates
// Update the price of a list of tokens
//
// This is an endpoint used when the manager updates the token prices
// The parameters are:
// 	- a Json object containing the id and the price
//
app.put("/apiV1/price/updates", verifyTokenManager, function (req: Request, res: Response) {
    var tokensUpdate = req.body;
    console.log(tokensUpdate);
    if (tokensUpdate.length == 0) {
        res.sendStatus(400);
        return;
    }

    tokensUpdate.forEach((item: any) => {
        //var token: any = tokens.findOne({ id: item.id });
        var token: any = dbPos.findToken(item.id as string);
        if (token == null) {
            res.status(404).json({
                error: {
                    name: "tokenNotFound",
                    message: `The specified token ${item.tokenId} is not in the database`,
                },
            });
            return;
        }

        //token.price = item.price;
        //tokens.update(token);
        dbPos.updatePriceToken(item.id as string, parseFloat(item.price as string));
        sendPrice(token.id, token.price);
    });

    res.sendStatus(200);
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
// /apiV1/auth/authorizePoS, parameter: PoS, the name of the PoS, authorized: true or false
//
// This end point sends back the registered PoS
//
app.put("/apiV1/auth/authorizePoS", verifyTokenManager, function (req: Request, res: Response) {
    if (typeof req.query.PoS === "undefined") {
        res.sendStatus(400).json({
            error: {
                name: "noPoSSpecified",
                message: "The Point of Sale is missing",
            },
        });
        return;
    }
    if (typeof req.query.authorized === "undefined") {
        res.sendStatus(400).json({
            error: {
                name: "noAuthorizationSpecified",
                message: "The Point of Sale authorization is missing",
            },
        });
        return;
    }

    var pos = registeredPoS.findOne({ deviceId: req.query.PoS });
    if (pos == null) {
        res.sendStatus(400).json({
            error: {
                name: "nonExistingPoS",
                message: "The Point of Sale does not exist",
            },
        });
        return;
    }
    pos.authorized = req.query.authorized == "true" ? true : false;
    registeredPoS.update(pos);
    res.sendStatus(200);
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
  
    let factory = new ContractFactory(app.locals.gvdNftDef.abi, app.locals.gvdNftDef.data.bytecode.object, wallet);
    let contract = await factory.deploy(req.query.uri);
    await contract.deployed();
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

    let tokenWithSigner = app.locals.token.connect(wallet);
    console.log(tokenWithSigner);
    console.log("token");
    console.log(app.locals.token);
    console.log("wallet");
    console.log(wallet);
    tokenWithSigner
        .safeTransferFrom(wallet.address, destinationAddr, tokenId, 1, [])
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
                app.locals.token.balanceOf(wallet.address, tokenId).then((balance: any) => {
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

    let tokenWithSigner = app.locals.token.connect(wallet);
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
    let tokenWithSigner = app.locals.token.connect(wallet);
    try {
        var tx = await tokenWithSigner.mintBatch(bigIntIds, amounts, [] );
        await tx.wait();
        res.sendStatus(200);
    } catch(e) { res.status(400).json({error: {name: 'errorMintingTokens', message: 'Error minting the tokens'}}); }
});

app.get("/apiV1/information/generateWallets", verifyTokenManager, generateWallets);

interface ExtWebSocket extends WebSocket {
    isAlive: boolean;
    address: string;
    pos: any;
}

function sendLock(id: string, isLocked: boolean) {
    sendMessage(JSON.stringify(new LockMessage(id, isLocked)));
}
function sendPrice(id: string, price: number) {
    sendMessage(JSON.stringify(new PriceMessage(id, price)));
}

function sendMessage(msg: string) {
    setTimeout(() => {
        wss.clients.forEach((client) => {
            console.log("send " + msg + client);
            client.send(msg);
        });
    }, 1000);
}

export class LockMessage {
    public typeMsg: string = "lock";

    constructor(public id: string, public isLocked: boolean = true) {}
}
export class PriceMessage {
    public typeMsg: string = "price";

    constructor(public id: string, public price: number) {}
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


