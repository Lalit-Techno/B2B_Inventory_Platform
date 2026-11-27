import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleMailDriver, MailService } from './mail.service';

describe('MailService (console driver)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'b2b-mail-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes the mail to disk so the link can be opened in dev', async () => {
    const mail = new MailService(new ConsoleMailDriver(dir));
    await mail.send({
      to: 'a@b.com',
      subject: 'Invite',
      text: 'https://x/invite/abc',
    });

    const [file] = await readdir(dir);
    const saved: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'));
    expect(saved).toMatchObject({ to: 'a@b.com', subject: 'Invite' });
  });
});
