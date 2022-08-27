import { Request, Response } from "express";
import { utils, Wallet } from "ethers";
import jwt from "jsonwebtoken";

import { config } from "../../config.js";
import { logger } from "../../loggerConfiguration.js";
import { app } from "../../app.js";
import * as dbPos from '../../services/db.js';
import { tokensOwnedByAddress } from "../information/tokensOwned.js"
import { RequestCustom } from "../../requestCustom.js"

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

async function appLogin(req: Request, res: Response) {
    const login = req.body as AppLogin;
    logger.info('server.loginApp %s', login.message.address);

    let app = dbPos.findAppId(login.message.address); 
    if (app == null) dbPos.insertNewAppId(login.message);
    else {
        if (app.appId != login.message.appId) {
            logger.info('server.loginApp.alreadyRegistered');
            return res.status(403).json({error: { name: 'addressRegistered', message: 'address already registered with device: ' + app.appId}})
        }
        if (login.message.nonce <= app.nonce) {
            logger.info('server.loginApp.messageAlreadyUsed');
            return res.status(403).json({error: { name: 'messageUsed', message: 'login message already received'}});
        }
        
        app.nonce = login.message.nonce;
        dbPos.updateNonceAppId(login.message.appId, login.message.nonce);
    }
    
    if(!isSignatureValid(login)) {
        logger.info('server.loginApp.invalidSignature');
        return res.status(403).json({error: { name: 'invalidSignature', message: 'invalid signature'}});       
    }

    if(! await isAddressOwningToken(login.message.address)) return res.status(403).json({error: { name: 'noTokenOwner', message: 'address is not an owner of a token'}});

    const token = jwt.sign({ id: login.message.appId, address: login.message.address }, config.secret, { expiresIn: config.jwtExpiry });
    return  res.status(200).json({ appId: login.message.appId, accessToken: token });
}

//
// /apiV1/auth/appLoginDrop
// Drop a registration for a companion app
//
// The companion app logs into the system via a signed message which contains the appId stored on the device and associated with the customer's
// ethereum address. When the consumer changes device, he needs to drop the previously registered app
//
async function appLoginDrop(req: RequestCustom, res: Response) {
    if (req.appId === undefined) return res.status(403).json({error: { name: 'noAppId', message: 'no appId provided in the token'}});
    if (req.address === undefined) return res.status(403).json({error: { name: 'noAddress', message: 'no address provided in the token'}});
    logger.info('server.appLoginDrop %s', req.deviceId);

    let app = dbPos.findAppId(req.address); 
    if (app == null) return res.status(200).json({status: 'no app registered for this address'});
    
    dbPos.removeAppId(app.appId);
    return res.status(200).json({status: 'appId ' + req.appId + ' removed for address ' + req.address});
}

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

export { appLogin, appLoginDrop };
