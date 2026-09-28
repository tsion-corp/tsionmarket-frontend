import { z } from "zod";

const wei = z.string().regex(/^\d+$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const transaction = z.object({
  to: address,
  data: z.string().regex(/^0x[0-9a-fA-F]*$/),
  value: wei,
});

export const bnsAvailabilitySchema = z.object({ label: z.string(), available: z.boolean() });
export const bnsPriceSchema = z.object({ base: wei, premium: wei, total: wei });
// `expires` is a Unix timestamp in SECONDS as a decimal string (e.g.
// "1853506373"), not wei. Same integer-string shape, different meaning.
export const bnsLabelExpirySchema = z.object({
  label: z.string(),
  expires: z.string().regex(/^\d+$/),
});

export const bnsResolvedNameSchema = z.object({
  name: z.string(),
  store: z.string(),
  label: z.string(),
  node: z.string(),
  registry: address,
  owner: address,
  resolver: address.nullable(),
  address: address.nullable(),
});

export const bnsReverseNameSchema = z.object({
  address,
  name: z.string().nullable(),
  verified: z.boolean(),
  resolvedAddress: address.nullable(),
});

const registration = z.object({
  label: z.string(),
  owner: address,
  duration: wei,
  secret: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  resolver: address,
  data: z.array(z.string().regex(/^0x[0-9a-fA-F]*$/)),
  reverseRecord: z.number().int().min(0).max(3),
  referrer: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const bnsCommitmentSchema = z.object({
  registration,
  commitment: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  tx: transaction,
  timing: z.object({
    committedAt: z.string().datetime(),
    readyAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    minCommitmentAgeSeconds: z.number().int().nonnegative(),
    maxCommitmentAgeSeconds: z.number().int().positive(),
  }),
});

export const bnsTransactionSchema = z.object({ tx: transaction });

export const bnsStoreSchema = z.object({
  address,
  owner: address,
  controller: address,
  node: z.string(),
  expiry: wei,
  registry: address,
  registrar: address,
  registrarController: address,
  treasury: address,
  priceOracle: address,
  reverseRegistrar: address,
  defaultReverseRegistrar: address,
  live: z.boolean(),
  isSetup: z.boolean(),
});
