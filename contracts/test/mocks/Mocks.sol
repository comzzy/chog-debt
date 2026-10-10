// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockChog {
    mapping(uint256 => address) public owners;
    function mint(address to, uint256 id) external { owners[id] = to; }
    function transferFrom(address from, address to, uint256 id) external {
        require(owners[id] == from && msg.sender == from, "not owner");
        owners[id] = to;
    }
    function ownerOf(uint256 id) external view returns (address o) {
        o = owners[id];
        require(o != address(0), "ERC721: invalid token ID");
    }
    function supportsInterface(bytes4 i) external pure returns (bool) { return i == 0x80ac58cd || i == 0x01ffc9a7; }
}

contract MockCHOG {
    string public name = "Chog";
    string public symbol = "CHOG";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}
