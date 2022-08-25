function receivedEthCallback(from: any, amount: BigInteger, event: any) {
    /*
      from: 0x9DF6A10E3AAfd916A2E88E193acD57ff451C445A 
      amount: BigNumber { _hex: '0x016345785d8a0000', _isBigNumber: true } 
      event: {
      blockNumber: 11050043,
      blockHash: '0x070d1213a4c692e11a1cbf66464112bd8e5063ea98178bae3da48a1e869cda23',
      transactionIndex: 16,
      removed: false,
      address: '0xf0962Ff23517E8C4F20E402c8132d433C946DF11',
      data: '0x0000000000000000000000009df6a10e3aafd916a2e88e193acd57ff451c445a000000000000000000000000000000000000000000000000016345785d8a0000',
      topics: [
        '0x52a6cdf67c40ce333b3d846e4e143db87f71dd7935612a4cafcf6ba76047ca1f'
      ],
      transactionHash: '0xf2d56b067d289a29b59687d0baaa7da2cb2290e630ab613870f9d07e1d88e9d5',
      logIndex: 33,
      removeListener: [Function (anonymous)],
      getBlock: [Function (anonymous)],
      getTransaction: [Function (anonymous)],
      getTransactionReceipt: [Function (anonymous)],
      event: 'ReceivedEth',
      eventSignature: 'ReceivedEth(address,uint256)',
      decode: [Function (anonymous)],
      args: [
        '0x9DF6A10E3AAfd916A2E88E193acD57ff451C445A',
        BigNumber { _hex: '0x016345785d8a0000', _isBigNumber: true }
      ]
    }
    */
        console.log('from:', from, 'amount:', amount, 'event:', event);
    }
    
    export { receivedEthCallback };