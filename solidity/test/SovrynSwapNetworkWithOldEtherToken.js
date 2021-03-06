const { expect } = require('chai');
const { expectRevert, constants, BN, balance } = require('@openzeppelin/test-helpers');

const { registry } = require('./helpers/Constants');
const { ZERO_ADDRESS } = constants;

const ConverterHelper = require('./helpers/Converter');

const SovrynSwapNetwork = artifacts.require('SovrynSwapNetwork');
const SmartToken = artifacts.require('SmartToken');
const SovrynSwapFormula = artifacts.require('SovrynSwapFormula');
const ContractRegistry = artifacts.require('ContractRegistry');
const EtherToken = artifacts.require('EtherToken');
const TestNonStandardToken = artifacts.require('TestNonStandardToken');

/*
Token network structure:

         SmartToken2
         /         \
    SmartToken1   SmartToken3
          \          \
           \        SmartToken4
            \        /      \
            EtherToken     ERC20Token

*/

contract('SovrynSwapNetworkWithOldEtherToken', accounts => {
    let etherToken;
    let smartToken1;
    let smartToken2;
    let smartToken3;
    let smartToken4;
    let erc20Token;
    let contractRegistry;
    let converter1;
    let converter2;
    let converter3;
    let converter4;
    let sovrynSwapNetwork;
    let smartToken1BuyPath;
    let smartToken2BuyPath;
    let smartToken3BuyPath;
    let smartToken1SellPath;
    let smartToken2SellPath;
    let smartToken3SellPath;
    let etherToErc20ConvertPath;
    const sender = accounts[0];
    const sender2 = accounts[1];
    const nonOwner = accounts[5];
    const affiliate = accounts[8];

    const value = new BN(1000);

    const OLD_CONVERTER_VERSION = 23;
    const MIN_RETURN = new BN(1);
    const AFFILIATE_FEE = new BN(10000);

    before(async () => {
        // The following contracts are unaffected by the underlying tests, this can be shared.
        contractRegistry = await ContractRegistry.new();

        const sovrynSwapFormula = await SovrynSwapFormula.new();
        await sovrynSwapFormula.init();
        await contractRegistry.registerAddress(registry.SOVRYNSWAP_FORMULA, sovrynSwapFormula.address);
    });

    beforeEach(async () => {
        sovrynSwapNetwork = await SovrynSwapNetwork.new(contractRegistry.address);
        await contractRegistry.registerAddress(registry.SOVRYNSWAP_NETWORK, sovrynSwapNetwork.address);

        etherToken = await EtherToken.new('Token0', 'TKN0');
        await etherToken.deposit({ value: 10000000 });

        await sovrynSwapNetwork.registerEtherToken(etherToken.address, true);

        smartToken1 = await SmartToken.new('Token1', 'TKN1', 2);
        await smartToken1.issue(sender, 1000000);

        smartToken2 = await SmartToken.new('Token2', 'TKN2', 2);
        await smartToken2.issue(sender, 2000000);

        smartToken3 = await SmartToken.new('Token3', 'TKN3', 2);
        await smartToken3.issue(sender, 3000000);

        smartToken4 = await SmartToken.new('Token4', 'TKN4', 2);
        await smartToken4.issue(sender, 2500000);

        await contractRegistry.registerAddress(registry.BNT_TOKEN, smartToken1.address);

        erc20Token = await TestNonStandardToken.new('ERC20Token', 'ERC5', 2, 1000000);

        converter1 = await ConverterHelper.new(0, smartToken1.address, contractRegistry.address, 0, etherToken.address,
            250000, OLD_CONVERTER_VERSION);

        converter2 = await ConverterHelper.new(MIN_RETURN, smartToken2.address, contractRegistry.address, 0, smartToken1.address,
            300000, OLD_CONVERTER_VERSION);
        await converter2.addReserve(smartToken3.address, 150000);

        converter3 = await ConverterHelper.new(0, smartToken3.address, contractRegistry.address, 0, smartToken4.address,
            350000, OLD_CONVERTER_VERSION);

        converter4 = await ConverterHelper.new(MIN_RETURN, smartToken4.address, contractRegistry.address, 0, etherToken.address,
            150000, OLD_CONVERTER_VERSION);
        await converter4.addReserve(erc20Token.address, 220000);

        await etherToken.transfer(converter1.address, 50000);
        await smartToken1.transfer(converter2.address, 40000);
        await smartToken3.transfer(converter2.address, 25000);
        await smartToken4.transfer(converter3.address, 30000);
        await etherToken.transfer(converter4.address, 20000);
        await erc20Token.transfer(converter4.address, 35000);

        await smartToken1.transferOwnership(converter1.address);
        await converter1.acceptTokenOwnership();

        await smartToken2.transferOwnership(converter2.address);
        await converter2.acceptTokenOwnership();

        await smartToken3.transferOwnership(converter3.address);
        await converter3.acceptTokenOwnership();

        await smartToken4.transferOwnership(converter4.address);
        await converter4.acceptTokenOwnership();

        smartToken1BuyPath = [etherToken.address, smartToken1.address, smartToken1.address];
        smartToken2BuyPath = [etherToken.address, smartToken1.address, smartToken1.address, smartToken2.address, smartToken2.address];
        smartToken3BuyPath = [smartToken1.address, smartToken2.address, smartToken2.address, smartToken2.address, smartToken3.address];

        smartToken1SellPath = [smartToken1.address, smartToken1.address, etherToken.address];
        smartToken2SellPath = [smartToken2.address, smartToken2.address, smartToken1.address, smartToken1.address, etherToken.address];
        smartToken3SellPath = [smartToken3.address, smartToken2.address, smartToken2.address, smartToken2.address, smartToken1.address];

        etherToErc20ConvertPath = [etherToken.address, smartToken4.address, erc20Token.address];
    });

    it('verifies that sending ether to the converter fails', async () => {
        await expectRevert.unspecified(converter2.send(100));
    });

    it('should be able to convert from a non compliant ERC20 to another token', async () => {
        await erc20Token.approve(sovrynSwapNetwork.address, value);
        const path = [erc20Token.address, smartToken4.address, smartToken4.address];

        const prevTokenBalance = await smartToken4.balanceOf.call(sender);

        const returnAmount = await sovrynSwapNetwork.convert.call(path, value, MIN_RETURN);
        await sovrynSwapNetwork.convert(path, value, MIN_RETURN);

        const newTokenBalance = await smartToken4.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnAmount));
    });

    it('should be able to convert from a smart token to a non compliant ERC20', async () => {
        await smartToken4.approve(sovrynSwapNetwork.address, value);
        const path = [smartToken4.address, smartToken4.address, erc20Token.address];

        const prevTokenBalance = await erc20Token.balanceOf.call(sender);

        const returnAmount = await sovrynSwapNetwork.convert.call(path, value, MIN_RETURN);
        await sovrynSwapNetwork.convert(path, value, MIN_RETURN);

        const newTokenBalance = await erc20Token.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnAmount));
    });

    it('verifies that convert with a single converter results in increased balance for the buyer', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        const returnAmount = await sovrynSwapNetwork.convert.call(smartToken1BuyPath, value, MIN_RETURN, { from: sender2, value });
        await sovrynSwapNetwork.convert(smartToken1BuyPath, value, MIN_RETURN, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnAmount));
    });

    it('verifies that convert with multiple converters results in increased balance for the buyer', async () => {
        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        const returnAmount = await sovrynSwapNetwork.convert.call(smartToken2BuyPath, value, MIN_RETURN, { from: sender2, value });
        await sovrynSwapNetwork.convert(smartToken2BuyPath, value, MIN_RETURN, { from: sender2, value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnAmount));
    });

    // eslint-disable-next-line max-len
    it('verifies that convert with minimum return equal to the full expected return amount results in the exact increase in balance for the buyer', async () => {
        const value = new BN(100000);

        const prevTokenBalance = await smartToken2.balanceOf.call(sender);

        const returnAmount = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2BuyPath, value))[0];
        await sovrynSwapNetwork.convert(smartToken2BuyPath, value, returnAmount, { value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnAmount));
    });

    it('should revert when attempting to convert and the return amount is lower than the given minimum', async () => {
        const value = new BN(1);

        await expectRevert(sovrynSwapNetwork.convert(smartToken2BuyPath, value, 1000000, { from: sender2, value }),
            'ERR_RETURN_TOO_LOW');
    });

    it('should revert when attempting to convert and passing an amount higher than the ETH amount sent with the request', async () => {
        await expectRevert(sovrynSwapNetwork.convert(smartToken2BuyPath, value, MIN_RETURN,
            { from: sender2, value: value.mul(new BN(2)) }), 'ERR_ETH_AMOUNT_MISMATCH');
    });

    it('verifies the caller balances after selling directly for ether with a single converter', async () => {
        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken1.balanceOf.call(sender);
        const prevETHBalance = await balance.current(sender);

        const res = await sovrynSwapNetwork.convert(smartToken1SellPath, value, MIN_RETURN);

        const newETHBalance = await balance.current(sender);
        const newTokenBalance = await smartToken1.balanceOf.call(sender);

        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        expect(newETHBalance).to.be.bignumber.gt(prevETHBalance.sub(transactionCost));
        expect(newTokenBalance).to.be.bignumber.lt(prevTokenBalance);
    });

    it('verifies the caller balances after selling directly for ether with multiple converters', async () => {
        await smartToken2.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken2.balanceOf.call(sender);
        const prevETHBalance = await balance.current(sender);

        const res = await sovrynSwapNetwork.convert(smartToken2SellPath, value, MIN_RETURN);

        const newETHBalance = await balance.current(sender);
        const newTokenBalance = await smartToken2.balanceOf.call(sender);

        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        expect(newETHBalance).to.be.bignumber.gt(prevETHBalance.sub(transactionCost));
        expect(newTokenBalance).to.be.bignumber.lt(prevTokenBalance);
    });

    it('should revert when attempting to sell directly for ether and the return amount is lower than the given minimum', async () => {
        await smartToken2.approve(sovrynSwapNetwork.address, value);

        await expectRevert(sovrynSwapNetwork.convert(smartToken2SellPath, value, value.add(new BN(10000))),
            'ERR_RETURN_TOO_LOW');
    });

    it('verifies the caller balances after converting from one token to another with multiple converters', async () => {
        const path = [
            smartToken1.address,
            smartToken2.address, smartToken2.address,
            smartToken2.address, smartToken3.address,
            smartToken3.address, smartToken4.address
        ];

        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevToken1Balance = await smartToken1.balanceOf.call(sender);
        const prevToken4Balance = await smartToken4.balanceOf.call(sender);

        await sovrynSwapNetwork.convert(path, value, MIN_RETURN);

        const newToken1Balance = await smartToken1.balanceOf.call(sender);
        const newToken4Balance = await smartToken4.balanceOf.call(sender);

        expect(newToken4Balance).to.be.bignumber.gt(prevToken4Balance);
        expect(newToken1Balance).to.be.bignumber.lt(prevToken1Balance);
    });

    it('verifies valid ether token registration', async () => {
        const etherToken1 = await EtherToken.new('Token0', 'TKN0');
        await etherToken1.deposit({ value: 10000000 });

        const sovrynSwapNetwork1 = await SovrynSwapNetwork.new(contractRegistry.address);
        await sovrynSwapNetwork1.registerEtherToken(etherToken1.address, true);

        const validEtherToken = await sovrynSwapNetwork1.etherTokens.call(etherToken1.address);
        expect(validEtherToken).to.be.true();
    });

    it('should revert when attempting register ether token with invalid address', async () => {
        const sovrynSwapNetwork1 = await SovrynSwapNetwork.new(contractRegistry.address);
        await expectRevert(sovrynSwapNetwork1.registerEtherToken(ZERO_ADDRESS, true), 'ERR_INVALID_ADDRESS');
    });

    it('should revert when non owner attempting register ether token', async () => {
        const etherToken1 = await EtherToken.new('Token0', 'TKN0');
        await etherToken1.deposit({ value: 10000000 });
        const sovrynSwapNetwork1 = await SovrynSwapNetwork.new(contractRegistry.address);
        await expectRevert(sovrynSwapNetwork1.registerEtherToken(etherToken1.address, true, { from: nonOwner }),
            'ERR_ACCESS_DENIED');
    });

    it('verifies valid ether token unregistration', async () => {
        const etherToken1 = await EtherToken.new('Token0', 'TKN0');
        await etherToken1.deposit({ value: 10000000 });

        const sovrynSwapNetwork1 = await SovrynSwapNetwork.new(contractRegistry.address);
        await sovrynSwapNetwork1.registerEtherToken(etherToken1.address, true);

        const validEtherToken = await sovrynSwapNetwork1.etherTokens.call(etherToken1.address);
        expect(validEtherToken).to.be.true();

        await sovrynSwapNetwork1.registerEtherToken(etherToken1.address, false);

        const validEtherToken2 = await sovrynSwapNetwork1.etherTokens.call(etherToken1.address);
        expect(validEtherToken2).to.be.false();
    });

    it('should revert when non owner attempting to unregister ether token', async () => {
        const etherToken1 = await EtherToken.new('Token0', 'TKN0');
        await etherToken1.deposit({ value: 10000000 });

        const sovrynSwapNetwork1 = await SovrynSwapNetwork.new(contractRegistry.address);
        await sovrynSwapNetwork1.registerEtherToken(etherToken1.address, true);

        const validEtherToken = await sovrynSwapNetwork1.etherTokens.call(etherToken1.address);
        expect(validEtherToken).to.be.true();

        await expectRevert(sovrynSwapNetwork1.registerEtherToken(etherToken1.address, false, { from: nonOwner }),
            'ERR_ACCESS_DENIED');
    });

    it('verifies that convertFor transfers the converted amount correctly', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convertFor(smartToken1BuyPath, value, MIN_RETURN, sender2, { value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convert transfers the converted amount correctly', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert(smartToken1BuyPath, value, MIN_RETURN, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies claimAndConvertFor with a path that starts with a smart token and ends with another smart token', async () => {
        await smartToken4.approve(sovrynSwapNetwork.address, value);

        const path = [smartToken4.address, smartToken3.address, smartToken3.address, smartToken2.address, smartToken2.address];

        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.claimAndConvertFor(path, value, MIN_RETURN, sender2);

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convertFor returns a valid amount when buying the smart token', async () => {
        const amount = await sovrynSwapNetwork.convertFor.call(smartToken1BuyPath, value, MIN_RETURN, sender2, { value });
        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('verifies that convert returns a valid amount when buying the smart token', async () => {
        const amount = await sovrynSwapNetwork.convert.call(smartToken1BuyPath, value, MIN_RETURN, { from: sender2, value });
        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('verifies that convertFor returns a valid amount when converting from ETH to ERC20', async () => {
        const amount = await sovrynSwapNetwork.convertFor.call(etherToErc20ConvertPath, value, MIN_RETURN, sender2, { value });
        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('verifies that convert returns a valid amount when converting from ETH to ERC20', async () => {
        const amount = await sovrynSwapNetwork.convert.call(etherToErc20ConvertPath, value, MIN_RETURN, { from: sender2, value });
        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('should revert when calling convertFor with ether token but without sending ether', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.convertFor(smartToken1BuyPath, value, MIN_RETURN, sender2));
    });

    it('should revert when calling convertFor with ether amount different than the amount sent', async () => {
        await expectRevert(sovrynSwapNetwork.convertFor.call(smartToken1BuyPath, value.add(new BN(1)), MIN_RETURN, sender2,
            { value }), 'ERR_ETH_AMOUNT_MISMATCH');
    });

    it('should revert when calling convertFor with invalid path', async () => {
        const invalidPath = [etherToken.address, smartToken1.address];

        await expectRevert(sovrynSwapNetwork.convertFor(invalidPath, value, MIN_RETURN, sender2, { value }),
            'ERR_INVALID_PATH');
    });

    it('should revert when calling convertFor with invalid long path', async () => {
        const longBuyPath = [];
        for (let i = 0; i < 100; ++i) {
            longBuyPath.push(etherToken.address);
        }

        await expectRevert(sovrynSwapNetwork.convertFor(longBuyPath, value, MIN_RETURN, sender2, { value }),
            'ERR_INVALID_PATH');
    });

    it('should revert when calling convert with ether token but without sending ether', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.convert(smartToken1BuyPath, value, MIN_RETURN, { from: sender2 }));
    });

    it('should revert when calling convert with ether amount different than the amount sent', async () => {
        await expectRevert(sovrynSwapNetwork.convert.call(smartToken1BuyPath, value.add(new BN(1)), MIN_RETURN,
            { from: sender2, value }), 'ERR_ETH_AMOUNT_MISMATCH');
    });

    it('should revert when calling convert with invalid path', async () => {
        const invalidPath = [etherToken.address, smartToken1.address];

        await expectRevert(sovrynSwapNetwork.convert(invalidPath, value, MIN_RETURN, { from: sender2, value }),
            'ERR_INVALID_PATH');
    });

    it('should revert when calling convert with invalid long path', async () => {
        const longBuyPath = [];
        for (let i = 0; i < 100; ++i) {
            longBuyPath.push(etherToken.address);
        }

        await expectRevert(sovrynSwapNetwork.convert(longBuyPath, value, MIN_RETURN, { from: sender2, value }),
            'ERR_INVALID_PATH');
    });

    it('verifies that claimAndConvertFor transfers the converted amount correctly', async () => {
        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken3.balanceOf.call(sender2);

        await sovrynSwapNetwork.claimAndConvertFor(smartToken3BuyPath, value, MIN_RETURN, sender2);

        const newTokenBalance = await smartToken3.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('should revert when calling claimAndConvertFor without approval', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.claimAndConvertFor(smartToken3BuyPath, value, MIN_RETURN, sender2));
    });

    it('verifies that claimAndConvert transfers the converted amount correctly', async () => {
        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken3.balanceOf.call(sender);

        await sovrynSwapNetwork.claimAndConvert(smartToken3BuyPath, value, MIN_RETURN);

        const newTokenBalance = await smartToken3.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('should revert when calling claimAndConvert without approval', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.claimAndConvert(smartToken3BuyPath, value, MIN_RETURN));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken1BuyPath, value))[0];

        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convertFor(smartToken1BuyPath, value, MIN_RETURN, sender2, { value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);

        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token through multiple converters', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2BuyPath, value))[0];

        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.convertFor(smartToken2BuyPath, value, MIN_RETURN, sender2, { value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken1BuyPath, value))[0];

        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert(smartToken1BuyPath, value, MIN_RETURN, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token through multiple converters', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2BuyPath, value))[0];

        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert(smartToken2BuyPath, value, MIN_RETURN, { from: sender2, value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for cross reserve conversion', async () => {
        await sovrynSwapNetwork.convert([etherToken.address, smartToken1.address, smartToken1.address], value, MIN_RETURN, { from: sender2, value });
        await smartToken1.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const path = [smartToken1.address, smartToken2.address, smartToken3.address];
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(path, value))[0];

        const prevTokenBalance = await smartToken3.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert(path, value, MIN_RETURN, { from: sender2 });

        const newTokenBalance = await smartToken3.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for selling the smart token via convert', async () => {
        await sovrynSwapNetwork.convert(smartToken1BuyPath, value, MIN_RETURN, { from: sender2, value });

        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken1SellPath, value))[0];
        await smartToken1.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const prevEthBalance = await balance.current(sender2);

        const res = await sovrynSwapNetwork.convert(smartToken1SellPath, value, MIN_RETURN, { from: sender2 });
        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        const newEthBalance = await balance.current(sender2);
        expect(newEthBalance).to.be.bignumber.equal(prevEthBalance.add(returnByPath).sub(transactionCost));
    });

    it('verifies that getReturnByPath returns the correct amount for selling the smart token through multiple converters', async () => {
        await sovrynSwapNetwork.convert(smartToken2BuyPath, value, MIN_RETURN, { from: sender2, value });

        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2SellPath, value))[0];
        await smartToken2.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const prevEthBalance = await balance.current(sender2);

        const res = await sovrynSwapNetwork.convert(smartToken2SellPath, value, MIN_RETURN, { from: sender2 });

        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        const newEthBalance = await balance.current(sender2);
        expect(newEthBalance).to.be.bignumber.equal(prevEthBalance.add(returnByPath).sub(transactionCost));
    });

    it('verifies that getReturnByPath returns the correct amount for selling the smart token with a long conversion path', async () => {
        await sovrynSwapNetwork.convert([etherToken.address, smartToken1.address, smartToken1.address, smartToken2.address, smartToken3.address], value,
            MIN_RETURN, { from: sender2, value });

        const path = [smartToken3.address, smartToken2.address, smartToken2.address, smartToken2.address, smartToken1.address,
            smartToken1.address, etherToken.address];
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(path, value))[0];
        await smartToken3.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const prevEthBalance = await balance.current(sender2);

        const res = await sovrynSwapNetwork.convert(path, value, MIN_RETURN, { from: sender2 });

        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        const newEthBalance = await balance.current(sender2);
        expect(newEthBalance).to.be.bignumber.equal(prevEthBalance.add(returnByPath).sub(transactionCost));
    });

    it('verifies that getReturnByPath returns the same amount as getReturn when converting a reserve to the smart token', async () => {
        const getReturn = (await converter2.getReturn.call(smartToken1.address, smartToken2.address, value))[0];
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call([smartToken1.address, smartToken2.address, smartToken2.address], value))[0];

        expect(getReturn).to.be.bignumber.equal(returnByPath);
    });

    it('verifies that getReturnByPath returns the same amount as getReturn when converting from a token to a reserve', async () => {
        const getReturn = (await converter2.getReturn.call(smartToken2.address, smartToken1.address, value))[0];
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call([smartToken2.address, smartToken2.address, smartToken1.address], value))[0];

        expect(getReturn).to.be.bignumber.equal(returnByPath);
    });

    it('should revert when attempting to call getReturnByPath on a path with fewer than 3 elements', async () => {
        const invalidPath = [etherToken.address, smartToken1.address];
        await expectRevert(sovrynSwapNetwork.getReturnByPath.call(invalidPath, value), 'ERR_INVALID_PATH');
    });

    it('should revert when attempting to call getReturnByPath on a path with an odd number of elements', async () => {
        const invalidPath = [etherToken.address, smartToken1.address, smartToken2.address, smartToken3.address];
        await expectRevert(sovrynSwapNetwork.getReturnByPath.call(invalidPath, value), 'ERR_INVALID_PATH');
    });

    it('should revert when attempting to get the return by path with invalid long path', async () => {
        const longBuyPath = [];
        for (let i = 0; i < 103; ++i) {
            longBuyPath.push(etherToken.address);
        }

        await expectRevert.unspecified(sovrynSwapNetwork.getReturnByPath.call(longBuyPath, value));
    });

    it('verifies that convertFor2 transfers the converted amount correctly', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);
        await sovrynSwapNetwork.convertFor2(smartToken1BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0, { value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convert2 transfers the converted amount correctly', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);
        await sovrynSwapNetwork.convert2(smartToken1BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies claimAndConvertFor2 with a path that starts with a smart token and ends with another smart token', async () => {
        await smartToken4.approve(sovrynSwapNetwork.address, value);

        const path = [smartToken4.address, smartToken3.address, smartToken3.address, smartToken2.address, smartToken2.address];

        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.claimAndConvertFor2(path, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0);

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convertFor2 returns a valid amount when buying the smart token', async () => {
        const amount = await sovrynSwapNetwork.convertFor2.call(smartToken1BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0, { value });

        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('verifies that convert2 returns a valid amount when buying the smart token', async () => {
        const amount = await sovrynSwapNetwork.convert2.call(smartToken1BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('verifies that convertFor2 returns a valid amount when converting from ETH to ERC20', async () => {
        const amount = await sovrynSwapNetwork.convertFor2.call(etherToErc20ConvertPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0, { value });

        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('verifies that convert2 returns a valid amount when converting from ETH to ERC20', async () => {
        const amount = await sovrynSwapNetwork.convert2.call(etherToErc20ConvertPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        expect(amount).be.bignumber.gt(new BN(0));
    });

    it('should revert when calling convertFor2 with ether token but without sending ether', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.convertFor2(smartToken1BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0));
    });

    it('should revert when calling convertFor2 with ether amount different than the amount sent', async () => {
        await expectRevert(sovrynSwapNetwork.convertFor2.call(smartToken1BuyPath, value.add(new BN(1)), MIN_RETURN, sender2, ZERO_ADDRESS, 0,
            { value }), 'ERR_ETH_AMOUNT_MISMATCH');
    });

    it('should revert when calling convertFor2 with invalid path', async () => {
        const invalidPath = [etherToken.address, smartToken1.address];

        await expectRevert(sovrynSwapNetwork.convertFor2(invalidPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0,
            { value }), 'ERR_INVALID_PATH');
    });

    it('should revert when calling convertFor2 with invalid long path', async () => {
        const longBuyPath = [];
        for (let i = 0; i < 100; ++i) {
            longBuyPath.push(etherToken.address);
        }

        await expectRevert(sovrynSwapNetwork.convertFor2(longBuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0,
            { value }), 'ERR_INVALID_PATH');
    });

    it('should revert when calling convert2 with ether token but without sending ether', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.convert2(smartToken1BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2 }));
    });

    it('should revert when calling convert2 with ether amount different than the amount sent', async () => {
        await expectRevert(sovrynSwapNetwork.convert2.call(smartToken1BuyPath, value.add(new BN(1)), MIN_RETURN, ZERO_ADDRESS, 0,
            { from: sender2, value }), 'ERR_ETH_AMOUNT_MISMATCH');
    });

    it('should revert when calling convert2 with invalid path', async () => {
        const invalidPath = [etherToken.address, smartToken1.address];

        await expectRevert(sovrynSwapNetwork.convert2(invalidPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value }),
            'ERR_INVALID_PATH');
    });

    it('should revert when calling convert2 with invalid long path', async () => {
        const longBuyPath = [];
        for (let i = 0; i < 100; ++i) {
            longBuyPath.push(etherToken.address);
        }

        await expectRevert(sovrynSwapNetwork.convert2(longBuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value }),
            'ERR_INVALID_PATH');
    });

    it('verifies that claimAndConvertFor2 transfers the converted amount correctly', async () => {
        await smartToken1.approve(sovrynSwapNetwork.address, value);
        const prevTokenBalance = await smartToken3.balanceOf.call(sender2);
        await sovrynSwapNetwork.claimAndConvertFor2(smartToken3BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0);
        const newTokenBalance = await smartToken3.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('should revert when calling claimAndConvertFor2 without approval', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.claimAndConvertFor2(smartToken3BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0));
    });

    it('verifies that claimAndConvert2 transfers the converted amount correctly', async () => {
        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken3.balanceOf.call(sender);

        await sovrynSwapNetwork.claimAndConvert2(smartToken3BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0);

        const newTokenBalance = await smartToken3.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('should revert when calling claimAndConvert2 without approval', async () => {
        await expectRevert.unspecified(sovrynSwapNetwork.claimAndConvert2(smartToken3BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken1BuyPath, value))[0];

        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convertFor2(smartToken1BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0, { value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token through multiple converters', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2BuyPath, value))[0];

        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.convertFor2(smartToken2BuyPath, value, MIN_RETURN, sender2, ZERO_ADDRESS, 0, { value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken1BuyPath, value))[0];

        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert2(smartToken1BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for buying the smart token through multiple converters', async () => {
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2BuyPath, value))[0];

        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert2(smartToken2BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('should be able to convert2 from a non compliant ERC20 to another token', async () => {
        await erc20Token.approve(sovrynSwapNetwork.address, value);

        const path = [erc20Token.address, smartToken4.address, smartToken4.address];

        const prevTokenBalance = await smartToken4.balanceOf.call(sender);

        await sovrynSwapNetwork.convert2(path, value, MIN_RETURN, ZERO_ADDRESS, 0);

        const newTokenBalance = await smartToken4.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('should be able to convert2 from a smart token to a non compliant ERC20', async () => {
        await smartToken4.approve(sovrynSwapNetwork.address, value);

        const path = [smartToken4.address, smartToken4.address, erc20Token.address];

        const prevTokenBalance = await erc20Token.balanceOf.call(sender);

        await sovrynSwapNetwork.convert2(path, value, MIN_RETURN, ZERO_ADDRESS, 0);

        const newTokenBalance = await erc20Token.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convert2 with a single converter results in increased balance for the buyer', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert2(smartToken1BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convert2 with multiple converters results in increased balance for the buyer', async () => {
        const prevTokenBalance = await smartToken2.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert2(smartToken2BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    // eslint-disable-next-line max-len
    it('verifies that convert2 with minimum return equal to the full expected return amount results in the exact increase in balance for the buyer', async () => {
        const prevTokenBalance = await smartToken2.balanceOf.call(sender);

        const returnAmount = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2BuyPath, value))[0];
        await sovrynSwapNetwork.convert2(smartToken2BuyPath, value, returnAmount, ZERO_ADDRESS, 0, { value });

        const newTokenBalance = await smartToken2.balanceOf.call(sender);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnAmount));
    });

    it('should revert when attempting to convert2 and the return amount is lower than the given minimum', async () => {
        await expectRevert(sovrynSwapNetwork.convert2(smartToken2BuyPath, value, 1000000, ZERO_ADDRESS, 0,
            { from: sender2, value }), 'ERR_RETURN_TOO_LOW');
    });

    it('should revert when attempting to convert2 and passing an amount higher than the ETH amount sent with the request', async () => {
        await expectRevert(sovrynSwapNetwork.convert2(smartToken2BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0,
            { from: sender2, value: value.add(new BN(1)) }), 'ERR_ETH_AMOUNT_MISMATCH');
    });

    it('verifies the caller balances after selling directly for ether with a single converter', async () => {
        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken1.balanceOf.call(sender);
        const prevETHBalance = await balance.current(sender);

        const res = await sovrynSwapNetwork.convert2(smartToken1SellPath, value, MIN_RETURN, ZERO_ADDRESS, 0);
        const newETHBalance = await balance.current(sender);
        const newTokenBalance = await smartToken1.balanceOf.call(sender);

        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        expect(newETHBalance).to.be.bignumber.gt(prevETHBalance.sub(transactionCost));
        expect(newTokenBalance).to.be.bignumber.lt(prevTokenBalance);
    });

    it('verifies the caller balances after selling directly for ether with multiple converters', async () => {
        await smartToken2.approve(sovrynSwapNetwork.address, value);
        const prevTokenBalance = await smartToken2.balanceOf.call(sender);
        const prevETHBalance = await balance.current(sender);

        const res = await sovrynSwapNetwork.convert2(smartToken2SellPath, value, MIN_RETURN, ZERO_ADDRESS, 0);
        const newETHBalance = await balance.current(sender);
        const newTokenBalance = await smartToken2.balanceOf.call(sender);

        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        expect(newETHBalance).to.be.bignumber.gt(prevETHBalance.sub(transactionCost));
        expect(newTokenBalance).to.be.bignumber.lt(prevTokenBalance);
    });

    it('should revert when attempting to sell directly for ether and the return amount is lower than the given minimum', async () => {
        await smartToken2.approve(sovrynSwapNetwork.address, value);

        await expectRevert(sovrynSwapNetwork.convert2(smartToken2SellPath, value, value.add(new BN(10)), ZERO_ADDRESS, 0),
            'ERR_RETURN_TOO_LOW');
    });

    it('verifies the caller balances after converting from one token to another with multiple converters', async () => {
        const path = [
            smartToken1.address,
            smartToken2.address, smartToken2.address,
            smartToken2.address, smartToken3.address,
            smartToken3.address, smartToken4.address
        ];

        await smartToken1.approve(sovrynSwapNetwork.address, value);

        const prevToken1Balance = await smartToken1.balanceOf.call(sender);
        const prevToken4Balance = await smartToken4.balanceOf.call(sender);

        await sovrynSwapNetwork.convert2(path, value, MIN_RETURN, ZERO_ADDRESS, 0);

        const newToken1Balance = await smartToken1.balanceOf.call(sender);
        const newToken4Balance = await smartToken4.balanceOf.call(sender);

        expect(newToken4Balance).to.be.bignumber.gt(prevToken4Balance);
        expect(newToken1Balance).to.be.bignumber.lt(prevToken1Balance);
    });

    it('verifies that getReturnByPath returns the correct amount for cross reserve conversion', async () => {
        await sovrynSwapNetwork.convert2([etherToken.address, smartToken1.address, smartToken1.address], value, MIN_RETURN,
            ZERO_ADDRESS, 0, { from: sender2, value });
        await smartToken1.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const path = [smartToken1.address, smartToken2.address, smartToken3.address];

        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(path, value))[0];

        const prevTokenBalance = await smartToken3.balanceOf.call(sender2);

        await sovrynSwapNetwork.convert2(path, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2 });

        const newTokenBalance = await smartToken3.balanceOf.call(sender2);
        expect(newTokenBalance).to.be.bignumber.equal(prevTokenBalance.add(returnByPath));
    });

    it('verifies that getReturnByPath returns the correct amount for selling the smart token via convert2', async () => {
        await sovrynSwapNetwork.convert2(smartToken1BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });
        await smartToken1.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken1SellPath, value))[0];

        const prevEthBalance = await balance.current(sender2);

        const res = await sovrynSwapNetwork.convert2(smartToken1SellPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2 });
        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        const newEthBalance = await balance.current(sender2);
        expect(newEthBalance).to.be.bignumber.equal(prevEthBalance.add(returnByPath).sub(transactionCost));
    });

    it('verifies that getReturnByPath returns the correct amount for selling the smart token through multiple converters', async () => {
        await sovrynSwapNetwork.convert2(smartToken2BuyPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });
        await smartToken2.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(smartToken2SellPath, value))[0];
        const prevEthBalance = await balance.current(sender2);

        const res = await sovrynSwapNetwork.convert2(smartToken2SellPath, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2 });
        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        const newEthBalance = await balance.current(sender2);
        expect(newEthBalance).to.be.bignumber.equal(prevEthBalance.add(returnByPath).sub(transactionCost));
    });

    it('verifies that getReturnByPath returns the correct amount for selling the smart token with a long conversion path', async () => {
        await sovrynSwapNetwork.convert2([etherToken.address, smartToken1.address, smartToken1.address, smartToken2.address,
            smartToken3.address], value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2, value });
        await smartToken3.approve(sovrynSwapNetwork.address, value, { from: sender2 });

        const path = [smartToken3.address, smartToken2.address, smartToken2.address, smartToken2.address, smartToken1.address,
            smartToken1.address, etherToken.address];
        const returnByPath = (await sovrynSwapNetwork.getReturnByPath.call(path, value))[0];

        const prevEthBalance = await balance.current(sender2);

        const res = await sovrynSwapNetwork.convert2(path, value, MIN_RETURN, ZERO_ADDRESS, 0, { from: sender2 });
        const transaction = await web3.eth.getTransaction(res.tx);
        const transactionCost = new BN(transaction.gasPrice).mul(new BN(res.receipt.cumulativeGasUsed));

        const newEthBalance = await balance.current(sender2);
        expect(newEthBalance).to.be.bignumber.equal(prevEthBalance.add(returnByPath).sub(transactionCost));
    });

    it('verifies that convertFor2 transfers the affiliate fee correctly', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(affiliate);

        await sovrynSwapNetwork.convertFor2(smartToken1BuyPath, value, MIN_RETURN, sender2, affiliate, AFFILIATE_FEE, { value });

        const newTokenBalance = await smartToken1.balanceOf.call(affiliate);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that convert2 transfers the affiliate fee correctly', async () => {
        const prevTokenBalance = await smartToken1.balanceOf.call(affiliate);

        await sovrynSwapNetwork.convert2(smartToken1BuyPath, value, MIN_RETURN, affiliate, AFFILIATE_FEE, { from: sender2, value });

        const newTokenBalance = await smartToken1.balanceOf.call(affiliate);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that claimAndConvert2 transfers the affiliate fee correctly', async () => {
        await smartToken3.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken1.balanceOf.call(affiliate);

        await sovrynSwapNetwork.claimAndConvert2(smartToken3SellPath, value, MIN_RETURN, affiliate, AFFILIATE_FEE);

        const newTokenBalance = await smartToken1.balanceOf.call(affiliate);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that claimAndConvertFor2 transfers the affiliate fee correctly', async () => {
        await smartToken3.approve(sovrynSwapNetwork.address, value);

        const prevTokenBalance = await smartToken1.balanceOf.call(affiliate);

        await sovrynSwapNetwork.claimAndConvertFor2(smartToken3SellPath, value, MIN_RETURN, sender2, affiliate, AFFILIATE_FEE);

        const newTokenBalance = await smartToken1.balanceOf.call(affiliate);
        expect(newTokenBalance).to.be.bignumber.gt(prevTokenBalance);
    });

    it('verifies that setMaxAffiliateFee can set the maximum affiliate-fee', async () => {
        const oldMaxAffiliateFee = await sovrynSwapNetwork.maxAffiliateFee.call();
        await sovrynSwapNetwork.setMaxAffiliateFee(oldMaxAffiliateFee.add(MIN_RETURN));

        const newMaxAffiliateFee = await sovrynSwapNetwork.maxAffiliateFee.call();
        await sovrynSwapNetwork.setMaxAffiliateFee(oldMaxAffiliateFee);

        expect(newMaxAffiliateFee).to.be.bignumber.equal(oldMaxAffiliateFee.add(MIN_RETURN));
    });

    it('should revert when calling setMaxAffiliateFee with a non-owner', async () => {
        await expectRevert(sovrynSwapNetwork.setMaxAffiliateFee(new BN(1000000), { from: nonOwner }), 'ERR_ACCESS_DENIED');
    });

    it('should revert when calling setMaxAffiliateFee with an illegal value', async () => {
        await expectRevert(sovrynSwapNetwork.setMaxAffiliateFee(new BN(1000001), { from: sender }), 'ERR_INVALID_AFFILIATE_FEE');
    });
});
