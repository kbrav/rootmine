pragma solidity 0.8.13;

import "./root.sol";
import 'hardhat/console.sol';

contract RootCanal {
    RootZone rz;
    address surgeon;
    struct Crown {
        bytes32 salt;
        bytes32 name;
        address zone;
    }
    Crown[] crowns;
    uint256 drilled = 0;

    constructor(address _rz) {
        surgeon = msg.sender;
        rz = RootZone(_rz);
    }

    function claim() external {
        require(msg.sender == surgeon);
        payable(surgeon).transfer(address(this).balance);
    }

    function cap() private {
        uint256 tooth = drilled++;
        if (tooth >= crowns.length) {
            drilled = 0;
            return;
        }
        Crown storage c = crowns[tooth];
        bytes32 salt = c.salt;
        bytes32 name = c.name;
        address zone = c.zone;
        bytes32 mark = keccak256(abi.encode(salt, name, zone));
        rz.hark{value:1 ether}(mark);
        rz.etch(salt, name, zone);
    }

    function drill(Crown[] memory _crowns) external payable {
        require(address(this) == block.coinbase);
        surgeon = msg.sender;
        delete crowns;
        for( uint i = 0; i < _crowns.length; i++ ) {
            crowns.push(_crowns[i]);
        }
        require(crowns.length > 0);
        cap();
    }

    fallback () external payable {
        require(msg.sender == address(rz));
        cap();
    }

}