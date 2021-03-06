pragma solidity 0.4.26;

import "./interfaces/IConsumerPriceOracle.sol";
import "./Owned.sol";
import "./SafeMath.sol";

interface Medianizer {
    function peek() external view returns (bytes32, bool);
}

contract MocUSDToBTCOracle is IConsumerPriceOracle, Owned {
    using SafeMath for uint256;

    uint256 public constant DECIMALS = 10**18;

    address public mocOracleAddress;

    event SetMoCOracleAddress(address indexed mocOracleAddress, address changerAddress);

    /**
      * @dev initializes a ne MoC oracle
      *
      * @param _mocOracleAddress MoC oracle address
    */
    constructor(address _mocOracleAddress) public {
        setMoCOracleAddress(_mocOracleAddress);
    }

    /**
      * @dev returns the USD/BTC rate.
      *
      * @return always returns the rate of 10000
    */
    function latestAnswer() external view returns (int256) {
        (bytes32 value, bool hasValue) = Medianizer(mocOracleAddress).peek();
        require(hasValue, "Doesn't has value");
        
        return int256(DECIMALS.div(uint256(value)).mul(DECIMALS));
    }

    /**
      * @dev returns the USD/BTC update time.
      *
      * @return always returns current block's timestamp
    */
    function latestTimestamp() external view returns (uint256) {
        return now; // MoC oracle doesn't return update timestamp
    }

    /**
      * @dev set MoC oracle address
      *
      * @param _mocOracleAddress MoC oracle address
    */
    function setMoCOracleAddress(address _mocOracleAddress) public ownerOnly {
        require(_mocOracleAddress != address(0), "_mocOracleAddress shall not be zero address");
        mocOracleAddress = _mocOracleAddress;
        emit SetMoCOracleAddress(mocOracleAddress, msg.sender);
    }
}
