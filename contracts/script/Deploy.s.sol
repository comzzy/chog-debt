// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChogDebt} from "../src/ChogDebt.sol";

/// Env vars:
///   CHOG_NFT    - Chog ERC-721 address (required)
///   CHOG_TOKEN  - $CHOG ERC-20 address (optional, leave unset or 0x0 to disable)
/// The signing key is NOT read here. Pass it on the command line, e.g.
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast \
///     --keystore <encrypted keystore> (or --private-key $PRIVATE_KEY from your shell)
contract Deploy is Script {
    function run() external returns (ChogDebt d) {
        address nft = vm.envAddress("CHOG_NFT");
        address token = vm.envOr("CHOG_TOKEN", address(0));
        vm.startBroadcast();
        d = new ChogDebt(nft, token);
        vm.stopBroadcast();
        console2.log("ChogDebt deployed at", address(d));
    }
}
