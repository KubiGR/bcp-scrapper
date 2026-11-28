import { describe, expect, it } from 'vitest';
import { approvedMail, digestMail, newUserMail } from './admin-mail';

const SITE = 'https://logis.example.com';

describe('newUserMail', () => {
  it('says who is waiting, with a link to approve them', () => {
    const mail = newUserMail('ana@example.com', SITE);
    expect(mail.subject).toBe('Logis: ana@example.com is waiting for approval');
    expect(mail.text).toContain('ana@example.com signed in');
    expect(mail.text).toContain(`${SITE}/settings?tab=users`);
  });
});

describe('approvedMail', () => {
  it('tells someone they are in, with a link to the site', () => {
    const mail = approvedMail(SITE);
    expect(mail.subject).toContain('You’re in');
    expect(mail.text).toContain(SITE);
  });
});

describe('digestMail', () => {
  it('is nothing when there is nothing to do', () => {
    expect(digestMail({ waiting: [], unlinked: 0, outside: 0 }, SITE)).toBeNull();
  });

  it('lists what is left, each with a link to where it is done', () => {
    const mail = digestMail(
      { waiting: ['ana@example.com', 'bo@example.com'], unlinked: 5, outside: 1 },
      SITE,
    );
    expect(mail?.subject).toBe(
      'Logis: 2 waiting for approval, 5 detachment names to link, 1 detachment outside its faction',
    );
    expect(mail?.text).toContain('- ana@example.com');
    expect(mail?.text).toContain(`${SITE}/settings?tab=users`);
    expect(mail?.text).toContain(`${SITE}/settings?tab=detachments`);
    expect(mail?.text).toContain(`${SITE}/settings?tab=detachments&faction=all&section=outside`);
  });

  it('leaves out what is done', () => {
    const mail = digestMail({ waiting: [], unlinked: 1, outside: 0 }, SITE);
    expect(mail?.subject).toBe('Logis: 1 detachment name to link');
    expect(mail?.text).not.toContain('tab=users');
  });
});
