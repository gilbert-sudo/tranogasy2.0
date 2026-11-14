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

export function sanitizePropertyForViewer(property: any, isAdmin = false): any {
  if (!property || typeof property !== 'object') return property;

  const clean: Record<string, any> = {
    ...property,
    owner: sanitizeOwnerForViewer(property.owner, isAdmin),
  };

  if (isAdmin) {
    return clean;
  }

  // Never expose scraper audit markers or external Facebook URLs to public callers.
  delete clean.origin;
  delete clean.claimStatus;
  delete clean.claimedBy;
  delete clean.claimedAt;

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
