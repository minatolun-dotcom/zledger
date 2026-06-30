# Coding Standards

## Backend (Python/FastAPI)
- **Typing:** Strict type hints for all function signatures.
- **Money:** Use `decimal.Decimal` for all currency. NEVER use `float`.
- **Async:** Use `async def` for API endpoints; use `await` for DB calls.
- **Errors:** Use FastAPI `HTTPException` for API errors with clear detail messages.
- **Naming:** `snake_case` for variables and functions; `PascalCase` for classes.

## Frontend (TypeScript/React)
- **Typing:** Strict TypeScript. Avoid `any`.
- **State:** 
  - Global state $\rightarrow$ Zustand.
  - Server state $\rightarrow$ React Query.
- **Styling:** Tailwind CSS (Utility-first).
- **Naming:** `camelCase` for variables/functions; `PascalCase` for components.

## API Standards
- **REST:** Standard RESTful paths.
- **Versioning:** All API endpoints prefixed with `/api/v1`.
- **Response:** Consistent JSON envelopes.
- **Context:** Company ID must be passed/resolved for every data-accessing endpoint.
