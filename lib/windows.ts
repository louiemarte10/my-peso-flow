// Shared constants that both the server (lib/wallets.ts) and client components
// need. Kept separate because lib/wallets.ts is server-only.

/** How many days of recent history the spend-rate / runway figures look at. */
export const SPEND_WINDOW_DAYS = 30;

/** Human label for that window, e.g. "last 30 days". */
export const SPEND_WINDOW_LABEL = `last ${SPEND_WINDOW_DAYS} days`;
