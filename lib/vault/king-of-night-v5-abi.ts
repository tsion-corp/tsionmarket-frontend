// The King of Night v5 ABI, from the compiled artifact. Do not hand-type it.
//
// Source: apps/world-street-vault/src/chain/king-of-night-v5-abi.json in the
// backend monorepo. Regenerate with scripts/generate-vault-v5-abi.mjs; only
// `internalType` is dropped.
//
// What changed from v4, and why a transcription is dangerous here: games()
// gained `decimals` and `token` at positions 4 and 5, ahead of minWager and
// pot. Decoding v5 with the v4 tuple does not fail, it reports a pot of
// 7.49e29 wei. claim() became claim(address token), and totalActivePot,
// totalPendingWithdrawals and pendingWithdrawals all take the asset.

export const KING_OF_NIGHT_V5_ABI = [
  {
    type: "function",
    name: "claim",
    inputs: [
      {
        name: "token",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "games",
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
        name: "decimals",
        type: "uint8",
      },
      {
        name: "token",
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
      {
        name: "winnerBps",
        type: "uint16",
      },
      {
        name: "starterBps",
        type: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameStatus",
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
        name: "token",
        type: "address",
      },
      {
        name: "decimals",
        type: "uint8",
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
    type: "function",
    name: "getTimeRemaining",
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
    type: "function",
    name: "isActive",
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
    type: "function",
    name: "nextGameId",
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
    type: "function",
    name: "owner",
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
    type: "function",
    name: "paused",
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
    type: "function",
    name: "pendingWithdrawals",
    inputs: [
      {
        name: "",
        type: "address",
      },
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
    type: "function",
    name: "previewGameSplit",
    inputs: [
      {
        name: "gameId",
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
    type: "function",
    name: "previewSplit",
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
    type: "function",
    name: "settle",
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
    type: "function",
    name: "startGame",
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
    type: "function",
    name: "startGame",
    inputs: [
      {
        name: "token",
        type: "address",
      },
      {
        name: "stake",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "starterBps",
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
    type: "function",
    name: "timerDuration",
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
    type: "function",
    name: "tokenConfig",
    inputs: [
      {
        name: "token",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "enabled",
        type: "bool",
      },
      {
        name: "decimals",
        type: "uint8",
      },
      {
        name: "minStartStake",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalActivePot",
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
    type: "function",
    name: "totalPendingWithdrawals",
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
    type: "function",
    name: "treasury",
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
    type: "function",
    name: "treasuryBps",
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
    type: "function",
    name: "version",
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
    type: "function",
    name: "wager",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "wager",
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
    type: "function",
    name: "winnerBps",
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
    type: "event",
    name: "Claimed",
    inputs: [
      {
        name: "who",
        type: "address",
        indexed: true,
      },
      {
        name: "token",
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
    type: "event",
    name: "GameSettled",
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
        name: "token",
        type: "address",
        indexed: false,
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
    type: "event",
    name: "GameStarted",
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
        name: "token",
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
      {
        name: "decimals",
        type: "uint8",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PayoutFallback",
    inputs: [
      {
        name: "to",
        type: "address",
        indexed: true,
      },
      {
        name: "token",
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
    type: "event",
    name: "TokenSet",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
      },
      {
        name: "enabled",
        type: "bool",
        indexed: false,
      },
      {
        name: "decimals",
        type: "uint8",
        indexed: false,
      },
      {
        name: "minStartStake",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "WagerPlaced",
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
        name: "token",
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
    type: "error",
    name: "AddressEmptyCode",
    inputs: [
      {
        name: "target",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "AlreadySettled",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "DecimalsUnavailable",
    inputs: [
      {
        name: "token",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1967InvalidImplementation",
    inputs: [
      {
        name: "implementation",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1967NonPayable",
    inputs: [],
  },
  {
    type: "error",
    name: "FailedCall",
    inputs: [],
  },
  {
    type: "error",
    name: "GameNotFound",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "GameOver",
    inputs: [
      {
        name: "gameId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "GamePaused",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSplit",
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
    type: "error",
    name: "NativeValueMismatch",
    inputs: [
      {
        name: "sent",
        type: "uint256",
      },
      {
        name: "expected",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NativeValueNotAccepted",
    inputs: [
      {
        name: "sent",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: [],
  },
  {
    type: "error",
    name: "NotOwner",
    inputs: [
      {
        name: "caller",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotPendingOwner",
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
    type: "error",
    name: "NothingToClaim",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnershipCannotBeRenounced",
    inputs: [],
  },
  {
    type: "error",
    name: "Reentrant",
    inputs: [],
  },
  {
    type: "error",
    name: "StakeBelowMinimum",
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
    type: "error",
    name: "TimerNotExpired",
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
    type: "error",
    name: "TokenNotAllowed",
    inputs: [
      {
        name: "token",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "TransferFailed",
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
    type: "error",
    name: "UUPSUnauthorizedCallContext",
    inputs: [],
  },
  {
    type: "error",
    name: "UUPSUnsupportedProxiableUUID",
    inputs: [
      {
        name: "slot",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "WagerBelowGameMinimum",
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
    type: "error",
    name: "ZeroAddress",
    inputs: [
      {
        name: "field",
        type: "string",
      },
    ],
  },
  {
    type: "error",
    name: "ZeroValue",
    inputs: [
      {
        name: "field",
        type: "string",
      },
    ],
  },
] as const;
