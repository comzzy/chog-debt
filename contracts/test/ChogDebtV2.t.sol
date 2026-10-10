// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChogDebt} from "../src/ChogDebt.sol";
import {MockChog, MockCHOG} from "./mocks/Mocks.sol";

contract ChogDebtV2Test is Test {
    ChogDebt debt;
    ChogDebt noToken;
    MockChog nft;
    MockCHOG token;

    address alice = makeAddr("alice"); // Chog 1, creditor
    address bob = makeAddr("bob"); // Chog 2, debtor
    address carol = makeAddr("carol"); // Chog 3, buyer / guarantor
    address dave = makeAddr("dave"); // Chog 4
    address rando = makeAddr("rando");

    function setUp() public {
        nft = new MockChog();
        token = new MockCHOG();
        debt = new ChogDebt(address(nft), address(token));
        noToken = new ChogDebt(address(nft), address(0));
        nft.mint(alice, 1);
        nft.mint(bob, 2);
        nft.mint(carol, 3);
        nft.mint(dave, 4);
        address[4] memory who = [alice, bob, carol, dave];
        for (uint256 i; i < 4; i++) {
            token.mint(who[i], 1000 ether);
            vm.prank(who[i]);
            token.approve(address(debt), type(uint256).max);
        }
    }

    function _active(uint128 amt) internal returns (uint256 id) {
        vm.prank(alice);
        id = debt.createIOU(1, 2, "carried you in the raid", amt);
        vm.prank(bob);
        debt.accept(id);
    }

    function _default(uint256 id) internal {
        vm.prank(nft.ownerOf(debt.getIOU(id).creditorId));
        debt.callIn(id, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        debt.markDefault(id);
    }

    function _repay(uint256 id) internal {
        vm.prank(bob);
        debt.repay(id);
    }

    // ================================================================ trading

    function test_list_and_buy() public {
        uint256 id = _active(0);
        vm.expectEmit(true, true, false, true);
        emit ChogDebt.IOUListed(id, 1, 30 ether);
        vm.prank(alice);
        debt.listForSale(id, 30 ether);
        ChogDebt.Listing memory l = debt.getListing(id);
        assertTrue(l.active);
        assertEq(l.seller, alice);

        vm.expectEmit(true, true, true, true);
        emit ChogDebt.IOUSold(id, 1, 3, 30 ether, alice, carol);
        vm.prank(carol);
        debt.buyDebt(id, 3, 30 ether);

        assertEq(debt.getIOU(id).creditorId, 3);
        assertEq(token.balanceOf(alice), 1030 ether);
        assertEq(token.balanceOf(carol), 970 ether);
        assertFalse(debt.getListing(id).active);
        uint256[] memory carolIous = debt.iouIdsOf(3);
        assertEq(carolIous[carolIous.length - 1], id);
    }

    function test_buyer_getsCreditorPowers_andCollateral() public {
        uint256 id = _active(50 ether);
        vm.prank(alice);
        debt.listForSale(id, 10 ether);
        vm.prank(carol);
        debt.buyDebt(id, 3, 10 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 3));
        debt.callIn(id, 1 days);
        _default(id);
        assertEq(token.balanceOf(carol), 1000 ether - 10 ether + 50 ether, "collateral follows the IOU");
        assertEq(token.balanceOf(alice), 1010 ether);
    }

    function test_buy_thenRepay_paysBuyer() public {
        uint256 id = _active(20 ether);
        vm.prank(alice);
        debt.listForSale(id, 5 ether);
        vm.prank(carol);
        debt.buyDebt(id, 3, 5 ether);
        _repay(id);
        assertEq(token.balanceOf(carol), 1015 ether);
    }

    function test_list_calledInAllowed() public {
        uint256 id = _active(0);
        vm.startPrank(alice);
        debt.callIn(id, 1 days);
        debt.listForSale(id, 1 ether);
        vm.stopPrank();
        vm.prank(carol);
        debt.buyDebt(id, 3, 1 ether);
        assertEq(uint8(debt.getIOU(id).status), uint8(ChogDebt.Status.CalledIn));
    }

    function test_list_reverts() public {
        vm.prank(alice);
        uint256 id = debt.createIOU(1, 2, "x", 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.WrongStatus.selector, ChogDebt.Status.Pending));
        debt.listForSale(id, 1 ether);
        vm.prank(bob);
        debt.accept(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 1));
        debt.listForSale(id, 1 ether);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.BadPrice.selector);
        debt.listForSale(id, 0);
    }

    function test_list_tokenDisabled() public {
        vm.prank(alice);
        uint256 id = noToken.createIOU(1, 2, "x", 0);
        vm.prank(bob);
        noToken.accept(id);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.TokenDisabled.selector);
        noToken.listForSale(id, 1);
    }

    function test_cancelListing() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.listForSale(id, 1 ether);
        vm.prank(rando);
        vm.expectRevert();
        debt.cancelListing(id);
        vm.prank(alice);
        debt.cancelListing(id);
        vm.prank(carol);
        vm.expectRevert(ChogDebt.NotListed.selector);
        debt.buyDebt(id, 3, 1 ether);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.NotListed.selector);
        debt.cancelListing(id);
    }

    function test_buy_guards() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.listForSale(id, 10 ether);
        // slippage
        vm.prank(carol);
        vm.expectRevert(ChogDebt.BadPrice.selector);
        debt.buyDebt(id, 3, 9 ether);
        // not holder of buyer chog
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 4));
        debt.buyDebt(id, 4, 10 ether);
        // debtor can't buy their own debt
        vm.prank(bob);
        vm.expectRevert(ChogDebt.BadBuyer.selector);
        debt.buyDebt(id, 2, 10 ether);
        nft.mint(bob, 7);
        vm.prank(bob);
        vm.expectRevert(ChogDebt.BadBuyer.selector);
        debt.buyDebt(id, 7, 10 ether);
        // seller can't buy their own listing with another chog
        nft.mint(alice, 8);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.BadBuyer.selector);
        debt.buyDebt(id, 8, 10 ether);
    }

    function test_listingGoesStaleWhenCreditorChogSold() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.listForSale(id, 10 ether);
        vm.prank(alice);
        nft.transferFrom(alice, dave, 1);
        vm.prank(carol);
        vm.expectRevert(ChogDebt.ListingStale.selector);
        debt.buyDebt(id, 3, 10 ether);
        (uint256[] memory ids,,) = debt.activeListings();
        assertEq(ids.length, 0);
        // new holder can clear it
        vm.prank(dave);
        debt.cancelListing(id);
    }

    function test_listingClearedOnRepayAndDefault() public {
        uint256 a = _active(0);
        uint256 b = _active(0);
        vm.startPrank(alice);
        debt.listForSale(a, 1 ether);
        debt.listForSale(b, 1 ether);
        vm.stopPrank();
        (uint256[] memory ids, ChogDebt.IOU[] memory list, ChogDebt.Listing[] memory ls) = debt.activeListings();
        assertEq(ids.length, 2);
        assertEq(list[0].debtorId, 2);
        assertEq(ls[1].price, 1 ether);
        _repay(a);
        _default(b);
        assertFalse(debt.getListing(a).active);
        assertFalse(debt.getListing(b).active);
        (ids,,) = debt.activeListings();
        assertEq(ids.length, 0);
    }

    function test_buy_whilePaused() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.listForSale(id, 1 ether);
        debt.setPaused(true);
        vm.prank(carol);
        vm.expectRevert(ChogDebt.IsPaused.selector);
        debt.buyDebt(id, 3, 1 ether);
    }

    // ================================================================ guarantors

    function test_vouch_honoured() public {
        uint256 id = _active(0);
        vm.expectEmit(true, true, false, true);
        emit ChogDebt.Vouched(id, 3, 25 ether);
        vm.prank(carol);
        debt.vouch(id, 3, 25 ether);
        assertEq(token.balanceOf(address(debt)), 25 ether);
        ChogDebt.Guarantee memory g = debt.getGuarantee(id);
        assertEq(g.guarantorId, 3);
        assertTrue(g.active);
        assertEq(debt.vouchesOf(3)[0], id);

        _repay(id);
        assertEq(token.balanceOf(carol), 1000 ether, "stake returned");
        ChogDebt.GuarantorRep memory r = debt.guarantorRepOf(3);
        assertEq(r.vouches, 1);
        assertEq(r.honoured, 1);
        assertEq(debt.trustScore(3), 52);
        assertFalse(debt.getGuarantee(id).active);
    }

    function test_vouch_defaulted_penaltyAndStakeToCreditor() public {
        uint256 id = _active(0);
        vm.prank(carol);
        debt.vouch(id, 3, 25 ether);
        vm.prank(alice);
        debt.callIn(id, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.expectEmit(true, true, false, true);
        emit ChogDebt.VouchSettled(id, 3, false, 25 ether, alice);
        debt.markDefault(id);
        assertEq(token.balanceOf(alice), 1025 ether);
        assertEq(debt.guarantorRepOf(3).failed, 1);
        assertEq(debt.trustScore(3), 35);
        assertFalse(debt.reputationOf(3).deadbeat, "guarantor isn't the deadbeat");
    }

    function test_vouch_stakeGoesToCurrentCreditorAfterSale() public {
        uint256 id = _active(0);
        vm.prank(dave);
        debt.vouch(id, 4, 5 ether);
        vm.prank(alice);
        debt.listForSale(id, 1 ether);
        vm.prank(carol);
        debt.buyDebt(id, 3, 1 ether);
        _default(id);
        assertEq(token.balanceOf(carol), 1000 ether - 1 ether + 5 ether);
    }

    function test_vouch_zeroStake() public {
        uint256 id = _active(0);
        vm.prank(carol);
        debt.vouch(id, 3, 0);
        _default(id);
        assertEq(debt.guarantorRepOf(3).failed, 1);
        assertEq(token.balanceOf(address(debt)), 0);
    }

    function test_vouch_onPending_thenCancelRefunds() public {
        vm.prank(alice);
        uint256 id = debt.createIOU(1, 2, "x", 0);
        vm.prank(carol);
        debt.vouch(id, 3, 10 ether);
        vm.prank(bob);
        debt.cancel(id);
        assertEq(token.balanceOf(carol), 1000 ether);
        assertFalse(debt.getGuarantee(id).active);
    }

    function test_withdrawVouch_onlyWhilePending() public {
        vm.prank(alice);
        uint256 id = debt.createIOU(1, 2, "x", 0);
        vm.prank(carol);
        debt.vouch(id, 3, 10 ether);
        vm.prank(rando);
        vm.expectRevert();
        debt.withdrawVouch(id);
        vm.prank(carol);
        debt.withdrawVouch(id);
        assertEq(token.balanceOf(carol), 1000 ether);
        assertEq(debt.guarantorRepOf(3).vouches, 0);

        vm.prank(carol);
        debt.vouch(id, 3, 10 ether);
        vm.prank(bob);
        debt.accept(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.WrongStatus.selector, ChogDebt.Status.Active));
        debt.withdrawVouch(id);
    }

    function test_vouch_guards() public {
        uint256 id = _active(0);
        vm.prank(bob);
        vm.expectRevert(ChogDebt.BadGuarantor.selector);
        debt.vouch(id, 2, 0);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.BadGuarantor.selector);
        debt.vouch(id, 1, 0);
        nft.mint(bob, 9);
        vm.prank(bob);
        vm.expectRevert(ChogDebt.BadGuarantor.selector);
        debt.vouch(id, 9, 0);
        nft.mint(alice, 10);
        vm.prank(alice);
        vm.expectRevert(ChogDebt.BadGuarantor.selector);
        debt.vouch(id, 10, 0);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.NotChogOwner.selector, 4));
        debt.vouch(id, 4, 0);
        vm.prank(carol);
        debt.vouch(id, 3, 0);
        vm.prank(dave);
        vm.expectRevert(ChogDebt.AlreadyVouched.selector);
        debt.vouch(id, 4, 0);
    }

    function test_vouch_closedIouReverts() public {
        uint256 id = _active(0);
        _repay(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(ChogDebt.WrongStatus.selector, ChogDebt.Status.Repaid));
        debt.vouch(id, 3, 0);
    }

    function test_vouch_tokenDisabled() public {
        vm.prank(alice);
        uint256 id = noToken.createIOU(1, 2, "x", 0);
        vm.prank(carol);
        vm.expectRevert(ChogDebt.TokenDisabled.selector);
        noToken.vouch(id, 3, 1);
        vm.prank(carol);
        noToken.vouch(id, 3, 0);
    }

    function test_guarantorRoleTravelsWithNft() public {
        uint256 id = _active(0);
        vm.prank(carol);
        debt.vouch(id, 3, 10 ether);
        vm.prank(carol);
        nft.transferFrom(carol, rando, 3);
        _repay(id);
        assertEq(token.balanceOf(rando), 10 ether, "stake back to current guarantor holder");
    }

    // ================================================================ streaks

    function test_streak_reliableAndLegend() public {
        for (uint256 i = 1; i <= 10; i++) {
            uint256 id = _active(0);
            if (i == 3) {
                vm.expectEmit(true, false, false, true);
                emit ChogDebt.BadgeEarned(2, debt.BADGE_RELIABLE());
            }
            if (i == 10) {
                vm.expectEmit(true, false, false, true);
                emit ChogDebt.BadgeEarned(2, debt.BADGE_LEGEND());
            }
            _repay(id);
            if (i == 2) {
                (uint8 t,) = debt.streakTier(2);
                assertEq(t, 0);
            }
            if (i == 3) {
                (uint8 t, string memory n) = debt.streakTier(2);
                assertEq(t, 1);
                assertEq(n, "Reliable");
                assertTrue(debt.hasBadge(2, 1));
            }
        }
        ChogDebt.Streak memory s = debt.streakOf(2);
        assertEq(s.current, 10);
        assertEq(s.best, 10);
        (uint8 tier, string memory name) = debt.streakTier(2);
        assertEq(tier, 2);
        assertEq(name, "Legend");
    }

    function test_streak_calledInButOnTimeCounts() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 days);
        vm.warp(block.timestamp + 1 days);
        _repay(id);
        assertEq(debt.streakOf(2).current, 1);
    }

    function test_streak_lateRepayResets() public {
        _repay(_active(0));
        _repay(_active(0));
        uint256 id = _active(0);
        vm.prank(alice);
        debt.callIn(id, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        _repay(id);
        ChogDebt.Streak memory s = debt.streakOf(2);
        assertEq(s.current, 0);
        assertEq(s.best, 2);
    }

    function test_streak_defaultResets_badgeKept() public {
        for (uint256 i; i < 3; i++) _repay(_active(0));
        assertEq(debt.trustScore(2), 50 + 24 + 5);
        _default(_active(0));
        ChogDebt.Streak memory s = debt.streakOf(2);
        assertEq(s.current, 0);
        assertEq(s.best, 3);
        assertTrue(debt.hasBadge(2, 1), "earned badges stay");
    }

    // ================================================================ leaderboard / report views

    function test_participants_and_report() public {
        uint256 a = _active(0);
        vm.prank(carol);
        debt.vouch(a, 3, 0);
        _repay(a);
        uint256 b = _active(0);
        _default(b);
        assertEq(debt.participantCount(), 3);
        (uint256[] memory ids, uint256[] memory scores, bool[] memory dead, uint32[] memory defs) = debt.participants(0, 10);
        assertEq(ids.length, 3);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
        assertEq(ids[2], 3);
        assertTrue(dead[1]);
        assertEq(defs[1], 1);
        assertEq(scores[0], debt.trustScore(1));
        (ids,,,) = debt.participants(2, 10);
        assertEq(ids.length, 1);
        (ids,,,) = debt.participants(5, 10);
        assertEq(ids.length, 0);

        (uint256 score, ChogDebt.Reputation memory r, ChogDebt.GuarantorRep memory g, ChogDebt.Streak memory s, uint256 n) =
            debt.creditReport(2);
        assertEq(score, debt.trustScore(2));
        assertEq(r.repaid, 1);
        assertEq(r.defaulted, 1);
        assertEq(g.vouches, 0);
        assertEq(s.best, 1);
        assertEq(n, 2);
    }

    function test_participants_buyerAdded() public {
        uint256 id = _active(0);
        vm.prank(alice);
        debt.listForSale(id, 1);
        vm.prank(dave);
        debt.buyDebt(id, 4, 1);
        assertEq(debt.participantCount(), 3);
    }
}
