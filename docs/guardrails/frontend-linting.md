# Frontend Linting Guardrails

- In JSX and TSX files, always wrap comments with `{/* ... */}`. Do **not** use HTML comments like `<!-- ... -->`.
- Avoid unnecessary `as ...` type assertions; rely on inference or narrow the source expression instead.
- Every commit must pass `eslint --max-warnings=0` and Prettier formatting checks before it can merge.
