import { Request, Response } from "express";

import * as dbPos from '../../services/db.js';
import { logger } from "../../loggerConfiguration.js";
import { sendMessage } from "../../index.js"
import { app } from "../../app.js";


class PriceMessage {
    public typeMsg: string = "price";

    constructor(public id: string, public price: number) {}
}

//
// /apiV1/price/update
// Update the price of a token
//
// This is an endpoint used when the manager updates the price of a token
// The parameters are:
// 	- the token identifier (which is the concatenation of the token's address and the token's id)
//	- the price
//
function priceUpdate(req: Request, res: Response) {
    if (typeof req.query.tokenId === "undefined") {
        logger.warn('server.priceUpdate.noTokenIdSpecified');
        res.status(400).json({ error: { name: "noTokenIdSpecified", message: "The token Id is missing" }} );
        return;
    }
    if (typeof req.query.price === "undefined") {
        logger.warn('server.priceUpdate.noPriceSpecified');
        res.status(400).json({ error: { name: "noPriceSpecified", message: "The price is missing" }} );
        return;
    }

    var token: any = dbPos.findToken(req.query.tokenId as string);
    if (token == null) {
        logger.warn('server.priceUpdate.tokenNotFound');
        res.status(404).json({ error: { name: "tokenNotFound", message: "The specified token is not in the database" }} );
        return;
    }

    //token.price = req.query.price;
    //tokens.update(token);
    const id: string = req.query.tokenId as string;
    const prc: number = parseFloat(req.query.price as string);
    dbPos.updatePriceToken(id, prc);
    const tk: any = app.locals.metasMap.get(id);
    if (tk != null) tk.price = prc;
    else logger.error('server.priceUpdate.inconsistentState %s', id);
    res.sendStatus(200);
    sendPrice(token.id, token.price);
}

//
// /apiV1/price/updates
// Update the price of a list of tokens
//
// This is an endpoint used when the manager updates the token prices
// The parameters are:
// 	- a Json object containing the id and the price
//
function priceUpdates(req: Request, res: Response) {
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
        const id: string = item.id as string;
        const prc: number = parseFloat(item.price as string);
        const tk: any = app.locals.metasMap.get(id);
        if (tk != null) tk.price = prc;
        else logger.error('server.priceUpdate.inconsistentState %s', id);
    
        dbPos.updatePriceToken(id, prc);
        sendPrice(token.id, token.price);
    });

    res.sendStatus(200);
}

function sendPrice(id: string, price: number) {
    sendMessage(JSON.stringify(new PriceMessage(id, price)));
}


export { priceUpdate, priceUpdates, PriceMessage };
