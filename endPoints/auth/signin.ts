import { Request, Response } from "express";
import { utils, Wallet } from "ethers";
import fs from "fs";
import jwt from "jsonwebtoken";

import { config } from "../../config.js";
import { logger } from "../../loggerConfiguration.js";
import { app } from "../../app.js";
import * as dbPos from '../../services/db.js';
import { createSmartContract } from "../../services/createSmartContract.js";
import { loadToken } from "../../init.js"

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

type DeviceResponse = {
    password?: string;
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


function signin(req: Request, res: Response) {
    const response = req.body as DeviceResponse;

    let { device, password } = response;
    const verification: DeviceServerSide = {};
    verification.ip = req.headers['x-forwarded-for'] as string || req.ip ;
    logger.info("server.signin %s %s", device.deviceId, verification.ip);

    // Check if a password has been provided -> the user is attempting to login as manager
    if (password) {
        let pass: string = password as string;

        if (app.locals.passHash == "") {
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
            // The password has already been provided, the wallet is unlocked. Verify if the password is Ok
            if (app.locals.passHash != utils.keccak256(utils.toUtf8Bytes(pass))) {
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
                registerPoS({ ...device, ...verification }, pass, res);
        }
        }
    } else {
        if (app.locals.passHash == "") {
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
}

//
// loadWallet
// Loads and connects a wallet
//
// Loads a wallet and stores the hash of password in the app.locals global variable
// If no token has been loaded, it will create a new smart contract
//
async function loadWallet(w: Wallet, pass: string, app: any) {
    app.locals.wallet = w.connect(app.locals.ethProvider);
    logger.info("server.signin.loadedWallet");
    app.locals.passHash = utils.keccak256(utils.toUtf8Bytes(pass));

    if(app.locals.token === undefined) {
        logger.info('server.signing.loadWallet.createSmartContract');
        let token = await createSmartContract();
        dbPos.insertNewSmartContract(token.address);
        loadToken(token, app);
    }

    app.locals.token = app.locals.token.connect(app.locals.wallet);
    app.locals.metas.forEach(async (nft: any) => {
        let balance = await app.locals.token.balanceOf(app.locals.wallet.address, nft.tokenId);
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
            dbPos.insertNewPos(device);
            const token = jwt.sign({ id: device.deviceId, manager: manager }, config.secret, { expiresIn: config.jwtExpiry });
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
            dbPos.updateIpRegisteredPos(device.deviceId, device.ip as string);
            const token = jwt.sign({ id: device.deviceId, manager: manager }, config.secret, { expiresIn: config.jwtExpiry });
            res.status(200).send({ id: device.deviceId, accessToken: token });
            return;
        }
    }
}

export { signin };