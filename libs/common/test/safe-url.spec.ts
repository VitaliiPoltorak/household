import { lookup } from 'dns/promises';
import { BadRequestException } from '@nestjs/common';
import { assertPublicUrl } from '../src/http/safe-url';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('assertPublicUrl', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-http(s) protocol', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects the literal hostname "localhost" without a DNS lookup', async () => {
    await expect(assertPublicUrl('http://localhost:3000/x')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects when DNS resolution fails (fail closed)', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      assertPublicUrl('http://does-not-exist.example/'),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([
    ['10.0.0.5', 4], // 10.0.0.0/8
    ['127.0.0.1', 4], // loopback
    ['169.254.169.254', 4], // cloud metadata endpoint
    ['172.20.1.1', 4], // 172.16.0.0/12
    ['192.168.1.1', 4], // 192.168.0.0/16
    ['100.64.0.1', 4], // CGNAT
    ['0.0.0.0', 4],
    ['::1', 6], // loopback
    ['fe80::1', 6], // link-local
    ['fd00::1', 6], // unique local
    ['::ffff:127.0.0.1', 6], // IPv4-mapped loopback
  ])(
    'rejects a URL resolving to %s (private/reserved)',
    async (address, family) => {
      mockLookup.mockResolvedValue([{ address, family }] as never);
      await expect(
        assertPublicUrl('http://attacker-controlled.example/'),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('accepts a URL resolving only to public addresses', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);
    await expect(
      assertPublicUrl('https://example.com/product'),
    ).resolves.toBeUndefined();
  });

  it('rejects if ANY resolved address is private, even if others are public', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(assertPublicUrl('https://example.com/')).rejects.toThrow(
      BadRequestException,
    );
  });
});
