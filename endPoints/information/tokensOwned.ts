import { BigNumber, constants, Contract, ContractFactory, errors, providers, utils, Wallet } from "ethers";
import { Response } from "express";

import { app } from "../../app.js";
import { logger } from "../../loggerConfiguration.js";
import { RequestCustom } from "../../requestCustom.js";


//
// /apiV1/information/tokensOwned
// List the tokens owned by a customer
//
// Returns the tokens owned by a customer based on his address contained in the JWT
//

async function tokensOwned(req: RequestCustom, res: Response) {
    logger.info('server.tokensOwned %s', req.address);

    const tokens = await tokensOwnedByAddress(req.address || "", app.locals.token);
    res.status(200).json({address: app.locals.token.address, tokens: tokens});
}

//
// tokensOwnedByAddress(address: string, token: Contract)
//
// This function builds the balance on each token for a given address from the smart contract
//
// TODO: to ensure a decent response time for the application login, this information will be cached on the server.
// It should be loaded when the server initializes and will be updated with the Ethereum notifications
//
async function tokensOwnedByAddress(address: string, token: Contract): Promise<{ tokenId: BigNumber; balance: BigNumber }[]> {
    //address = '0x9DF6A10E3AAfd916A2E88E193acD57ff451C445A';
    const transfersSingle = await token.queryFilter( token.filters.TransferSingle(null, null, address), 0, "latest");
    const transfersBatch = await token.queryFilter( token.filters.TransferBatch(null, null, address), 0, "latest");

    let ids: BigNumber[] = [];
    let addresses: string[] = [];

    transfersSingle.forEach((evt) => {
        ids.push(evt.args?.id);
        addresses.push(address);
    });
    transfersBatch.forEach((evt) => {
        const idsToInsert = evt.args?.ids;
        ids.push(...idsToInsert);
        idsToInsert.forEach(() => addresses.push(address));
    });

    let ret: { tokenId: BigNumber; balance: BigNumber }[] = [];

    if(ids.length == 0) return ret;

    const balances = await token.balanceOfBatch(addresses, ids);
    balances.forEach((bal: BigNumber, index: number) => {
        if(bal.gt(constants.Zero)) ret.push({tokenId: ids[index], balance: bal});
    });

    return ret;
}


export { tokensOwned, tokensOwnedByAddress }
