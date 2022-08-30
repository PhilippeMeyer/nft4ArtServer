
import { Request, Response } from "express";
import axios from "axios";

import { logger } from "../../loggerConfiguration.js";
import * as dbPos from '../../services/db.js';
import { config } from "../../config.js";


//
// /apiV1/price/priceInCrypto
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
function priceInCrypto(req :Request, res :Response) {
	
    logger.info('server.price.priceInCrypto: %s, crypto: %s', req.query.tokenId, req.query.crypto);
	
    if (typeof req.query.tokenId === 'undefined') {
		res.status(400).json({error: {name: 'noTokenIdSpecified', message: 'The token Id is missing'}});
		return;
	}
	if (typeof req.query.crypto === 'undefined') {
		res.status(400).json({error: {name: 'noCryptoSpecified', message: 'The crypto is missing'}});
		return;
	}

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
        res.status(200).json({  tokenId: req.query.tokenId, 
                                crypto: req.query.crypto, 
                                price: token.price / rate,
                                priceFiat: token.price,
                                rate:  rate})
    });
}

export { priceInCrypto };