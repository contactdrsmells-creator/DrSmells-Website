@AGENTS.md

# Project Rules

## Rule 1: Frontend-Backend Sync
Every visible element on the website (text, images, videos, icons, headings, descriptions, colors, links) MUST have a corresponding editor in the admin dashboard. If a new section or element is added to the frontend, an admin control for editing that element must be created at the same time. Nothing on the website should be hardcoded if it can reasonably be made editable. This applies to:
- Text content (headings, paragraphs, labels, button text)
- Media (images, videos, icons)
- Links and CTAs
- Section visibility and ordering

## Rule 2: Security First
Before writing or modifying any code, ensure the following security standards are met:
- **No secrets in client code**: Never expose API keys, passwords, or tokens in client-side JavaScript. All secrets must stay in `.env.local` or server-side only.
- **Input validation**: Validate and sanitize all user inputs on both client and server (file uploads, form fields, API parameters).
- **Authentication checks**: Every admin API route and server action must verify the auth cookie before processing. Never trust client-side auth alone.
- **File upload safety**: Restrict file types, enforce size limits, and sanitize filenames on all upload endpoints.
- **SQL injection prevention**: Always use parameterized queries via Supabase client — never construct raw SQL from user input.
- **XSS prevention**: Never use `dangerouslySetInnerHTML` with unsanitized user content. Escape all dynamic content rendered in the DOM.
- **CSRF protection**: Use httpOnly, secure, sameSite cookies for authentication.
- **No destructive public endpoints**: All write/update/delete operations must be behind authentication.
- **Dependency awareness**: Do not install packages with known vulnerabilities. Prefer well-maintained, widely-used libraries.
