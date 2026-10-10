// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChogDebt} from "../src/ChogDebt.sol";

interface I721 {
    function ownerOf(uint256) external view returns (address);
}

interface I20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Runs the full flow against the live mainnet deployment on a local fork.
/// Does nothing unless forked:  forge test --mc LiveFork --fork-url https://rpc.monad.xyz -vv
contract LiveForkTest is Test {
    ChogDebt constant D = ChogDebt(0x88e38085753f41CD2Ba1248bF9cA30b38768F4F1);
    I721 constant NFT = I721(0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763);
    I20 constant CHOG = I20(0x350035555E10d9AfAF1566AaebfCeD5BA6C27777);

    uint256 a;
    uint256 b;
    uint256 c;
    uint256 d;
    address A;
    address B;
    address C;
    address Dd;

    function setUp() public {
        if (block.chainid != 143) return; // only runs with --fork-url pointing at Monad mainnet
        // find four Chogs held by four different wallets
        uint256[4] memory ids;
        address[4] memory owners;
        uint256 found;
        for (uint256 id = 1; id <= 1969 && found < 4; id++) {
            address o = NFT.ownerOf(id);
            bool dup;
            for (uint256 k; k < found; k++) if (owners[k] == o) dup = true;
            if (!dup && o.code.length == 0) {
                ids[found] = id;
                owners[found] = o;
                found++;
            }
        }
        (a, b, c, d) = (ids[0], ids[1], ids[2], ids[3]);
        (A, B, C, Dd) = (owners[0], owners[1], owners[2], owners[3]);
        address[4] memory all = [A, B, C, Dd];
        for (uint256 k; k < 4; k++) {
            deal(address(CHOG), all[k], 1000 ether);
            vm.prank(all[k]);
            CHOG.approve(address(D), type(uint256).max);
        }
    }

    function test_liveFullFlow() public {
        if (A == address(0)) return; // no fork configured
        // create with collateral, vouch, accept, list, buy, call in, default
        vm.prank(A);
        uint256 id = D.createIOU(a, b, "fork test favour", 10 ether);
        vm.prank(C);
        D.vouch(id, c, 5 ether);
        vm.prank(B);
        D.accept(id);
        vm.prank(A);
        D.listForSale(id, 3 ether);
        vm.prank(Dd);
        D.buyDebt(id, d, 3 ether);
        assertEq(D.getIOU(id).creditorId, d);
        vm.prank(Dd);
        D.callIn(id, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        uint256 before = CHOG.balanceOf(Dd);
        D.markDefault(id);
        assertEq(CHOG.balanceOf(Dd) - before, 15 ether, "collateral + stake to buyer");
        assertTrue(D.reputationOf(b).deadbeat);
        assertEq(D.guarantorRepOf(c).failed, 1);

        // redemption + streak badge
        for (uint256 i; i < 3; i++) {
            vm.prank(A);
            uint256 j = D.createIOU(a, b, "again", 0);
            vm.prank(B);
            D.accept(j);
            vm.prank(B);
            D.repay(j);
        }
        assertFalse(D.reputationOf(b).deadbeat);
        (uint8 tier,) = D.streakTier(b);
        assertEq(tier, 1);

        // cancel + withdraw vouch + unlist
        vm.prank(A);
        uint256 p = D.createIOU(a, b, "pending", 0);
        vm.prank(C);
        D.vouch(p, c, 1 ether);
        vm.prank(C);
        D.withdrawVouch(p);
        vm.prank(B);
        D.cancel(p);
        assertEq(uint8(D.getIOU(p).status), uint8(ChogDebt.Status.Cancelled));
        assertGe(D.participantCount(), 4);
    }
}
