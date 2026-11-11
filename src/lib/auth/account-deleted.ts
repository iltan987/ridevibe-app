/**
 * Whether the own-profile lookup proves the account no longer exists.
 *
 * getClaims() only checks the JWT signature, so after an admin deletes an account its access token stays valid
 * until it expires (up to `jwt_expiry`). Every account gets its profile row in the sign-up transaction, so a
 * successful lookup without a row means the account is gone. A failed lookup proves nothing: a DB hiccup must not
 * sign people out.
 */
export function accountDeleted(lookup: { data: unknown; error: unknown }) {
  return !lookup.error && lookup.data == null;
}
