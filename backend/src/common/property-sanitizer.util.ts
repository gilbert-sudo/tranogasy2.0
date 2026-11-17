/**
 * Strips internal scraping & claim-audit metadata from public responses so scraped
 * listings appear indistinguishable from organic TranoGasy user posts, while
 * preserving full traceability for authenticated Admin inspection endpoints.
 */
export function sanitizeOwnerForViewer(owner: any, isAdmin = false): any {
  if (!owner || typeof owner !== 'object') return owner;
  const copy = { ...owner };
  delete copy.password;
  delete copy.backUpCode;

  if (!isAdmin) {
    delete copy.isShadowAccount;
    delete copy.origin;
    delete copy.fbUserId;
    delete copy.fbProfileUrl;
    delete copy.mergedIntoUserId;
  }
  return copy;
}

/**
 * Scrub Malagasy phone numbers, WhatsApp/Facebook links, and email addresses
 * from public text when a property's contact access is locked.
 */
export function redactContactsFromText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return text || '';
  return text
    // Malagasy phone numbers (with or without +261 / 00261 and separators)
    .replace(
      /(?:\+?261[\s.\-/]*|00261[\s.\-/]*|0)(?:3[23478]|20)(?:[\s.\-/]*\d){7}\b/g,
      '[Contact protégé]',
    )
    // WhatsApp / FB links
    .replace(
      /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.me|wa\.me|api\.whatsapp\.com)\/[^\s)]+/gi,
      '[Lien protégé]',
    )
    // Email addresses
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[Contact protégé]');
}

/**
 * Format a Malagasy phone number into a masked preview like `034 •• ••• ••`.
 */
export function maskPhonePreview(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('261') && local.length === 12) {
    local = '0' + local.slice(3);
  }
  const prefix = local.length >= 3 ? local.slice(0, 3) : '034';
  return `${prefix} •• ••• ••`;
}

export function sanitizePropertyForViewer(
  property: any,
  isAdmin = false,
  viewerUserId?: string | null,
  viewerHasFullAccess = false,
): any {
  if (!property || typeof property !== 'object') return property;

  const clean: Record<string, any> = {
    ...property,
    owner: sanitizeOwnerForViewer(property.owner, isAdmin),
  };

  if (isAdmin) {
    return clean;
  }

  const normalizedViewerId = viewerUserId ? String(viewerUserId).trim() : '';
  const ownerId =
    clean.owner && typeof clean.owner === 'object'
      ? String(clean.owner._id || clean.owner.id || '')
      : typeof clean.owner === 'string'
        ? clean.owner
        : '';

  const isUnlockedForViewer =
    viewerHasFullAccess ||
    !property.contactAccessLocked ||
    Boolean(normalizedViewerId && normalizedViewerId === ownerId);

  // Never expose scraper audit markers, server-only estimatedArea/qualityScore, or external Facebook URLs to public callers.
  delete clean.origin;
  delete clean.claimStatus;
  delete clean.claimedBy;
  delete clean.claimedAt;
  delete clean.estimatedArea;
  delete clean.qualityScore;
  delete clean.visualCondition;
  delete clean.unlockedByUsers;
  delete clean.contactUnlockCostJp;
  delete clean.contactAccessLocked;

  if (!isUnlockedForViewer) {
    const primaryPhone =
      clean.phone1 ||
      clean.phone2 ||
      clean.phone3 ||
      (clean.owner && typeof clean.owner === 'object' ? clean.owner.phone : null);
    clean.contactLocked = true;
    clean.maskedPhonePreview = maskPhonePreview(primaryPhone) || '034 •• ••• ••';
    clean.phone1 = null;
    clean.phone2 = null;
    clean.phone3 = null;
    if (clean.owner && typeof clean.owner === 'object') {
      clean.owner = {
        ...clean.owner,
        phone: null,
        email: null,
      };
    }
    if (typeof clean.description === 'string') {
      clean.description = redactContactsFromText(clean.description);
    }
    if (typeof clean.title === 'string') {
      clean.title = redactContactsFromText(clean.title);
    }
  } else {
    clean.contactLocked = false;
  }

  // Backward-compatibility fallback only when a legacy unmigrated listing still
  // uses an admin account as owner alongside `sources.username`/`sources.avatar`.
  const isLegacyAdminSource =
    clean.owner &&
    typeof clean.owner === 'object' &&
    clean.owner.role === 'admin' &&
    clean.sources?.username;

  if (isLegacyAdminSource) {
    clean.sources = {
      username: clean.sources.username,
      avatar: clean.sources.avatar || null,
    };
  } else {
    delete clean.sources;
  }

  return clean;
}
