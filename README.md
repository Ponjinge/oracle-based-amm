﻿# SovrynSwap Protocol Contracts v0.6 (beta)

[![Docs](https://img.shields.io/badge/docs-%F0%9F%93%84-blue)](https://docs.bancor.network/)
[![NPM Package](https://img.shields.io/npm/v/@bancor/contracts-solidity.svg)](https://www.npmjs.org/package/@bancor/contracts-solidity)

## Overview

The solidity version of the Sovryn Swap smart contracts is composed of many different components that work together to create the SovrynSwap Network deployment.

The main contracts are the SovrynSwapNetwork contract (entry point to the system) and the different converter contracts (implementation of liquidity pools and their reserves).

## Upgradeability

All smart contract functions are public and all upgrades are opt-in. If significant improvements are made to the system a new version will be released. Token owners can choose between moving to the new system or staying in the old one. If possible, new versions will be backwards compatible and able to interact with the old versions.

## Language

The terms “reserves” and “connectors” have the same meaning throughout SovrynSwap’s smart contract code and documentation. “Reserve ratio” and “connector weight” are also used interchangeably. “Connector balance” refers to the token inventories held in a Smart Token’s reserve.

## Warning

Sovryn Swap is a work in progress. Make sure you understand the risks before using it.

## Testing

### Prerequisites

* node 10.16.0
* npm 6.9.0
* python 3.7.3
* web3.py 4.9.2

### Installation

* `npm install`

### Verification

* Verifying all the contracts:
  * `npm test` (quick testing)
  * `npm run coverage` (full coverage)
* [Verifying the SovrynSwapFormula contract](solidity/python/README.md)

### [Utilities](solidity/utils/README.md)

## MoC Integraton

There are three MoC SCs files:
1. MocBTCToBTCOracle: it is used only for tests purposes. It has a hardcoded rate of 1.
2. MocBTCToUSDOracle: it is the original MoC contract to get BTC/USD pair price.
3. MocUSDToBTCOracle: it returns USD/BTC price doing `1/(BTC/USD price)`.

To do the integration:
1. Get MoC medianizer SC address (BTC to USD)
  - Testnet: 0x667bd3d048FaEBb85bAa0E9f9D87cF4c8CDFE849
  - Mainnet: See [MoC Contracts verification.md](https://github.com/money-on-chain/main-RBTC-contract/blob/master/Contracts%20verification.md)
2. Deploy the neccesary oracles passing the medianizer address as constructor argument.

## License

SovrynSwap Protocol is open source and distributed under the Apache License v2.0
