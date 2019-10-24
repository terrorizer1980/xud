import { toChecksumAddress } from '../../lib/utils/utils';

describe('toChecksumAddress', () => {
  test('converts to EIP55 address', () => {
    const orig = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359';
    const eip55 = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
    expect(toChecksumAddress(orig)).toEqual(eip55);
  });
});
