pragma solidity 0.8.13;

import "./root.sol";
import 'hardhat/console.sol';

contract RootCanal {
    RootZone rz;
    address surgeon;
    struct Toof {
        bytes32 salt;
        bytes32 name;
        address zone;
    }
    Toof[] teef;
    uint256 drilled = 0;

    constructor(address _rz) {
        surgeon = msg.sender;
        rz = RootZone(_rz);
    }

    function claim() external {
        payable(surgeon).transfer(address(this).balance);
    }

    function drill(Toof[] memory _teef, bytes32 mark) external payable {
        require(address(this) == block.coinbase);
        require(_teef.length > 0);
        surgeon = msg.sender;
        for( uint i = 0; i < _teef.length; i++ ) {
            teef.push(_teef[i]);
        }
        rz.hark{value: 1 ether}(mark);
    }

    fallback () external payable {
        require(msg.sender == address(rz));
        if (drilled >= teef.length) {
            drilled = 0;
            delete teef;
            return;
        }
        Toof storage t = teef[drilled++];
        bytes32 salt = t.salt;
        bytes32 name = t.name;
        address zone = t.zone;
        bytes32 mark = keccak256(abi.encode(salt, name, zone));
        rz.hark{value:1 ether}(mark);
        rz.etch(salt, name, zone);
    }

}