import {
  extractFbUserId,
  normalizeFbProfileUrl,
  unwrapBrightDataPost,
} from './fb-dedup.util';

describe('fb-dedup.util', () => {
  it('normalizes Facebook profile URLs while preserving profile.php id query', () => {
    expect(
      normalizeFbProfileUrl('https://www.facebook.com/profile.php?id=61557660160997&__cft__[0]=AZX'),
    ).toBe('https://www.facebook.com/profile.php?id=61557660160997');

    expect(
      normalizeFbProfileUrl('https://www.facebook.com/groups/123/user/100089123456/?__tn__=%2CO'),
    ).toBe('https://www.facebook.com/groups/123/user/100089123456');
  });

  it('prefers numeric Facebook IDs over transient pfbid tokens', () => {
    expect(
      extractFbUserId([
        'pfbid02AbCdEf123',
        'https://www.facebook.com/people/John-Doe/61557660160997/?ref=1',
      ]),
    ).toBe('61557660160997');

    expect(
      extractFbUserId([
        'https://www.facebook.com/pfbid02XyZ987',
      ]),
    ).toBe('pfbid02XyZ987');

    expect(
      extractFbUserId([
        'https://www.facebook.com/agence.immotana/',
      ]),
    ).toBe('agence.immotana');
  });

  it('unwraps direct Bright Data post using user_username_raw, publisher_image_url, and profile_id', () => {
    const unwrapped = unwrapBrightDataPost({
      post_id: '2200112233',
      group_id: '888777',
      group_name: 'Immobilier Antananarivo',
      url: 'https://www.facebook.com/groups/888777/posts/2200112233/',
      user_username_raw: 'Miora Rasoa',
      profile_id: '61557660160997',
      user_url: 'https://www.facebook.com/pfbid02abc?__cft__[0]=test',
      header_image: 'https://scontent.xx/group_cover.jpg',
      avatar_image_url: 'https://scontent.xx/group_cover.jpg',
      publisher_image_url: 'https://scontent.xx/real_miora_avatar.jpg',
      content: 'Villa T4 Ivandry à louer. Contact 034 12 345 67.',
      attachments: [{ type: 'Photo', url: 'https://scontent.xx/house1.jpg' }],
    });

    expect(unwrapped).not.toBeNull();
    expect(unwrapped!.authorName).toBe('Miora Rasoa');
    expect(unwrapped!.authorFbId).toBe('61557660160997');
    expect(unwrapped!.authorAvatar).toBe('https://scontent.xx/real_miora_avatar.jpg');
    expect(unwrapped!.phones).toEqual(['0341234567']);
  });

  it('ignores group cover and default Facebook silhouette avatars and preserves original_post author on cross-user reshares', () => {
    const reshared = unwrapBrightDataPost({
      post_id: 'outer_999',
      group_id: '888777',
      group_name: 'Locations Tana',
      user_username_raw: 'Sharer Person',
      profile_id: '10001111111111',
      user_url: 'https://www.facebook.com/sharer.person',
      publisher_image_url: 'https://scontent.xx/sharer_avatar.jpg',
      original_post: {
        post_id: 'orig_777',
        post_url: 'https://www.facebook.com/orig/posts/orig_777',
        user_id: '61550000000001',
        user_name: 'Orig Owner',
        user_url: 'https://www.facebook.com/profile.php?id=61550000000001&__tn__=R',
        avatar_image_url: 'https://scontent.xx/116687302_959241714549285_n.jpg',
        content: 'Appartement T3 Ambatobe. Tel +261 32 99 888 77',
        attachments: [{ type: 'Photo', downloadable_url: 'https://scontent.xx/apt.jpg' }],
      },
    });

    expect(reshared).not.toBeNull();
    expect(reshared!.canonicalPostId).toBe('orig_777');
    expect(reshared!.authorName).toBe('Orig Owner');
    expect(reshared!.authorFbId).toBe('61550000000001');
    expect(reshared!.authorUrl).toBe('https://www.facebook.com/profile.php?id=61550000000001');
    // Must NOT attribute sharer avatar or default FB silhouette to original author
    expect(reshared!.authorAvatar).toBeNull();
  });

  it('uses clean Membre TranoGasy fallback for anonymous group posts', () => {
    const anon = unwrapBrightDataPost({
      post_id: 'anon_123',
      group_id: '555666',
      user_username_raw: null,
      publisher_image_url: null,
      content: 'Maison F3 à vendre 038 11 222 33',
      attachments: [{ type: 'Photo', url: 'https://scontent.xx/m1.jpg' }],
    });

    expect(anon).not.toBeNull();
    expect(anon!.authorName).toBe('Membre TranoGasy');
    expect(anon!.authorFbId).toBeNull();
    expect(anon!.authorAvatar).toBeNull();
  });
});
