// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChogDebt} from "../src/ChogDebt.sol";
import {MockChog, MockCHOG} from "./mocks/Mocks.sol";

contract ChogDebtTest is Test {
    ChogDebt debt;
    ChogDebt noToken;
    MockChog nft;
    MockCHOG token;

    address alice = makeAddr("alice"); // owns Chog 1
    address bob = makeAddr("bob"); // owns Chog 2
    address carol = makeAddr("carol"); // owns Chog 3
    address rando = makeAddr("rando");

    function setUp() public {
        nft = new MockChog();
        token = new MockCHOG();
        debt = new ChogDebt(address(nft), address(token));
        noToken = new ChogDebt(address(nft), address(0));
        nft.mint(alice, 1);
        nft.mint(bob, 2);
        nft.mint(carol, 3);
        token.mint(bob, 1000 ether);
        vm.prank(bob);
        token.approve(address(debt), type(uint256).max);
    }

    function _create(uint128 amt) internal returns (uint256 id) {
        vm.prank(alice);
        id = debt.createIOU(1, 2, "helped you fix your bot", amt);
    }

    function _active(uint128 amt) internal returns (uint256 id) {
        id = _create(amt);
        vm.prank(bob);
        debt.accept(id);
    }

    // ---------- create

    function test_create() public {
        vm.expectEmit(true, true, true, true);
        emit ChogDebt.IOUCreated(1, 1, 2, 0, "helped you fix your bot");
        uint256 id = _create(0);
        ChogDebt.IOU memory i = debt.getIOU(id);
        assertEq(i.creditorId, 1);
        assertEq(i.debtorId, 2);
        assertEq(uint8(i.status), uint8(ChogDebt.Status.Pending));
        assertEq(debt.iouIdsOf(1).length, 1);
        assertEq(debt.iouIdsOf(2)[0], id);
    }

    function test_create_revertsIfNotHolder() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 1));
        debt.createIOU(1, 2, "x", 0);
    }

    function test_create_revertsSameChog() public {
        vm.prank(alice);
        vm.expectRevert(ChogDebt.SameChog.selector);
        debt.createIOU(1, 1, "x", 0);
    }

    function test_create_revertsSameWallet() public {
        nft.mint(alice, 9);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.SameWallet.selector);
        debt.createIOU(1, 9, "x", 0);
    }

    function test_create_revertsBadMemo() public {
        vm.startPrank(alice);
        vm.expectRevert(ChogDebt.BadMemo.selector);
        debt.createIOU(1, 2, "", 0);
        bytes memory long = new bytes(141);
        for (uint256 i; i < 141; i++) long[i] = "a";
        vm.expectRevert(ChogDebt.BadMemo.selector);
        debt.createIOU(1, 2, string(long), 0);
        vm.stopPrank();
    }

    function test_create_revertsNonexistentDebtor() public {
        vm.prank(alice);
        vm.expectRevert();
        debt.createIOU(1, 404, "x", 0);
    }

    function test_create_tokenDisabled() public {
        vm.prank(alice);
        vm.expectRevert(ChogDebt.TokenDisabled.selector);
        noToken.createIOU(1, 2, "x", 5);
        vm.prank(alice);
        noToken.createIOU(1, 2, "x", 0); // pure favour fine
    }

    // ---------- accept / cancel

    function test_accept_updatesRep() public {
        uint256 id = _active(0);
        assertEq(uint8(debt.getIOU(id).status), uint8(ChogDebt.Status.Active));
        assertEq(debt.reputationOf(1).favoursGiven, 1);
        assertEq(debt.reputationOf(2).favoursReceived, 1);
        assertEq(debt.reputationOf(2).open, 1);
        assertEq(debt.trustScore(1), 53);
    }

    function test_accept_onlyDebtor() public {
        uint256 id = _create(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 2));
        debt.accept(id);
    }

    function test_accept_twiceReverts() public {
        uint256 id = _active(0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.WrongStatus.selector, ChogDebt.Status.Active));
        debt.accept(id);
    }

    function test_accept_escrowsChog() public {
        uint256 id = _active(100 ether);
        assertEq(token.balanceOf(address(debt)), 100 ether);
        assertEq(token.balanceOf(bob), 900 ether);
        id;
    }

    function test_cancel_byCreditorOrDebtor() public {
        uint256 a = _create(0);
        vm.prank(alice);
        debt.cancel(a);
        assertEq(uint8(debt.getIOU(a).status), uint8(ChogDebt.Status.Cancelled));
        uint256 b = _create(0);
        vm.prank(bob);
        debt.cancel(b);
        vm.prank(bob);
        vm.expectRevert();
        debt.accept(b);
    }

    function test_cancel_strangerReverts() public {
        uint256 id = _create(0);
        vm.prank(carol);
        vm.expectRevert();
        debt.cancel(id);
    }

    function test_cancel_afterAcceptReverts() public {
        uint256 id = _active(0);
        vm.prank(alice);
        vm.expectRevert();
        debt.cancel(id);
    }

    // ---------- repay

    function test_repay() public {
        uint256 id = _active(0);
        vm.prank(bob);
        debt.repay(id);
        ChogDebt.Reputation memory r = debt.reputationOf(2);
        assertEq(r.repaid, 1);
        assertEq(r.open, 0);
        assertEq(debt.trustScore(2), 58);
    }

    function test_repay_paysCreditor() public {
        uint256 id = _active(100 ether);
        vm.prank(bob);
        debt.repay(id);
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.balanceOf(address(debt)), 0);
    }

    function test_repay_onlyDebtor() public {
        uint256 id = _active(0);
        vm.prank(alice);
        vm.expectRevert();
        debt.repay(id);
    }

    function test_repay_pendingReverts() public {
        uint256 id = _create(0);
        vm.prank(bob);
        vm.expectRevert();
        debt.repay(id);
    }

    function test_repay_afterCallIn() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 days);
        vm.prank(bob);
        debt.repay(id);
        assertEq(debt.reputationOf(2).repaidAfterCall, 1);
        assertEq(debt.trustScore(2), 60);
    }

    function test_repay_lateButBeforeWhistle() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 days);
        vm.warp(block.timestamp + 2 days);
        vm.prank(bob);
        debt.repay(id);
        vm.expectRevert();
        debt.markDefault(id);
    }

    // ---------- call in / default

    function test_callIn_setsDeadline() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 2 days);
        ChogDebt.IOU memory i = debt.getIOU(id);
        assertEq(i.deadline, block.timestamp + 2 days);
        assertEq(uint8(i.status), uint8(ChogDebt.Status.CalledIn));
    }

    function test_callIn_badPeriod() public {
        uint256 id = _active(0);
        vm.startPrank(alice);
        vm.expectRevert(ChogDebt.BadPeriod.selector);
        debt.callIn(id, 10 minutes);
        vm.expectRevert(ChogDebt.BadPeriod.selector);
        debt.callIn(id, 31 days);
        vm.stopPrank();
    }

    function test_callIn_onlyCreditor() public {
        uint256 id = _active(0);
        vm.prank(bob);
        vm.expectRevert();
        debt.callIn(id, 1 days);
    }

    function test_markDefault_tooEarly() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 days);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(ChogDebt.DeadlineNotPassed.selector);
        debt.markDefault(id);
    }

    function test_markDefault_notCalledIn() public {
        uint256 id = _active(0);
        vm.expectRevert();
        debt.markDefault(id);
    }

    function test_markDefault_anyoneCanCall_andDeadbeat() public {
        uint256 id = _active(50 ether);
        vm.prank(alice);
        debt.callIn(id, 1 days);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectEmit(true, false, false, false);
        emit ChogDebt.DeadbeatMarked(2);
        vm.prank(rando);
        debt.markDefault(id);
        ChogDebt.Reputation memory r = debt.reputationOf(2);
        assertTrue(r.deadbeat);
        assertEq(r.defaulted, 1);
        assertEq(r.open, 0);
        assertEq(debt.trustScore(2), 15);
        assertEq(token.balanceOf(alice), 50 ether, "creditor claims collateral");
    }

    function test_deadbeat_redemptionAfterThreeRepays() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        debt.markDefault(id);
        for (uint256 k; k < 3; k++) {
            uint256 j = _active(0);
            vm.prank(bob);
            debt.repay(j);
            if (k < 2) assertTrue(debt.reputationOf(2).deadbeat);
        }
        assertFalse(debt.reputationOf(2).deadbeat);
        assertEq(debt.reputationOf(2).defaulted, 1, "history stays");
    }

    function test_trustScore_clamps() public {
        for (uint256 k; k < 10; k++) {
            uint256 j = _active(0);
            vm.prank(bob);
            debt.repay(j);
        }
        assertEq(debt.trustScore(2), 100);
        for (uint256 k; k < 6; k++) {
            uint256 j = _active(0);
            vm.prank(alice);
            debt.callIn(j, 1 hours);
            vm.warp(block.timestamp + 2 hours);
            debt.markDefault(j);
        }
        assertEq(debt.trustScore(2), 0);
    }

    // ---------- the NFT is the credit score

    function test_debtTravelsWithNft() public {
        uint256 id = _active(0);
        vm.prank(bob);
        nft.transferFrom(bob, carol, 2);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 2));
        debt.repay(id);
        vm.prank(carol);
        debt.repay(id);
        assertEq(debt.reputationOf(2).repaid, 1);
    }

    function test_creditTravelsWithNft_collateralToNewHolder() public {
        uint256 id = _active(10 ether);
        vm.prank(alice);
        nft.transferFrom(alice, carol, 1);
        vm.prank(alice);
        vm.expectRevert();
        debt.callIn(id, 1 days);
        vm.prank(carol);
        debt.callIn(id, 1 days);
        vm.warp(block.timestamp + 2 days);
        debt.markDefault(id);
        assertEq(token.balanceOf(carol), 10 ether);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_deadbeatMarkTravels() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        debt.markDefault(id);
        vm.prank(bob);
        nft.transferFrom(bob, rando, 2);
        assertTrue(debt.reputationOf(2).deadbeat);
    }

    function test_iousOf() public {
        _create(0);
        vm.prank(carol);
        debt.createIOU(3, 2, "lent you gas", 0);
        (uint256[] memory ids, ChogDebt.IOU[] memory list) = debt.iousOf(2);
        assertEq(ids.length, 2);
        assertEq(list[1].creditorId, 3);
        assertEq(list[1].memo, "lent you gas");
        vm.expectRevert(ChogDebt.UnknownIOU.selector);
        debt.getIOU(99);
    }

    // ---------- admin

    function test_pause() public {
        vm.prank(rando);
        vm.expectRevert(ChogDebt.NotOwner.selector);
        debt.setPaused(true);
        uint256 id = _active(0);
        debt.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.IsPaused.selector);
        debt.createIOU(1, 2, "x", 0);
        // repaying still works while paused so nobody gets trapped
        vm.prank(bob);
        debt.repay(id);
    }

    function test_ownership2Step() public {
        debt.transferOwnership(alice);
        assertEq(debt.owner(), address(this));
        vm.prank(bob);
        vm.expectRevert(ChogDebt.NotPendingOwner.selector);
        debt.acceptOwnership();
        vm.prank(alice);
        debt.acceptOwnership();
        assertEq(debt.owner(), alice);
        assertEq(debt.pendingOwner(), address(0));
    }

    function test_constructorZero() public {
        vm.expectRevert(ChogDebt.ZeroAddress.selector);
        new ChogDebt(address(0), address(0));
    }

    function testFuzz_scoreBounded(uint8 repays) public {
        repays = uint8(bound(repays, 0, 20));
        for (uint256 k; k < repays; k++) {
            uint256 j = _active(0);
            vm.prank(bob);
            debt.repay(j);
        }
        assertLe(debt.trustScore(2), 100);
    }
}
