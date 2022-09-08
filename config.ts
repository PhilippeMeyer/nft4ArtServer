

var config: any = {};
config.secret = process.env.APP_SECRET;
config.walletFileName = process.env.APP_WALLET_FILE;
config.database = process.env.APP_DB_FILE;
config.infuraKey = process.env.APP_INFURA_KEY;
config.network = process.env.APP_NETWORK;
config.cacheFolder = process.env.APP_CACHE_FOLDER;
config.priceFeedETH = process.env.APP_PRICE_FEED_ETH;
config.priceFeedBTC = process.env.APP_PRICE_FEED_BTC;
config.priceFeedCHF = process.env.APP_PRICE_FEED_CHF;
config.gvdNftAbiFile = process.env.APP_GVDNFT_ABI_FILE;
config.urlIpfs = process.env.APP_IPFS_URL;
config.dbName = process.env.APP_DB_NAME;
config.creationScript = process.env.APP_DB_CREATION_SCRIPT;
config.iconUrl = process.env.APP_WEBSITE + "/icon?id=";
config.imgUrl = process.env.APP_WEBSITE + "/image?id=";
config.jwtExpiry = process.env.APP_JWT_EXPIRY;
config.nftSorageToken = process.env.APP_NFTSTORAGE_TOKEN;

export { config };