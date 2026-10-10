// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Owner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ChogDebt
/// @notice Favours between Chog holders, written down as IOUs that live on the Chog NFT itself.
///         Everything is keyed to Chog token IDs, not wallets. Sell the Chog, and its debts,
///         its trust score and any deadbeat mark go with it.
contract ChogDebt {
    // ---------------------------------------------------------------- types

    enum Status {
        None,
        Pending, // creditor wrote it, debtor hasn't accepted yet
        Active, // debtor accepted, the favour is owed
        CalledIn, // creditor wants it back, the clock is ticking
        Repaid, // debtor kept their word
        Defaulted, // deadline passed, debtor didn't pay up
        Cancelled // creditor withdrew it, or debtor rejected it, before acceptance
    }

    struct IOU {
        uint256 creditorId; // the Chog that did the favour
        uint256 debtorId; // the Chog that owes it
        uint128 chogAmount; // optional $CHOG escrowed by the debtor on accept (0 = pure favour)
        uint64 createdAt;
        uint64 deadline; // set when called in
        Status status;
        string memo;
    }

    struct Reputation {
        uint32 favoursGiven; // accepted IOUs where this Chog was the creditor
        uint32 favoursReceived; // accepted IOUs where this Chog was the debtor
        uint32 repaid; // debts this Chog repaid
        uint32 repaidAfterCall; // of those, how many after being called in
        uint32 defaulted; // debts this Chog defaulted on
        uint32 open; // debts this Chog currently owes (Active or CalledIn)
        uint32 redemption; // repayments since last default (3 clears the deadbeat mark)
        bool deadbeat;
    }

    struct Listing {
        uint128 price; // in $CHOG
        address seller; // holder of the creditor Chog when listed; listing goes stale if the Chog moves
        bool active;
    }

    struct Guarantee {
        uint256 guarantorId; // Chog vouching for the debtor
        uint128 stake; // optional $CHOG paid to the creditor if the IOU defaults
        bool active;
    }

    struct GuarantorRep {
        uint32 vouches; // guarantees posted
        uint32 honoured; // vouched IOUs that got repaid
        uint32 failed; // vouched IOUs that defaulted
    }

    struct Streak {
        uint32 current; // consecutive on-time repayments
        uint32 best;
        uint8 badges; // bitmask: BADGE_RELIABLE | BADGE_LEGEND (kept forever once earned)
    }

    // ---------------------------------------------------------------- constants

    uint256 public constant MAX_MEMO_LENGTH = 140;
    uint64 public constant MIN_CALL_PERIOD = 1 hours;
    uint64 public constant MAX_CALL_PERIOD = 30 days;
    uint32 public constant REDEMPTION_REPAYS = 3;
    uint32 public constant RELIABLE_STREAK = 3;
    uint32 public constant LEGEND_STREAK = 10;
    uint8 public constant BADGE_RELIABLE = 1;
    uint8 public constant BADGE_LEGEND = 2;

    // ---------------------------------------------------------------- storage

    IERC721Owner public immutable chog;
    IERC20Min public immutable chogToken; // address(0) disables $CHOG features

    address public owner;
    address public pendingOwner;
    bool public paused;

    uint256 public iouCount;
    mapping(uint256 => IOU) private _ious; // ids start at 1
    mapping(uint256 => Reputation) private _rep;
    mapping(uint256 => uint256[]) private _iousOf; // tokenId => IOU ids (as creditor or debtor)

    mapping(uint256 => Listing) private _listings; // IOU id => listing
    mapping(uint256 => Guarantee) private _guarantees; // IOU id => guarantee
    mapping(uint256 => GuarantorRep) private _gRep; // tokenId => guarantor record
    mapping(uint256 => Streak) private _streaks; // tokenId => streak
    mapping(uint256 => uint256[]) private _vouchesOf; // guarantor tokenId => IOU ids
    uint256[] private _participants; // every Chog that has touched the contract (for leaderboards)
    mapping(uint256 => bool) private _seen;

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event IOUCreated(uint256 indexed id, uint256 indexed creditorId, uint256 indexed debtorId, uint256 chogAmount, string memo);
    event IOUAccepted(uint256 indexed id, uint256 indexed debtorId, uint256 escrowed);
    event IOUCancelled(uint256 indexed id, uint256 indexed byTokenId);
    event IOUCalledIn(uint256 indexed id, uint256 indexed creditorId, uint64 deadline);
    event IOURepaid(uint256 indexed id, uint256 indexed debtorId, bool afterCallIn);
    event IOUDefaulted(uint256 indexed id, uint256 indexed debtorId, address indexed markedBy);
    event CollateralPaid(uint256 indexed id, address indexed to, uint256 amount);
    event DeadbeatMarked(uint256 indexed tokenId);
    event DeadbeatCleared(uint256 indexed tokenId);
    event IOUListed(uint256 indexed id, uint256 indexed creditorId, uint256 price);
    event IOUListingCancelled(uint256 indexed id);
    event IOUSold(uint256 indexed id, uint256 indexed fromCreditorId, uint256 indexed toCreditorId, uint256 price, address seller, address buyer);
    event Vouched(uint256 indexed id, uint256 indexed guarantorId, uint256 stake);
    event VouchWithdrawn(uint256 indexed id, uint256 indexed guarantorId);
    event VouchSettled(uint256 indexed id, uint256 indexed guarantorId, bool honoured, uint256 stake, address paidTo);
    event StreakUpdated(uint256 indexed tokenId, uint32 current, uint32 best);
    event BadgeEarned(uint256 indexed tokenId, uint8 badge);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(bool paused);

    // ---------------------------------------------------------------- errors

    error NotChogOwner(uint256 tokenId);
    error SameChog();
    error SameWallet();
    error BadMemo();
    error UnknownIOU();
    error WrongStatus(Status current);
    error BadPeriod();
    error DeadlineNotPassed();
    error TokenDisabled();
    error TransferFailed();
    error NotOwner();
    error NotPendingOwner();
    error IsPaused();
    error Reentrancy();
    error ZeroAddress();
    error NotListed();
    error ListingStale();
    error BadPrice();
    error BadBuyer();
    error AlreadyVouched();
    error BadGuarantor();

    // ---------------------------------------------------------------- modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address chogNft, address chogErc20) {
        if (chogNft == address(0)) revert ZeroAddress();
        chog = IERC721Owner(chogNft);
        chogToken = IERC20Min(chogErc20);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------- IOU lifecycle

    /// @notice Creditor's Chog records that debtor's Chog owes it a favour.
    function createIOU(uint256 creditorId, uint256 debtorId, string calldata memo, uint128 chogAmount)
        external
        whenNotPaused
        returns (uint256 id)
    {
        _onlyHolder(creditorId);
        if (creditorId == debtorId) revert SameChog();
        if (chog.ownerOf(debtorId) == msg.sender) revert SameWallet();
        uint256 len = bytes(memo).length;
        if (len == 0 || len > MAX_MEMO_LENGTH) revert BadMemo();
        if (chogAmount > 0 && address(chogToken) == address(0)) revert TokenDisabled();

        id = ++iouCount;
        _ious[id] = IOU({
            creditorId: creditorId,
            debtorId: debtorId,
            chogAmount: chogAmount,
            createdAt: uint64(block.timestamp),
            deadline: 0,
            status: Status.Pending,
            memo: memo
        });
        _iousOf[creditorId].push(id);
        _iousOf[debtorId].push(id);
        _touch(creditorId);
        _touch(debtorId);
        emit IOUCreated(id, creditorId, debtorId, chogAmount, memo);
    }

    /// @notice Debtor agrees they owe it. If the IOU carries $CHOG, it is escrowed now.
    function accept(uint256 id) external whenNotPaused nonReentrant {
        IOU storage iou = _get(id);
        _requireStatus(iou, Status.Pending);
        _onlyHolder(iou.debtorId);

        iou.status = Status.Active;
        _rep[iou.creditorId].favoursGiven++;
        Reputation storage d = _rep[iou.debtorId];
        d.favoursReceived++;
        d.open++;

        if (iou.chogAmount > 0) {
            if (!chogToken.transferFrom(msg.sender, address(this), iou.chogAmount)) revert TransferFailed();
        }
        emit IOUAccepted(id, iou.debtorId, iou.chogAmount);
    }

    /// @notice Creditor withdraws, or debtor rejects, an IOU that hasn't been accepted.
    function cancel(uint256 id) external nonReentrant {
        IOU storage iou = _get(id);
        _requireStatus(iou, Status.Pending);
        uint256 by;
        if (chog.ownerOf(iou.creditorId) == msg.sender) by = iou.creditorId;
        else if (chog.ownerOf(iou.debtorId) == msg.sender) by = iou.debtorId;
        else revert NotChogOwner(iou.debtorId);
        iou.status = Status.Cancelled;
        emit IOUCancelled(id, by);
        _refundGuarantee(id);
    }

    /// @notice Creditor calls the favour in. Debtor has `period` seconds to repay.
    function callIn(uint256 id, uint64 period) external whenNotPaused {
        IOU storage iou = _get(id);
        _requireStatus(iou, Status.Active);
        _onlyHolder(iou.creditorId);
        if (period < MIN_CALL_PERIOD || period > MAX_CALL_PERIOD) revert BadPeriod();
        uint64 deadline = uint64(block.timestamp) + period;
        iou.status = Status.CalledIn;
        iou.deadline = deadline;
        emit IOUCalledIn(id, iou.creditorId, deadline);
    }

    /// @notice Debtor marks the favour as returned. Any escrowed $CHOG goes to the creditor Chog's holder.
    ///         Allowed after the deadline too, as long as nobody has marked the default yet.
    function repay(uint256 id) external nonReentrant {
        IOU storage iou = _get(id);
        Status s = iou.status;
        if (s != Status.Active && s != Status.CalledIn) revert WrongStatus(s);
        _onlyHolder(iou.debtorId);

        iou.status = Status.Repaid;
        Reputation storage d = _rep[iou.debtorId];
        d.open--;
        d.repaid++;
        if (s == Status.CalledIn) d.repaidAfterCall++;
        if (d.deadbeat) {
            d.redemption++;
            if (d.redemption >= REDEMPTION_REPAYS) {
                d.deadbeat = false;
                d.redemption = 0;
                emit DeadbeatCleared(iou.debtorId);
            }
        }
        bool onTime = s == Status.Active || block.timestamp <= iou.deadline;
        _bumpStreak(iou.debtorId, onTime);
        emit IOURepaid(id, iou.debtorId, s == Status.CalledIn);
        _clearListing(id);
        _payCreditor(id, iou);
        _settleGuarantee(id, iou, true);
    }

    /// @notice Anyone can blow the whistle once a called-in IOU passes its deadline.
    function markDefault(uint256 id) external nonReentrant {
        IOU storage iou = _get(id);
        _requireStatus(iou, Status.CalledIn);
        if (block.timestamp <= iou.deadline) revert DeadlineNotPassed();

        iou.status = Status.Defaulted;
        Reputation storage d = _rep[iou.debtorId];
        d.open--;
        d.defaulted++;
        d.redemption = 0;
        if (!d.deadbeat) {
            d.deadbeat = true;
            emit DeadbeatMarked(iou.debtorId);
        }
        _bumpStreak(iou.debtorId, false);
        emit IOUDefaulted(id, iou.debtorId, msg.sender);
        _clearListing(id);
        _payCreditor(id, iou);
        _settleGuarantee(id, iou, false);
    }

    // ---------------------------------------------------------------- debt trading

    /// @notice Put an accepted IOU up for sale. Whoever buys it becomes the creditor Chog,
    ///         including the right to call it in and any collateral at the end.
    function listForSale(uint256 id, uint128 price) external whenNotPaused {
        if (address(chogToken) == address(0)) revert TokenDisabled();
        IOU storage iou = _get(id);
        Status s = iou.status;
        if (s != Status.Active && s != Status.CalledIn) revert WrongStatus(s);
        _onlyHolder(iou.creditorId);
        if (price == 0) revert BadPrice();
        _listings[id] = Listing({price: price, seller: msg.sender, active: true});
        emit IOUListed(id, iou.creditorId, price);
    }

    function cancelListing(uint256 id) external {
        IOU storage iou = _get(id);
        Listing storage l = _listings[id];
        if (!l.active) revert NotListed();
        // the lister, or whoever holds the creditor Chog now, can pull it
        if (msg.sender != l.seller) _onlyHolder(iou.creditorId);
        l.active = false;
        emit IOUListingCancelled(id);
    }

    /// @notice Buy a listed IOU with $CHOG. `maxPrice` guards against the seller re-pricing under you.
    function buyDebt(uint256 id, uint256 buyerChogId, uint256 maxPrice) external whenNotPaused nonReentrant {
        IOU storage iou = _get(id);
        Listing memory l = _listings[id];
        if (!l.active) revert NotListed();
        Status s = iou.status;
        if (s != Status.Active && s != Status.CalledIn) revert WrongStatus(s);
        if (chog.ownerOf(iou.creditorId) != l.seller) revert ListingStale();
        if (l.price > maxPrice) revert BadPrice();
        _onlyHolder(buyerChogId);
        if (
            buyerChogId == iou.debtorId || buyerChogId == iou.creditorId || msg.sender == l.seller
                || chog.ownerOf(iou.debtorId) == msg.sender
        ) revert BadBuyer();

        uint256 from = iou.creditorId;
        iou.creditorId = buyerChogId;
        delete _listings[id];
        _iousOf[buyerChogId].push(id);
        _touch(buyerChogId);
        emit IOUSold(id, from, buyerChogId, l.price, l.seller, msg.sender);
        if (!chogToken.transferFrom(msg.sender, l.seller, l.price)) revert TransferFailed();
    }

    // ---------------------------------------------------------------- guarantors

    /// @notice Vouch for the debtor on one IOU. Calling this is the guarantor holder agreeing to it.
    ///         If the IOU defaults the guarantor's trust takes a hit and any staked $CHOG goes to the creditor.
    function vouch(uint256 id, uint256 guarantorId, uint128 stake) external whenNotPaused nonReentrant {
        IOU storage iou = _get(id);
        Status s = iou.status;
        if (s != Status.Pending && s != Status.Active && s != Status.CalledIn) revert WrongStatus(s);
        if (_guarantees[id].active) revert AlreadyVouched();
        _onlyHolder(guarantorId);
        if (
            guarantorId == iou.debtorId || guarantorId == iou.creditorId || chog.ownerOf(iou.debtorId) == msg.sender
                || chog.ownerOf(iou.creditorId) == msg.sender
        ) revert BadGuarantor();
        if (stake > 0 && address(chogToken) == address(0)) revert TokenDisabled();

        _guarantees[id] = Guarantee({guarantorId: guarantorId, stake: stake, active: true});
        _gRep[guarantorId].vouches++;
        _vouchesOf[guarantorId].push(id);
        _touch(guarantorId);
        emit Vouched(id, guarantorId, stake);
        if (stake > 0) {
            if (!chogToken.transferFrom(msg.sender, address(this), stake)) revert TransferFailed();
        }
    }

    /// @notice A guarantor can back out only while the IOU is still pending.
    function withdrawVouch(uint256 id) external nonReentrant {
        IOU storage iou = _get(id);
        _requireStatus(iou, Status.Pending);
        Guarantee memory g = _guarantees[id];
        if (!g.active) revert BadGuarantor();
        _onlyHolder(g.guarantorId);
        _gRep[g.guarantorId].vouches--;
        emit VouchWithdrawn(id, g.guarantorId);
        _refundGuarantee(id);
    }

    // ---------------------------------------------------------------- views

    function getIOU(uint256 id) external view returns (IOU memory) {
        if (id == 0 || id > iouCount) revert UnknownIOU();
        return _ious[id];
    }

    function iouIdsOf(uint256 tokenId) external view returns (uint256[] memory) {
        return _iousOf[tokenId];
    }

    function iousOf(uint256 tokenId) external view returns (uint256[] memory ids, IOU[] memory list) {
        ids = _iousOf[tokenId];
        list = new IOU[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            list[i] = _ious[ids[i]];
        }
    }

    function reputationOf(uint256 tokenId) external view returns (Reputation memory) {
        return _rep[tokenId];
    }

    function getListing(uint256 id) external view returns (Listing memory) {
        return _listings[id];
    }

    /// @notice All IOUs currently for sale (stale listings, where the creditor Chog moved, are skipped).
    function activeListings() external view returns (uint256[] memory ids, IOU[] memory list, Listing[] memory listings) {
        uint256 n;
        uint256 count = iouCount;
        for (uint256 i = 1; i <= count; ++i) {
            if (_isLive(i)) n++;
        }
        ids = new uint256[](n);
        list = new IOU[](n);
        listings = new Listing[](n);
        uint256 k;
        for (uint256 i = 1; i <= count; ++i) {
            if (_isLive(i)) {
                ids[k] = i;
                list[k] = _ious[i];
                listings[k] = _listings[i];
                k++;
            }
        }
    }

    function getGuarantee(uint256 id) external view returns (Guarantee memory) {
        return _guarantees[id];
    }

    function guarantorRepOf(uint256 tokenId) external view returns (GuarantorRep memory) {
        return _gRep[tokenId];
    }

    function vouchesOf(uint256 tokenId) external view returns (uint256[] memory) {
        return _vouchesOf[tokenId];
    }

    function streakOf(uint256 tokenId) external view returns (Streak memory) {
        return _streaks[tokenId];
    }

    function hasBadge(uint256 tokenId, uint8 badge) external view returns (bool) {
        return _streaks[tokenId].badges & badge != 0;
    }

    /// @notice Highest streak badge ever earned: 0 none, 1 Reliable, 2 Legend.
    function streakTier(uint256 tokenId) external view returns (uint8 tier, string memory name) {
        uint8 b = _streaks[tokenId].badges;
        if (b & BADGE_LEGEND != 0) return (2, "Legend");
        if (b & BADGE_RELIABLE != 0) return (1, "Reliable");
        return (0, "");
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    /// @notice Paged list of Chogs that have used the contract, with their scores. Feeds the leaderboard.
    function participants(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, uint256[] memory scores, bool[] memory deadbeats, uint32[] memory defaults)
    {
        uint256 total = _participants.length;
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 n = end > offset ? end - offset : 0;
        ids = new uint256[](n);
        scores = new uint256[](n);
        deadbeats = new bool[](n);
        defaults = new uint32[](n);
        for (uint256 i; i < n; ++i) {
            uint256 t = _participants[offset + i];
            ids[i] = t;
            scores[i] = trustScore(t);
            deadbeats[i] = _rep[t].deadbeat;
            defaults[i] = _rep[t].defaulted;
        }
    }

    /// @notice Everything a credit report page needs in one call.
    function creditReport(uint256 tokenId)
        external
        view
        returns (uint256 score, Reputation memory rep, GuarantorRep memory gRep, Streak memory streak, uint256 iouTotal)
    {
        return (trustScore(tokenId), _rep[tokenId], _gRep[tokenId], _streaks[tokenId], _iousOf[tokenId].length);
    }

    /// @notice 0-100. Everyone starts at 50. Repaying and helping push it up, defaulting hurts a lot.
    function trustScore(uint256 tokenId) public view returns (uint256) {
        Reputation memory r = _rep[tokenId];
        GuarantorRep memory g = _gRep[tokenId];
        uint8 b = _streaks[tokenId].badges;
        int256 score = 50 + int256(uint256(r.repaid)) * 8 + int256(uint256(r.repaidAfterCall)) * 2
            + int256(uint256(r.favoursGiven)) * 3 - int256(uint256(r.defaulted)) * 25
            + int256(uint256(g.honoured)) * 2 - int256(uint256(g.failed)) * 15;
        if (b & BADGE_RELIABLE != 0) score += 5;
        if (b & BADGE_LEGEND != 0) score += 10;
        if (r.deadbeat) score -= 10;
        if (score < 0) return 0;
        if (score > 100) return 100;
        return uint256(score);
    }

    // ---------------------------------------------------------------- admin

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---------------------------------------------------------------- internal

    function _get(uint256 id) private view returns (IOU storage iou) {
        if (id == 0 || id > iouCount) revert UnknownIOU();
        iou = _ious[id];
    }

    function _requireStatus(IOU storage iou, Status want) private view {
        if (iou.status != want) revert WrongStatus(iou.status);
    }

    function _onlyHolder(uint256 tokenId) private view {
        if (chog.ownerOf(tokenId) != msg.sender) revert NotChogOwner(tokenId);
    }

    function _touch(uint256 tokenId) private {
        if (!_seen[tokenId]) {
            _seen[tokenId] = true;
            _participants.push(tokenId);
        }
    }

    function _isLive(uint256 id) private view returns (bool) {
        Listing memory l = _listings[id];
        if (!l.active) return false;
        Status s = _ious[id].status;
        if (s != Status.Active && s != Status.CalledIn) return false;
        return chog.ownerOf(_ious[id].creditorId) == l.seller;
    }

    function _clearListing(uint256 id) private {
        if (_listings[id].active) {
            delete _listings[id];
            emit IOUListingCancelled(id);
        }
    }

    function _bumpStreak(uint256 tokenId, bool onTime) private {
        Streak storage st = _streaks[tokenId];
        if (!onTime) {
            st.current = 0;
        } else {
            st.current++;
            if (st.current > st.best) st.best = st.current;
            if (st.current >= RELIABLE_STREAK && st.badges & BADGE_RELIABLE == 0) {
                st.badges |= BADGE_RELIABLE;
                emit BadgeEarned(tokenId, BADGE_RELIABLE);
            }
            if (st.current >= LEGEND_STREAK && st.badges & BADGE_LEGEND == 0) {
                st.badges |= BADGE_LEGEND;
                emit BadgeEarned(tokenId, BADGE_LEGEND);
            }
        }
        emit StreakUpdated(tokenId, st.current, st.best);
    }

    function _refundGuarantee(uint256 id) private {
        Guarantee memory g = _guarantees[id];
        if (!g.active) return;
        delete _guarantees[id];
        if (g.stake > 0) {
            address to = chog.ownerOf(g.guarantorId);
            if (!chogToken.transfer(to, g.stake)) revert TransferFailed();
        }
    }

    function _settleGuarantee(uint256 id, IOU storage iou, bool honoured) private {
        Guarantee memory g = _guarantees[id];
        if (!g.active) return;
        delete _guarantees[id];
        address to;
        if (honoured) {
            _gRep[g.guarantorId].honoured++;
            to = chog.ownerOf(g.guarantorId);
        } else {
            _gRep[g.guarantorId].failed++;
            to = chog.ownerOf(iou.creditorId);
        }
        emit VouchSettled(id, g.guarantorId, honoured, g.stake, to);
        if (g.stake > 0) {
            if (!chogToken.transfer(to, g.stake)) revert TransferFailed();
        }
    }

    function _payCreditor(uint256 id, IOU storage iou) private {
        uint256 amt = iou.chogAmount;
        if (amt == 0) return;
        address to = chog.ownerOf(iou.creditorId);
        if (!chogToken.transfer(to, amt)) revert TransferFailed();
        emit CollateralPaid(id, to, amt);
    }
}
