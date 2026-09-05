// The privacy policy text.
//
// Kept out of the page component so the policy reads as a document and can be
// reviewed as one. Every claim here is meant to match what the app actually
// does: the analytics identifier really is the wallet address, the masked
// screens really are the ones carrying MASK_ATTRIBUTE, and the providers listed
// are the ones our route handlers actually call. If a data flow changes, this
// file changes with it.

export const LAST_UPDATED = "5 September 2026";
export const SUPPORT_EMAIL = "tsionarksupport@gmail.com";

interface Bullets {
  items: string[];
}

export interface PolicySection {
  id: string;
  title: string;
  body: (string | Bullets)[];
}

export const SECTIONS: PolicySection[] = [
  {
    id: "who-we-are",
    title: "Who we are and what this covers",
    body: [
      "Ark is a platform for global markets. Through it you can hold and move crypto, trade spot and perpetual markets, buy tokenised real world assets, take positions in prediction markets, play games in Arkade, earn and convert Kash+ rewards, and take part in Market Square, our social and streaming layer.",
      "This policy explains what personal information we collect when you use Ark, why we collect it, who we share it with, and what you can ask us to do with it. It covers the Ark website and web application at tsionark.com and the services reachable from them.",
      "It does not cover the independent services you may reach through Ark. Public blockchains, the venues that execute your trades, and the payment providers that move your local currency each handle data on their own terms. Where that matters we say so, and we name them.",
      'In this policy, "we" and "us" mean Ark and the company operating it. "You" means anyone using the platform.',
    ],
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    body: [
      "We collect four kinds of information, and the amount depends on how far into the platform you go. Browsing the public site involves almost none of it. Withdrawing to a Nigerian bank account involves the most.",
      "Account and identity. When you create an account we use Privy, our authentication provider, to verify you. Depending on the method you choose, that means your email address, or the basic profile a Google or X sign in returns, or a passkey held on your own device. We receive an account identifier from Privy and the wallet addresses created for you.",
      "Financial and transactional. The wallet addresses associated with your account, the assets you hold, the trades, deposits, withdrawals, wagers and predictions you make, and the state those transactions reach. Some of this we store. Much of it we read from public blockchains at the moment you look at it, and never hold at all.",
      "Identity verification, where the law requires it. To deposit or withdraw Nigerian naira, our provider Pouch Finance must verify your identity. The fields depend on what they ask for at the time and typically include your full name, date of birth, a national identification number, an email address confirmed with a one time code, and your bank account details. We send these to Pouch to be checked. We do not use them for anything else.",
      "Usage and device. Pages you open, features you use, approximate location derived from your IP address, and standard technical details such as browser type, device type, language and time zone. Some of our services are restricted by country, and this is how that restriction is applied.",
      "Content you create. If you use Market Square, that includes your profile, posts, comments, messages, streams, and who you follow. Content you post publicly is visible to other people by design.",
    ],
  },
  {
    id: "wallets-and-blockchains",
    title: "Wallets and public blockchains",
    body: [
      "This section matters more than any other, because blockchains do not behave like ordinary databases and no privacy policy can make them.",
      "Ark is non custodial. Your embedded wallet is created and secured by Privy using key sharding, and transactions are signed with keys we cannot read. We never hold your private keys or recovery phrase, and we cannot move your assets or recover your wallet on your behalf.",
      "When you transact, the transaction is recorded on a public blockchain: Base, Solana, Polygon, Arbitrum, HyperEVM or another network depending on the asset. Those records are permanent, worldwide, and readable by anyone. They include your wallet address, the amounts, the counterparties and the time.",
      {
        items: [
          "We cannot delete, alter or hide anything already written to a blockchain. Nobody can.",
          "A wallet address is pseudonymous, not anonymous. Anyone who learns that an address is yours can see everything that address has ever done.",
          "If you ask us to delete your account, on chain records remain. We can only remove what we hold in our own systems.",
        ],
      },
      "We think this is worth stating plainly rather than burying, because it is the part of using a crypto platform that most often surprises people.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "How we use your information",
    body: [
      "We use personal information to run the platform, to keep it safe, and to make it better. In practice that means:",
      {
        items: [
          "Providing the service: creating your account and wallets, showing your balances and positions, routing and settling trades, processing deposits and withdrawals, and paying out Kash+ rewards.",
          "Meeting legal obligations: identity verification for local currency transfers, sanctions and fraud screening by our providers, and record keeping our regulators or theirs require.",
          "Keeping the platform safe: detecting fraud, abuse, and attempts to manipulate markets or rewards, and enforcing our terms.",
          "Support: answering you when you contact us, and reproducing a problem you have reported.",
          "Improving the product: understanding which features are used and where flows break, so we fix the right things.",
          "Communicating with you: transaction notices, security alerts, service updates, and marketing you have asked for and can stop at any time.",
        ],
      },
      "Where the law requires a legal basis, ours are: performing our contract with you, complying with legal obligations, our legitimate interests in operating and securing the platform, and your consent where we ask for it.",
      "We do not sell your personal information, and we do not share it with advertisers for their own purposes.",
    ],
  },
  {
    id: "analytics",
    title: "Analytics and session recording",
    body: [
      "We use two analytics tools, and one of them records what happens on your screen. That deserves a section of its own.",
      "Mixpanel tells us which features are used and where flows are abandoned. Microsoft Clarity records anonymised session replays and heatmaps, so we can see that a button was pressed four times and never worked rather than waiting for someone to report it.",
      "Both identify a session by your EVM wallet address, never by your email address. The address is already the identifier your on chain activity carries, so using it adds nothing that the chain does not already expose, and it keeps your email out of an analytics vendor.",
      "Screens that handle sensitive data are excluded from recording at the source. Identity verification, bank withdrawal, and bank transfer screens are marked so that Clarity records a placeholder in place of the values you type, and so Mixpanel's automatic capture skips them entirely. Your identity documents, bank details and account numbers are not in any replay.",
      "Analytics only runs when it is configured for the environment you are using, and a failure in it never affects the platform.",
    ],
  },
  {
    id: "sharing",
    title: "Who we share information with",
    body: [
      "We share personal information with the providers that make the platform work, and only what each of them needs.",
      {
        items: [
          "Privy, for authentication and embedded wallet infrastructure.",
          "Pouch Finance, for identity verification and Nigerian naira deposits and withdrawals.",
          "Alchemy, ZeroDev and Helius, for reading blockchain state and submitting sponsored transactions.",
          "Dextopus and LI.FI, for routing cross chain deposits, withdrawals and swaps.",
          "Hyperliquid, for perpetual futures execution.",
          "Polymarket, for prediction markets.",
          "Jupiter, for Solana swap routing.",
          "CoinGecko and GeckoTerminal, for market prices and token data.",
          "IPinfo, for the country lookup that applies our regional restrictions.",
          "Mixpanel and Microsoft Clarity, for analytics and session replay, as described above.",
          "SendGrid, for email we send you.",
          "LiveKit, for live video and audio in Market Square.",
          "Cloudinary, for images you upload.",
          "ElevenLabs, for generated speech in features that use it.",
        ],
      },
      "We also share information where we are legally required to: with regulators, law enforcement, or a court, on a valid request. And if our business is ever restructured, sold or merged, personal information may transfer as part of it. We would tell you before that changed how your information is handled.",
      "Anything you post publicly in Market Square is shared with everyone who can see it. That is the point of it, but it is worth remembering before you post.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    body: [
      "We use a small number of cookies and browser storage entries. The essential ones keep you signed in: Privy sets a session token that our servers check on every request that touches your account, and without it the platform cannot tell who you are.",
      "We also store preferences in your browser, such as your chosen language, whether balances are hidden, and which interface you last used. These stay on your device.",
      "Our analytics providers set their own identifiers, as described in the analytics section. You can block cookies in your browser, but blocking the essential ones will sign you out and stop most of the platform from working.",
    ],
  },
  {
    id: "transfers",
    title: "International transfers",
    body: [
      "Ark is used from many countries, and our providers operate in several more. Personal information is transferred to and processed in countries other than your own, including the United States and the European Union.",
      "Where a transfer leaves a jurisdiction with data transfer rules, we rely on the safeguards available to us, such as standard contractual clauses with the provider. Blockchain records, by their nature, are replicated globally and cannot be confined to one jurisdiction.",
    ],
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: [
      "We keep personal information for as long as you have an account, and after that for as long as we have a reason to.",
      {
        items: [
          "Account and profile information: while your account is open, and for a limited period afterwards so it can be restored if you return or dispute a closure.",
          "Identity verification records: for the period financial regulations require, which is usually several years after your last transaction, and is set by the rules our providers operate under rather than by us.",
          "Transaction records we hold: for as long as we need them for accounting, tax and dispute resolution.",
          "Analytics and session recordings: for the retention window of the provider, which is measured in months rather than years.",
          "On chain records: permanently, by the design of the blockchain, and outside our control.",
        ],
      },
    ],
  },
  {
    id: "security",
    title: "How we protect it",
    body: [
      "Credentials for the services we use are held on our servers and never sent to your browser. Every call to a payment provider, identity provider or market venue goes through our own backend, so no provider key is exposed to the client.",
      "Your wallet keys are sharded and held in secure hardware by Privy, not by us. Transactions are signed on your side.",
      "Access to production systems is limited to the people who need it, and traffic between you and us is encrypted in transit.",
      "No system is perfectly secure, and we will not claim otherwise. If a breach affects your personal information we will tell you and the relevant regulator as the law requires.",
    ],
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: [
      "Depending on where you live, you may have some or all of the following rights over the personal information we hold:",
      {
        items: [
          "Access: a copy of what we hold about you.",
          "Correction: fixing anything inaccurate.",
          "Deletion: removing what we hold, subject to the records we are legally required to keep.",
          "Restriction and objection: asking us to stop certain processing, including analytics and marketing.",
          "Portability: receiving your information in a machine readable form.",
          "Withdrawing consent: where we relied on your consent, at any time, without affecting what came before.",
        ],
      },
      "To exercise any of these, write to us at the address at the end of this policy. We will ask you to confirm you control the account, so that we do not hand your information to someone else, and we will respond within the time the applicable law allows.",
      "Two limits are worth stating honestly. We cannot delete anything recorded on a public blockchain. And we cannot delete identity verification records before the retention period financial regulation sets for them.",
      "If you are not satisfied with our response, you can complain to the data protection authority in your country.",
    ],
  },
  {
    id: "children",
    title: "Children",
    body: [
      "Ark is not for anyone under 18. We do not knowingly collect personal information from children. If you believe a child has created an account, tell us and we will close it and delete what we hold.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: [
      "We update this policy when what we do with personal information changes. The date at the top always reflects the current version.",
      "If a change materially affects your rights or how we use your information, we will tell you before it takes effect, through the platform or by email. Continuing to use Ark after a change means you accept the updated policy.",
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    body: [
      `For any question about this policy, about the information we hold, or to exercise any of the rights above, write to ${SUPPORT_EMAIL}.`,
      "Tell us what you are asking for and which account it concerns, and we will come back to you.",
    ],
  },
];
