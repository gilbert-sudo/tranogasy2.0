import { sanitizeOwnerForViewer, sanitizePropertyForViewer } from './property-sanitizer.util';

describe('property-sanitizer.util', () => {
  const shadowOwner = {
    _id: '507f1f77bcf86cd799439011',
    username: 'Ravo Rakoto',
    avatar: 'https://storage.googleapis.com/bucket/fb-avatars/123.jpg',
    role: 'user',
    password: 'hashed-secret-password',
    backUpCode: '123456',
    origin: 'facebook_scraper',
    isShadowAccount: true,
    fbUserId: '61557660160997',
    fbProfileUrl: 'https://www.facebook.com/profile.php?id=61557660160997',
    mergedIntoUserId: null,
  };

  const scrapedProperty = {
    _id: '660f1f77bcf86cd799439022',
    title: 'Villa Moderne Ivandry',
    origin: 'facebook_scraper',
    claimStatus: 'unclaimed',
    claimedBy: null,
    claimedAt: null,
    owner: shadowOwner,
    sources: {
      fbUserId: '61557660160997',
      username: 'Ravo Rakoto',
      avatar: 'https://storage.googleapis.com/bucket/fb-avatars/123.jpg',
      link: 'https://www.facebook.com/profile.php?id=61557660160997',
      postId: '1234567890',
      postUrl: 'https://www.facebook.com/groups/999/posts/1234567890/',
      groupId: '999',
    },
  };

  it('strips all scraping & audit metadata for public viewers', () => {
    const publicView = sanitizePropertyForViewer(scrapedProperty, false);

    expect(publicView.origin).toBeUndefined();
    expect(publicView.claimStatus).toBeUndefined();
    expect(publicView.claimedBy).toBeUndefined();
    expect(publicView.claimedAt).toBeUndefined();
    expect(publicView.sources).toBeUndefined();

    expect(publicView.owner).toMatchObject({
      _id: shadowOwner._id,
      username: 'Ravo Rakoto',
      avatar: shadowOwner.avatar,
      role: 'user',
    });
    expect(publicView.owner.password).toBeUndefined();
    expect(publicView.owner.backUpCode).toBeUndefined();
    expect(publicView.owner.isShadowAccount).toBeUndefined();
    expect(publicView.owner.origin).toBeUndefined();
    expect(publicView.owner.fbUserId).toBeUndefined();
    expect(publicView.owner.fbProfileUrl).toBeUndefined();
    expect(publicView.owner.mergedIntoUserId).toBeUndefined();
  });

  it('preserves origin, claimStatus, and FB links for admins while still omitting credentials', () => {
    const adminView = sanitizePropertyForViewer(scrapedProperty, true);

    expect(adminView.origin).toBe('facebook_scraper');
    expect(adminView.claimStatus).toBe('unclaimed');
    expect(adminView.sources.link).toBe('https://www.facebook.com/profile.php?id=61557660160997');
    expect(adminView.sources.fbUserId).toBe('61557660160997');
    expect(adminView.owner.isShadowAccount).toBe(true);
    expect(adminView.owner.fbUserId).toBe('61557660160997');
    expect(adminView.owner.password).toBeUndefined();
    expect(adminView.owner.backUpCode).toBeUndefined();
  });

  it('sanitizes legacy admin-curated sources without leaking external Facebook URLs', () => {
    const legacyAdminProp = {
      _id: '660f1f77bcf86cd799439033',
      origin: 'admin_manual',
      claimStatus: 'unclaimed',
      owner: {
        _id: 'admin1',
        username: 'Admin',
        role: 'admin',
        password: 'hash',
      },
      sources: {
        username: 'Agence Tana',
        avatar: 'https://storage.googleapis.com/bucket/a.jpg',
        link: 'https://www.facebook.com/agence.tana',
        postId: '9876',
        postUrl: 'https://www.facebook.com/groups/1/posts/9876',
      },
    };

    const publicLegacy = sanitizePropertyForViewer(legacyAdminProp, false);
    expect(publicLegacy.origin).toBeUndefined();
    expect(publicLegacy.sources).toEqual({
      username: 'Agence Tana',
      avatar: 'https://storage.googleapis.com/bucket/a.jpg',
    });
    expect(sanitizeOwnerForViewer(legacyAdminProp.owner, false).password).toBeUndefined();
  });
});
