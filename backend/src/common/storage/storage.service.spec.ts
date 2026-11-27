import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageDriver, StorageService } from './storage.service';

describe('StorageService (local driver)', () => {
  let dir: string;
  let storage: StorageService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'b2b-storage-'));
    storage = new StorageService(new LocalStorageDriver(dir));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('puts, reads and deletes a tenant file', async () => {
    await storage.put('org1', 'org1/invoice/a.pdf', Buffer.from('hello'));
    const chunks: Buffer[] = [];
    for await (const c of await storage.getStream(
      'org1',
      'org1/invoice/a.pdf',
    )) {
      chunks.push(c as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe('hello');

    await storage.delete('org1', 'org1/invoice/a.pdf');
    await expect(
      storage.getStream('org1', 'org1/invoice/a.pdf'),
    ).rejects.toThrow();
  });

  it("rejects another tenant's key and path traversal", async () => {
    await expect(
      storage.put('org1', 'org2/x.pdf', Buffer.from('x')),
    ).rejects.toThrow();
    await expect(
      storage.put('org1', 'org1/../org2/x.pdf', Buffer.from('x')),
    ).rejects.toThrow();
  });
});
