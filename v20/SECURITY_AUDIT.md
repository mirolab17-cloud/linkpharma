# v20 Security Audit

- Default-deny Firestore catch-all retained.
- User self-registration is limited to a short trial and cannot self-grant admin, subscription, or a completed profile.
- Profile completion is validated server-side for Gaza phone format `05XXXXXXXX`, location and required names.
- Orders, suggestions, notifications, presence and activity use field allowlists and size/type checks.
- Suggestion records are immutable for pharmacies; only admins may change workflow fields.
- Price/catalog writes remain admin-only and price visibility is enforced by rules.
- The client shows a branded offline page and does not claim to operate from offline data.

Firestore rules must be deployed from this directory before production use.
