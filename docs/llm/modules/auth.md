# Auth Module

## Responsibilities
- User authentication and authorization.
- JWT token generation and management.
- Password hashing and verification.
- User registration (restricted to specific roles).

## Folder Structure
- `server/src/modules/auth/`
    - `controller.js`: Handles login, registration, and current user retrieval.
    - `routes.js`: Defines the API endpoints for authentication.

## DB Tables Used
- `users`: Stores user credentials (`email`, `password_hash`), names, and roles (`owner`, `manager`, `staff`).

## Public Services & Methods
- **Controller Methods**:
    - `login(req, res)`: Authenticates user and returns a 24h JWT.
    - `register(req, res)`: Creates a new user with hashed password.
    - `getCurrentUser(req, res)`: Returns the authenticated user's details.

## Core Business Rules
- **Demo Mode**: Allows pre-defined passwords (`owner123`, `manager123`, `staff123`) for their respective demo emails even if bcrypt fails.
- **Role-Based Registration**: While not strictly enforced in the controller code itself, typical usage restricts `register` to `owner` or `manager` roles through middleware.
- **Token Expiry**: JWTs are valid for 24 hours.

## Accounting Impact
- No direct impact on the general ledger.
- Provides context (user ID) for audit trails in other modules.

## Risks / Unclear Logic
- **Demo Passwords**: Hardcoded demo passwords in the controller should be disabled in a production environment.
- **Password Strength**: No explicit password complexity requirements enforced at the backend level.
