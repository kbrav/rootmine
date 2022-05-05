pragma solidity 0.8.13;

import "./root.sol";

contract RootMine {
    RootZone rz;
    address miner;
    struct Ore {
        bytes32 salt;
        bytes32 name;
        address zone;
    }
    Ore[] ores;
    uint256 extracted = 0;

    constructor(address _rz) {
        miner = msg.sender;
        rz = RootZone(_rz);
    }

    function claim() external {
        payable(miner).transfer(address(this).balance);
    }

    function drill(Ore[] memory _ores, bytes32 mark) external payable {
        require(address(this) == block.coinbase, "ERR_COINBASE");
        require(_ores.length > 0, "ERR_NO_TEEF");
        miner = msg.sender;
        for( uint i = 0; i < _ores.length; i++ ) {
            ores.push(_ores[i]);
        }
        rz.hark{value: 1 ether}(mark);
    }

    fallback () external payable {
        require(msg.sender == address(rz), "ERR_UNAUTHORIZED");
        if (extracted >= ores.length) {
            extracted = 0;
            delete ores;
            return;
        }
        Ore storage t = ores[extracted++];
        bytes32 salt = t.salt;
        bytes32 name = t.name;
        address zone = t.zone;
        bytes32 mark = keccak256(abi.encode(salt, name, zone));
        rz.hark{value:1 ether}(mark);
        rz.etch(salt, name, zone);
    }

}