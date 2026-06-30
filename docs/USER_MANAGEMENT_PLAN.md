# User Management Implementation Plan (Phase 12)

## Current State
- **Models exist:** User, Company, CompanyMember with roles (owner/accountant/viewer)
- **Missing:** No API endpoints for member CRUD, no user profile editing, no admin panel
- **`require_company_role`** dependency exists but is unused — all endpoints use `_ensure_member` which only checks membership existence

## What We're Building

### 1. Role Constants & Validation
- Define valid roles: `owner`, `accountant`, `viewer`
- Add Pydantic validation so role field can't be arbitrary strings
- Owner can't be demoted or removed (protection rule)

### 2. Member Management Endpoints
| Method | Path | Purpose | Required Role |
|--------|------|---------|---------------|
| `GET` | `/companies/{id}/members` | List all members with roles | owner, accountant |
| `POST` | `/companies/{id}/members` | Add existing user to company | owner |
| `PATCH` | `/companies/{id}/members/{user_id}` | Change member role | owner |
| `DELETE` | `/companies/{id}/members/{user_id}` | Remove member from company | owner |

**Key decisions:**
- "Add member" requires the user to already exist in the system (self-registration first)
- No email invitation system (avoids email infrastructure complexity)
- Owner role is protected: can't be changed or removed
- Last owner can't be removed (prevents orphaned company)

### 3. User Profile Endpoints
| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/auth/me` | Already exists | Any user |
| `PATCH` | `/auth/me` | Update own name/email | Any user |
| `PATCH` | `/auth/me/password` | Change own password | Any user |

### 4. Superadmin User Management
| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/admin/users` | List all users | superadmin |
| `GET` | `/admin/users/{id}` | Get user details | superadmin |
| `PATCH` | `/admin/users/{id}` | Update user (name, email, is_active, is_superadmin) | superadmin |
| `DELETE` | `/admin/users/{id}` | Soft-delete (deactivate) user | superadmin |

### 5. Wire Up `require_company_role`
- Replace `_ensure_member` in existing endpoints with `require_company_role("owner", "accountant")` where appropriate
- Add role-based access to sensitive operations

### 6. Frontend Pages
- **MembersPage** (`/members`): List members, add member form, role change dropdown, remove button
- **ProfilePage** (`/profile`): Edit own name/email, change password
- **AdminUsersPage** (`/admin/users`): Superadmin only — list all users, deactivate, promote/demote

### 7. Navigation Updates
- Add "Members" nav item (visible when user is owner/accountant)
- Add "Profile" link in header (user dropdown or icon)
- Add "Admin" nav item (visible only to superadmin)

## Files to Create/Modify

### Backend — New Files
| File | Purpose |
|------|---------|
| `backend/app/api/v1/members.py` | Member CRUD endpoints |
| `backend/app/api/v1/admin.py` | Superadmin user management endpoints |
| `backend/app/schemas/member.py` | Member request/response schemas |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/app/schemas/user.py` | Add UserUpdate, PasswordChange schemas; add role enum |
| `backend/app/api/v1/auth.py` | Add PATCH /me and PATCH /me/password endpoints |
| `backend/app/api/v1/__init__.py` | Register members + admin routers |
| `backend/app/core/dependencies.py` | Add `get_current_membership` that returns CompanyMember with role |

### Frontend — New Files
| File | Purpose |
|------|---------|
| `frontend/src/pages/MembersPage.tsx` | Member management UI |
| `frontend/src/pages/ProfilePage.tsx` | User profile edit + password change |
| `frontend/src/pages/AdminUsersPage.tsx` | Superadmin user management |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add /members, /profile, /admin/users routes |
| `frontend/src/pages/DashboardPage.tsx` | Add Members + Admin nav items, profile link |

### Tests — New Files
| File | Purpose |
|------|---------|
| `backend/tests/test_members.py` | Member CRUD integration tests |
| `backend/tests/test_admin_users.py` | Superadmin user management tests |
| `backend/tests/test_user_profile.py` | Profile edit/password change tests |

## API Design Details

### Add Member (`POST /companies/{id}/members`)
```json
// Request
{ "email": "user@example.com", "role": "accountant" }

// Response (201)
{
  "id": "uuid",
  "company_id": "uuid",
  "user_id": "uuid",
  "role": "accountant",
  "user": { "id": "uuid", "email": "user@example.com", "name": "John", ... }
}
```

### Change Role (`PATCH /companies/{id}/members/{user_id}`)
```json
// Request
{ "role": "viewer" }

// Response (200)
{ "id": "uuid", "role": "viewer", ... }
```

### Profile Update (`PATCH /auth/me`)
```json
// Request
{ "name": "New Name", "email": "new@email.com" }

// Response (200)
{ "id": "uuid", "email": "new@email.com", "name": "New Name", ... }
```

### Password Change (`PATCH /auth/me/password`)
```json
// Request
{ "current_password": "old123", "new_password": "new456" }

// Response (200)
{ "message": "Password updated" }
```

## Protection Rules
1. **Owner can't be removed** — if last owner, block removal
2. **Owner can't be demoted** — must transfer ownership first (future feature)
3. **Can't deactivate yourself** — superadmin can't self-deactivate
4. **Last superadmin can't be deactivated** — prevents system lockout

## Test Coverage Target
- ~30 new tests covering:
  - Member CRUD (add, list, change role, remove)
  - Protection rules (owner protection, last owner, etc.)
  - Profile edit and password change
  - Superadmin user management
  - Role-based access control
  - Edge cases (duplicate member, non-existent user, etc.)
