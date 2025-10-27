# Security Notes

## Authentication and Tokens
- Access tokens are JWTs with a short TTL (`ACCESS_TTL_MIN` minutes).
- Refresh tokens are stored hashed in the database and rotated on every refresh.
- Password reset tokens are stored hashed, expire after `PASSWORD_RESET_TTL_MINUTES` (default 60) and become unusable after the first reset.

## Rate Limiting
- `POST /api/v1/auth/login`: 5 requests per minute per IP.
- `POST /api/v1/auth/refresh`: 30 requests per minute per IP.
- `POST /api/v1/auth/forgot-password`: 5 requests per hour per IP.

## Event Permissions
- Event access requires membership. Roles:
  - `owner`: full control, including membership management.
  - `collab`: can update events, candidates, tasks, and create quotes.
  - `viewer`: read-only access to event data.
- Structure mutations remain restricted to admin users.

## Audit Logging
- `audit_log` captures create/update/delete operations for structures, events, event candidates, and quote creation, including actor, IP, and payload diff.

## Data Protection
- Passwords use Argon2id.
- Refresh and reset tokens are hashed using SHA-256 before storage.
