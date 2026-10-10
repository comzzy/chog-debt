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

    // ---------------------------------------------------------------- constants

    uint256 public constant MAX_MEMO_LENGTH = 140;
    uint64 public constant MIN_CALL_PERIOD = 1 hours;
    uint64 public constant MAX_CALL_PERIOD = 30 days;
    uint32 public constant REDEMPTION_REPAYS = 3;

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
    function cancel(uint256 id) external {
        IOU storage iou = _get(id);
        _requireStatus(iou, Status.Pending);
        uint256 by;
        if (chog.ownerOf(iou.creditorId) == msg.sender) by = iou.creditorId;
        else if (chog.ownerOf(iou.debtorId) == msg.sender) by = iou.debtorId;
        else revert NotChogOwner(iou.debtorId);
        iou.status = Status.Cancelled;
        emit IOUCancelled(id, by);
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
        emit IOURepaid(id, iou.debtorId, s == Status.CalledIn);
        _payCreditor(id, iou);
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
        emit IOUDefaulted(id, iou.debtorId, msg.sender);
        _payCreditor(id, iou);
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

    /// @notice 0-100. Everyone starts at 50. Repaying and helping push it up, defaulting hurts a lot.
    function trustScore(uint256 tokenId) public view returns (uint256) {
        Reputation memory r = _rep[tokenId];
        int256 score = 50 + int256(uint256(r.repaid)) * 8 + int256(uint256(r.repaidAfterCall)) * 2
            + int256(uint256(r.favoursGiven)) * 3 - int256(uint256(r.defaulted)) * 25;
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

    function _payCreditor(uint256 id, IOU storage iou) private {
        uint256 amt = iou.chogAmount;
        if (amt == 0) return;
        address to = chog.ownerOf(iou.creditorId);
        if (!chogToken.transfer(to, amt)) revert TransferFailed();
        emit CollateralPaid(id, to, amt);
    }
}
