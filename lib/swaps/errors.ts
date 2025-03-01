import errorCodesPrefix from '../constants/errorCodesPrefix';

const codesPrefix = errorCodesPrefix.SWAPS;
const errorCodes = {
  SWAP_CLIENT_NOT_FOUND: codesPrefix.concat('.1'),
  SWAP_CLIENT_NOT_CONFIGURED: codesPrefix.concat('.2'),
  PAYMENT_HASH_NOT_FOUND: codesPrefix.concat('.3'),
  FINAL_PAYMENT_ERROR: codesPrefix.concat('.4'),
  PAYMENT_REJECTED: codesPrefix.concat('.5'),
  INVALID_RESOLVE_REQUEST: codesPrefix.concat('.6'),
  SWAP_CLIENT_WALLET_NOT_CREATED: codesPrefix.concat('.7'),
  SWAP_CLIENT_MISCONFIGURED: codesPrefix.concat('.8'),
  UNKNOWN_PAYMENT_ERROR: codesPrefix.concat('.9'),
  PAYMENT_PENDING: codesPrefix.concat('.10'),
};

const errors = {
  SWAP_CLIENT_NOT_FOUND: (currency: string) => ({
    message: `swapClient for currency ${currency} not found`,
    code: errorCodes.SWAP_CLIENT_NOT_FOUND,
  }),
  SWAP_CLIENT_NOT_CONFIGURED: (currency: string) => ({
    message: `swapClient for currency ${currency} is not configured`,
    code: errorCodes.SWAP_CLIENT_NOT_CONFIGURED,
  }),
  PAYMENT_HASH_NOT_FOUND: (rHash: string) => ({
    message: `deal for rHash ${rHash} not found`,
    code: errorCodes.PAYMENT_HASH_NOT_FOUND,
  }),
  /** A payment error that indicates the payment has permanently failed. */
  FINAL_PAYMENT_ERROR: (message: string) => ({
    message,
    code: errorCodes.FINAL_PAYMENT_ERROR,
  }),
  PAYMENT_REJECTED: {
    message: 'the recipient rejected our payment for the swap',
    code: errorCodes.PAYMENT_REJECTED,
  },
  INVALID_RESOLVE_REQUEST: (rHash: string, errorMessage: string) => ({
    message: `invalid resolve request for rHash ${rHash}: ${errorMessage}`,
    code: errorCodes.INVALID_RESOLVE_REQUEST,
  }),
  SWAP_CLIENT_WALLET_NOT_CREATED: (message: string) => ({
    message,
    code: errorCodes.SWAP_CLIENT_WALLET_NOT_CREATED,
  }),
  SWAP_CLIENT_MISCONFIGURED: (clientLabels: string[]) => ({
    message: `the following swap clients are misconfigured: ${clientLabels.join(', ')}`,
    code: errorCodes.SWAP_CLIENT_MISCONFIGURED,
  }),
  /**
   * A payment error that indicates we are unsure of the current state of the
   * payment and it may have succeeded or may eventually succeed.
   */
  UNKNOWN_PAYMENT_ERROR: (message: string) => ({
    message,
    code: errorCodes.UNKNOWN_PAYMENT_ERROR,
  }),
  PAYMENT_PENDING: (rHash: string) => ({
    message: `a payment for ${rHash} is pending`,
    code: errorCodes.UNKNOWN_PAYMENT_ERROR,
  }),
};

export { errorCodes };
export default errors;
