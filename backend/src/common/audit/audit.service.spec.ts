import { Types } from 'mongoose';
import { redact } from './audit.service';

describe('audit redact', () => {
  it('hides passwords, tokens, hashes and account numbers at any depth', () => {
    const out = redact({
      email: 'a@b.com',
      passwordHash: '$2a$12$abc',
      nested: {
        refreshToken: 'x',
        accountNumber: '1234567890',
        bankAccountNo: '99',
        keep: 1,
      },
      list: [{ newPassword: 'p', ok: true }],
      authorization: 'Bearer z',
    });
    expect(out).toEqual({
      email: 'a@b.com',
      passwordHash: '[redacted]',
      nested: {
        refreshToken: '[redacted]',
        accountNumber: '[redacted]',
        bankAccountNo: '[redacted]',
        keep: 1,
      },
      list: [{ newPassword: '[redacted]', ok: true }],
      authorization: '[redacted]',
    });
  });

  it('turns ids and dates into plain strings and survives null', () => {
    const id = new Types.ObjectId();
    expect(redact({ id, at: new Date('2026-11-25T00:00:00Z') })).toEqual({
      id: id.toString(),
      at: '2026-11-25T00:00:00.000Z',
    });
    expect(redact(null)).toBeNull();
  });
});
