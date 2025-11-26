import {
  generateKeypair,
  getSignedLnurlpRequestUrl,
  parseLnurlpRequest,
  getLnurlpResponse,
  getPayRequest,
  getPayReqResponseForSettlementLayer,
  LnurlpResponse,
  PayRequest,
  PayReqResponse,
  Currency,
  KycStatus,
  SettlementOption,
} from '@uma-sdk/core';

describe('Settlement Options Integration Tests', () => {
  it('should include settlement options in lnurlp response', async () => {
    const senderKeyPair = await generateKeypair();
    const receiverKeyPair = await generateKeypair();
    const receiverAddress = 'bob@vasp2.com';

    const lnurlpRequestUrl = await getSignedLnurlpRequestUrl({
      signingPrivateKey: senderKeyPair.privateKey,
      receiverAddress,
      senderVaspDomain: 'vasp1.com',
      isSubjectToTravelRule: true,
    });

    const lnurlpRequest = await parseLnurlpRequest(lnurlpRequestUrl);

    const settlementOptions: SettlementOption[] = [
      {
        settlementLayer: 'spark',
        assets: [
          {
            identifier: 'btkn1...',
            multipliers: {
              USD: 1234,
              PHP: 5678,
            },
          },
        ],
      },
      {
        settlementLayer: 'ln',
        assets: [
          {
            identifier: 'BTC',
            multipliers: {
              USD: 1234,
            },
          },
        ],
      },
    ];

    const lnurlpResponse = await getLnurlpResponse({
      request: lnurlpRequest,
      privateKeyBytes: receiverKeyPair.privateKey,
      requiresTravelRuleInfo: true,
      callback: 'https://vasp2.com/api/lnurl/payreq',
      encodedMetadata: '[["text/plain", "Pay to vasp2.com user $bob"]]',
      minSendableSats: 1000,
      maxSendableSats: 100000,
      payerDataOptions: {
        identifier: { mandatory: true },
        name: { mandatory: false },
        email: { mandatory: false },
        compliance: { mandatory: true },
      },
      currencyOptions: [
        new Currency('USD', 'US Dollar', '$', 1000, 1, 100000000, 2),
      ],
      receiverKycStatus: KycStatus.Verified,
      settlementOptions,
    });

    expect(lnurlpResponse.settlementOptions).toBeDefined();
    expect(lnurlpResponse.settlementOptions).toHaveLength(2);
    expect(lnurlpResponse.settlementOptions?.[0].settlementLayer).toBe('spark');
    expect(lnurlpResponse.settlementOptions?.[0].assets).toHaveLength(1);
    expect(lnurlpResponse.settlementOptions?.[0].assets[0].identifier).toBe(
      'btkn1...',
    );

    const serialized = lnurlpResponse.toJsonString();
    const deserialized = LnurlpResponse.fromJson(serialized);
    expect(deserialized.settlementOptions).toEqual(settlementOptions);
  });

  it('should include settlement info in pay request', async () => {
    const senderKeyPair = await generateKeypair();
    const receiverKeyPair = await generateKeypair();

    const payRequest = await getPayRequest({
      receiverEncryptionPubKey: receiverKeyPair.publicKey,
      sendingVaspPrivateKey: senderKeyPair.privateKey,
      receivingCurrencyCode: 'USD',
      isAmountInReceivingCurrency: true,
      amount: 100,
      payerIdentifier: 'alice@vasp1.com',
      payerKycStatus: KycStatus.Verified,
      umaMajorVersion: 1,
      settlement: {
        layer: 'spark',
        assetIdentifier: 'btkn1...',
      },
    });

    expect(payRequest.settlement).toBeDefined();
    expect(payRequest.settlement?.layer).toBe('spark');
    expect(payRequest.settlement?.assetIdentifier).toBe('btkn1...');

    const serialized = payRequest.toJsonString();
    const deserialized = PayRequest.fromJson(serialized);
    expect(deserialized.settlement).toEqual(payRequest.settlement);
  });

  it('should handle settlement layer pay response', async () => {
    const senderKeyPair = await generateKeypair();
    const receiverKeyPair = await generateKeypair();

    const payRequest = await getPayRequest({
      receiverEncryptionPubKey: receiverKeyPair.publicKey,
      sendingVaspPrivateKey: senderKeyPair.privateKey,
      receivingCurrencyCode: 'USD',
      isAmountInReceivingCurrency: true,
      amount: 100,
      payerIdentifier: 'alice@vasp1.com',
      payerKycStatus: KycStatus.Verified,
      umaMajorVersion: 1,
      settlement: {
        layer: 'spark',
        assetIdentifier: 'btkn1...',
      },
    });

    const invoiceCreator = {
      createUmaInvoice: async () => {
        return 'lnbc1000n1pj9x3z0pp5';
      },

      createInvoiceForSettlementLayer: async () => {
        // assuming spark is the settlement layer
        return 'spark1000n1pj9x3z0pp5';
      },
    };

    const payReqResponse = await getPayReqResponseForSettlementLayer({
      request: payRequest,
      invoiceCreator,
      metadata: '[["text/plain", "Pay to vasp2.com user $bob"]]',
      receivingCurrencyCode: 'USD',
      receivingCurrencyDecimals: 2,
      conversionRate: 1234,
      receiverFees: 50,
      receivingVaspPrivateKey: receiverKeyPair.privateKey,
      payeeIdentifier: 'bob@vasp2.com',
    });

    expect(payReqResponse).toBeDefined();
    expect(payReqResponse.converted).toBeDefined();
    expect(payReqResponse.converted?.multiplier).toBe(1234);
    expect(payReqResponse.converted?.fee).toBe(50);
    expect(payReqResponse.converted?.currencyCode).toBe('USD');
    expect(payReqResponse.pr).toBe('spark1000n1pj9x3z0pp5');

    const serialized = payReqResponse.toJsonString();
    const deserialized = PayReqResponse.fromJson(serialized);
    expect(deserialized.converted).toEqual(payReqResponse.converted);
  });
});

