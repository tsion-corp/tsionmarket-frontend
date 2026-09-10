import { SUPPORT_EMAIL } from "@/lib/brand";
import type { PolicySection } from "@/components/ui/legal-document";

// The terms of service text.
//
// Kept out of the page component so the document reads as a document and can
// be reviewed as one. Every claim here is meant to match what the platform
// actually does: the wallet really is non custodial, the games really do pay
// out the way described, and the fees named are the ones the code charges.
// If a product changes, this file changes with it.

export const LAST_UPDATED = "10 September 2026";
// One inbox for the whole product; this page must never name another.
export { SUPPORT_EMAIL };

export const SECTIONS: PolicySection[] = [
  {
    id: "about-these-terms",
    title: "About these terms",
    body: [
      "These are the terms on which you use Ark. Ark is a platform for global markets. Through it you can hold and move crypto, trade spot markets, buy memecoins, trade perpetual futures, buy tokenised real world assets, take positions in prediction markets, play games in Arkade, earn and convert Kash+ rewards, move money between a bank account and your wallet, and take part in Market Square, our social and streaming layer.",
      "By creating an account or using any part of Ark you agree to these terms. If you do not agree, do not use Ark.",
      'In these terms, "we" and "us" mean Ark and the company operating it. "You" means anyone who uses the platform. "The platform" means the Ark website and web application at tsionark.com and the services reachable from them.',
      "Our Privacy Policy explains how we handle personal information. It is a separate document and it forms part of these terms.",
    ],
  },
  {
    id: "who-can-use-ark",
    title: "Who can use Ark",
    body: [
      "You must be at least 18 years old. If the law where you live sets a higher age for trading or for games played for money, that higher age applies to you.",
      "You must be able to enter a binding agreement, and you must not be barred from using services like ours by any law or sanctions list that applies to you.",
      "Some parts of Ark are not available in some countries. We apply these restrictions using your approximate location, and we may add or remove restrictions at any time as the law or our providers require. Using a VPN or other means to get around a restriction breaks these terms.",
      "You may only use Ark for yourself. You may not use it on behalf of someone else, and you may not let someone else use your account.",
    ],
  },
  {
    id: "your-account-and-wallet",
    title: "Your account and your wallet",
    body: [
      "When you sign up, our authentication provider, Privy, creates an embedded wallet for you. Ark is non custodial. The keys to that wallet are held in sharded form by Privy and transactions are signed on your side. We never hold your private keys or recovery phrase. We cannot move your assets, reverse a transaction, or recover your wallet for you.",
      "That has a direct consequence. If you lose access to the sign in method you chose, such as your email inbox or the device holding your passkey, you may lose access to your wallet and everything in it. Keep your sign in method safe.",
      "You are responsible for everything done through your account and wallet, whether or not you authorised it, unless it was caused by our own failure. Tell us straight away if you think your account has been compromised.",
      "We may suspend or close an account that breaks these terms, that we reasonably believe is being used for fraud, market abuse or money laundering, or that the law requires us to close. Because the wallet is yours, closing your Ark account does not take your assets from you. They remain in your wallet, and you can move them with any compatible wallet software.",
    ],
  },
  {
    id: "what-ark-does",
    title: "What Ark does and does not do",
    body: [
      "Ark is software. It shows you markets, builds the transactions you ask for, and sends them to the venues and blockchains that execute them. Every trade, transfer, wager and settlement is carried out by a third party or by a public blockchain, not by us.",
      {
        items: [
          "Spot and memecoin trades are routed through decentralised exchanges and aggregators on Base, Solana and other networks.",
          "Perpetual futures are executed on Hyperliquid.",
          "Prediction markets are provided by Polymarket and by our own on chain markets.",
          "Tokenised real world assets are issued by third parties and traded on decentralised exchanges.",
          "Local currency deposits and withdrawals are handled by our payment provider, Pouch Finance.",
          "Cross chain routing is handled by Dextopus and LI.FI.",
        ],
      },
      "We do not give investment, financial, legal or tax advice. Nothing on Ark is a recommendation to buy, sell or hold anything. Prices, charts, yields, odds and rankings are information, not advice, and they can be wrong or out of date.",
      "We are not a bank, broker, exchange or custodian, and your assets on Ark are not deposits. They are not insured or guaranteed by anyone.",
    ],
  },
  {
    id: "risks",
    title: "The risks",
    body: [
      "Crypto assets, leveraged trading, prediction markets and games played for money can lose you all of the money you put in, and in some cases more. Read this section as a plain statement of fact, not as a formality.",
      {
        items: [
          "Prices move fast and without warning. A position can be liquidated before you have a chance to act.",
          "Blockchain transactions are final. A transfer to the wrong address, the wrong network or the wrong token cannot be undone by us or by anyone.",
          "Smart contracts can contain bugs. A contract we or a third party rely on could fail, be exploited or be paused, and funds in it could be lost.",
          "Tokens can be scams. Memecoins in particular are often created to take money from buyers, and a listing on Ark is not a statement that a token is safe.",
          "Networks can stall or congest. A transaction can take longer than expected, fail, or cost more than the estimate.",
          "Third parties can fail. A venue, bridge, payment provider or oracle we rely on can go down, change its rules or stop serving your country.",
          "Laws can change. A service that is legal for you today may not be tomorrow.",
        ],
      },
      "Only put in money you can afford to lose. If you are not sure whether something on Ark is right for you, do not use it.",
    ],
  },
  {
    id: "games",
    title: "Games and wagers in Arkade",
    body: [
      "Arkade holds games where you can play for money, including Last Man Standing, chess, draughts, the lottery, Arkjet and Pilot Chicken. Playing for money is only available where it is legal for you, and only if you are old enough under the law that applies to you.",
      "Each game has its own rules, stakes and payout structure, shown before you play. When you place a stake you agree to those rules for that round. Stakes are held by a smart contract or by the game's own system until the round settles, and the result of a round is final once it has settled.",
      "Where a game pays out through a smart contract, the contract's split is the split. For example, in Last Man Standing the pot is divided between the last player standing, the player who opened the game, and the platform, in the proportions the contract sets at the time. Those proportions are shown in the game and can change between rounds.",
      "Some games are games of skill and some involve chance. Chess and draughts are rated, and we run fair play checks. Using an engine, another person, or any outside help in a game against another player breaks these terms. We may void a game, withhold a payout, or close your account if we find it, and we may report it.",
      "We may delay a payout while we check a result, and we may void a round that was affected by a bug, an outage or an attack. Where we void a round, we return stakes where we can.",
      "We do not promise that a game will always be available or that a round will always settle at once. Settlement depends on the blockchain and on our systems, both of which can be slow or fail.",
    ],
  },
  {
    id: "rewards",
    title: "Kash+ and rewards",
    body: [
      "Kash+ is a reward token you can earn by using Ark and buy or sell through the platform. It is not money, it is not a security, and it is not a promise of any value. Its price can go to zero.",
      "Rewards are calculated by rules we publish in the platform and may change. Reward rules include holding requirements, vesting periods, caps and budgets. We may withhold or reclaim rewards earned through abuse, such as wash trading, fake accounts or anything else designed to trigger rewards without real activity.",
      "Referral rewards, where offered, are paid only for real people who join and use Ark. Referring yourself, or paying people to sign up, breaks these terms.",
    ],
  },
  {
    id: "fees",
    title: "Fees",
    body: [
      "We charge fees on some services. The fee for any action is shown before you confirm it, or is set out in the rules of the game or feature you are using. Fees include a platform fee on some trades, a share of game pots and stakes, a builder fee on perpetual trades, and a fee on local currency transfers.",
      "Third parties charge their own fees. Network fees, exchange fees, bridge fees and payment provider fees are set by them, not by us, and can change without notice. Where we sponsor a network fee for you, that is a convenience we can withdraw at any time, not a promise.",
      "Fees already paid are not refunded, except where the law requires it or we choose to.",
    ],
  },
  {
    id: "your-conduct",
    title: "What you must not do",
    body: [
      "Using Ark comes with a short list of things you must not do. Doing any of them breaks these terms.",
      {
        items: [
          "Use Ark for anything illegal, including money laundering, financing terrorism, evading sanctions, or fraud.",
          "Manipulate a market, a game, a reward or a rating, whether by wash trading, collusion, bots, engines, exploits or any other means.",
          "Attack, probe, overload or interfere with the platform, its providers or the blockchains it uses.",
          "Copy, scrape, reverse engineer or resell the platform or its data.",
          "Impersonate anyone, or post content in Market Square that is illegal, abusive, sexual, threatening, deceptive, infringing or spam.",
          "Create more than one account, or share an account with someone else.",
          "Get around a country restriction or an age check.",
        ],
      },
    ],
  },
  {
    id: "market-square",
    title: "Content you post",
    body: [
      "Market Square lets you post, comment, message, stream and tip. What you post is yours. By posting it you give us permission to store it, show it to other users, and use it to run and promote the platform, for as long as it is on the platform.",
      "You are responsible for what you post. Do not post anything you do not have the right to post, and do not post anything that breaks the conduct rules above. We can remove content and suspend accounts that break them, with or without warning.",
      "Anything you post publicly can be seen, saved and shared by other people. Once it is out, we cannot get it back for you.",
      "Tips and gifts you send in Market Square are payments between you and the person receiving them. We do not hold them, and we cannot reverse them.",
    ],
  },
  {
    id: "our-content",
    title: "Our content and your licence",
    body: [
      "The platform, its design, its code, its name and its logos belong to us or to the people who license them to us. We give you a personal, non transferable licence to use the platform as these terms allow. Nothing else is granted.",
      "Market data, token information and prices shown on Ark come from third parties and are provided for your own use on the platform.",
    ],
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: [
      "We work to keep Ark available, but we do not promise that it will be. We may change, pause or remove any feature at any time, including because a provider, a network or the law requires it.",
      "We may put the platform into maintenance, and we may limit or stop some services while we investigate a problem. Where we can, we will tell you in advance.",
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: [
      "Ark is provided as it is and as it is available. To the fullest extent the law allows, we make no promises about the platform, including that it will be accurate, reliable, secure, uninterrupted or free of errors, or that it will meet your needs.",
      "We do not control the blockchains, venues, providers, tokens or markets you reach through Ark, and we are not responsible for what they do or fail to do.",
    ],
  },
  {
    id: "liability",
    title: "Limits on our liability",
    body: [
      "To the fullest extent the law allows, we are not liable to you for any loss of money, profit, data or opportunity, or for any indirect or consequential loss, arising from your use of Ark, however it arises.",
      "Where the law does not allow us to exclude our liability, our total liability to you for everything arising from your use of Ark in any twelve month period is limited to the fees you paid us in that period.",
      "Nothing in these terms limits liability that the law does not let us limit, including for fraud, or for death or personal injury caused by our negligence.",
    ],
  },
  {
    id: "indemnity",
    title: "Your responsibility to us",
    body: [
      "If someone brings a claim against us because of something you did on Ark, or because you broke these terms or the law, you agree to cover the costs and losses we suffer as a result, including reasonable legal fees.",
    ],
  },
  {
    id: "ending-this-agreement",
    title: "Ending this agreement",
    body: [
      "You can stop using Ark at any time. Because your wallet is yours, you can move your assets out at any time with any compatible wallet software.",
      "We can suspend or end your access at any time if you break these terms, if we reasonably suspect fraud or abuse, or if the law requires it. Where we can, we will tell you why.",
      "Ending this agreement does not undo transactions already made, does not cancel fees already charged, and does not end the parts of these terms that by their nature should continue, such as the sections on liability, indemnity and disputes.",
    ],
  },
  {
    id: "disputes",
    title: "Governing law and disputes",
    body: [
      "These terms are governed by the laws of the country in which the company operating Ark is incorporated, without regard to conflict of law rules. The courts of that country have exclusive jurisdiction over any dispute arising from these terms or from your use of Ark, except where the law of the country you live in gives you the right to bring a claim at home.",
      "Before starting a claim, write to us at the address at the end of these terms and give us thirty days to try to resolve it with you.",
      "If a court finds any part of these terms cannot be enforced, the rest still applies.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: [
      "We update these terms when the platform or the law changes. The date at the top always reflects the current version.",
      "If a change materially affects your rights, we will tell you before it takes effect, through the platform or by email. Continuing to use Ark after a change means you accept the updated terms.",
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    body: [
      `For any question about these terms, write to ${SUPPORT_EMAIL}.`,
      "Tell us what you are asking about and which account it concerns, and we will come back to you.",
    ],
  },
];
