// The King of Night vault ABI, from the compiled artifact. Do not hand-type it.
//
// Source: Sourcify exact match for the v4 implementation on Base,
// https://sourcify.dev/server/v2/contract/8453/0x0A2AE0D51ca7eC1b0bB18eee0FeBA64c0A5CdC07?fields=abi
// (the same artifact ships in the backend repo at
// apps/world-street-vault/src/chain/king-of-night-abi.json). Regenerate by
// fetching that URL and pasting `abi` here; only `internalType` is dropped.
//
// A transcribed event list is what broke the last version: GameStarted has
// five fields, and a four-field copy hashes to a topic that matches no log.

export const KING_OF_NIGHT_ABI = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "AddressEmptyCode",
    type: "error",
    inputs: [
      {
        name: "target",
        type: "address",
      },
    ],
  },
  {
    name: "AlreadySettled",
    type: "error",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
  },
  {
    name: "ERC1967InvalidImplementation",
    type: "error",
    inputs: [
      {
        name: "implementation",
        type: "address",
      },
    ],
  },
  {
    name: "ERC1967NonPayable",
    type: "error",
    inputs: [],
  },
  {
    name: "FailedCall",
    type: "error",
    inputs: [],
  },
  {
    name: "GameNotFound",
    type: "error",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
  },
  {
    name: "GameOver",
    type: "error",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
  },
  {
    name: "GamePaused",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidInitialization",
    type: "error",
    inputs: [],
  },
  {
    name: "InvalidSplit",
    type: "error",
    inputs: [
      {
        name: "winnerBps",
        type: "uint16",
      },
      {
        name: "starterBps",
        type: "uint16",
      },
    ],
  },
  {
    name: "NotInitializing",
    type: "error",
    inputs: [],
  },
  {
    name: "NotOwner",
    type: "error",
    inputs: [
      {
        name: "caller",
        type: "address",
      },
    ],
  },
  {
    name: "NotPendingOwner",
    type: "error",
    inputs: [
      {
        name: "caller",
        type: "address",
      },
      {
        name: "expected",
        type: "address",
      },
    ],
  },
  {
    name: "NothingToClaim",
    type: "error",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    name: "Reentrant",
    type: "error",
    inputs: [],
  },
  {
    name: "StakeBelowMinimum",
    type: "error",
    inputs: [
      {
        name: "sent",
        type: "uint256",
      },
      {
        name: "minimum",
        type: "uint256",
      },
    ],
  },
  {
    name: "TimerNotExpired",
    type: "error",
    inputs: [
      {
        name: "timestamp",
        type: "uint256",
      },
      {
        name: "endTime",
        type: "uint256",
      },
    ],
  },
  {
    name: "TransferFailed",
    type: "error",
    inputs: [
      {
        name: "to",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
  },
  {
    name: "UUPSUnauthorizedCallContext",
    type: "error",
    inputs: [],
  },
  {
    name: "UUPSUnsupportedProxiableUUID",
    type: "error",
    inputs: [
      {
        name: "slot",
        type: "bytes32",
      },
    ],
  },
  {
    name: "WagerBelowGameMinimum",
    type: "error",
    inputs: [
      {
        name: "sent",
        type: "uint256",
      },
      {
        name: "gameMinimum",
        type: "uint256",
      },
    ],
  },
  {
    name: "ZeroAddress",
    type: "error",
    inputs: [
      {
        name: "field",
        type: "string",
      },
    ],
  },
  {
    name: "ZeroValue",
    type: "error",
    inputs: [
      {
        name: "field",
        type: "string",
      },
    ],
  },
  {
    name: "Claimed",
    type: "event",
    inputs: [
      {
        name: "who",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "GameSettled",
    type: "event",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "winner",
        type: "address",
        indexed: true,
      },
      {
        name: "starter",
        type: "address",
        indexed: true,
      },
      {
        name: "pot",
        type: "uint256",
        indexed: false,
      },
      {
        name: "toWinner",
        type: "uint256",
        indexed: false,
      },
      {
        name: "toTreasury",
        type: "uint256",
        indexed: false,
      },
      {
        name: "toStarter",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "GameStarted",
    type: "event",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "starter",
        type: "address",
        indexed: true,
      },
      {
        name: "minWager",
        type: "uint256",
        indexed: false,
      },
      {
        name: "pot",
        type: "uint256",
        indexed: false,
      },
      {
        name: "endTime",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "Initialized",
    type: "event",
    inputs: [
      {
        name: "version",
        type: "uint64",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "MinStartStakeSet",
    type: "event",
    inputs: [
      {
        name: "oldValue",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "OwnerChanged",
    type: "event",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: "OwnershipTransferStarted",
    type: "event",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: "PayoutFallback",
    type: "event",
    inputs: [
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "SplitSet",
    type: "event",
    inputs: [
      {
        name: "winnerBps",
        type: "uint16",
        indexed: false,
      },
      {
        name: "starterBps",
        type: "uint16",
        indexed: false,
      },
      {
        name: "treasuryBps",
        type: "uint16",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "TimerDurationSet",
    type: "event",
    inputs: [
      {
        name: "oldValue",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "TreasurySet",
    type: "event",
    inputs: [
      {
        name: "previousTreasury",
        type: "address",
        indexed: true,
      },
      {
        name: "newTreasury",
        type: "address",
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: "Upgraded",
    type: "event",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: "WagerPlaced",
    type: "event",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
      },
      {
        name: "player",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newPot",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newEndTime",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: "UPGRADE_INTERFACE_VERSION",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "acceptOwnership",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "claim",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "emergencyWithdraw",
    type: "function",
    inputs: [
      {
        name: "to",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "games",
    type: "function",
    inputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "starter",
        type: "address",
      },
      {
        name: "endTime",
        type: "uint64",
      },
      {
        name: "settled",
        type: "bool",
      },
      {
        name: "king",
        type: "address",
      },
      {
        name: "minWager",
        type: "uint256",
      },
      {
        name: "pot",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "getGameStatus",
    type: "function",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "active",
        type: "bool",
      },
      {
        name: "pot",
        type: "uint256",
      },
      {
        name: "timeRemaining",
        type: "uint256",
      },
      {
        name: "king",
        type: "address",
      },
      {
        name: "starter",
        type: "address",
      },
      {
        name: "minWager",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "getTimeRemaining",
    type: "function",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "initialize",
    type: "function",
    inputs: [
      {
        name: "_minStartStake",
        type: "uint256",
      },
      {
        name: "_timerDuration",
        type: "uint256",
      },
      {
        name: "_owner",
        type: "address",
      },
      {
        name: "_treasury",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "isActive",
    type: "function",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "minStartStake",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "nextGameId",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "owner",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "pauseGame",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "paused",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "pendingOwner",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "pendingWithdrawals",
    type: "function",
    inputs: [
      {
        name: "",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "previewSplit",
    type: "function",
    inputs: [
      {
        name: "pot",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "toWinner",
        type: "uint256",
      },
      {
        name: "toTreasury",
        type: "uint256",
      },
      {
        name: "toStarter",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "proxiableUUID",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "resumeGame",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setMinStartStake",
    type: "function",
    inputs: [
      {
        name: "_minStartStake",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setSplit",
    type: "function",
    inputs: [
      {
        name: "_winnerBps",
        type: "uint16",
      },
      {
        name: "_starterBps",
        type: "uint16",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setTimerDuration",
    type: "function",
    inputs: [
      {
        name: "_timerDuration",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setTreasury",
    type: "function",
    inputs: [
      {
        name: "_treasury",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "settle",
    type: "function",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "startGame",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    name: "starterBps",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "timerDuration",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "totalActivePot",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "totalPendingWithdrawals",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "transferOwnership",
    type: "function",
    inputs: [
      {
        name: "newOwner",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "treasury",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "treasuryBps",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    name: "upgradeToAndCall",
    type: "function",
    inputs: [
      {
        name: "newImplementation",
        type: "address",
      },
      {
        name: "data",
        type: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    name: "version",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "pure",
  },
  {
    name: "wager",
    type: "function",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    name: "winnerBps",
    type: "function",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
      },
    ],
    stateMutability: "view",
  },
] as const;
