# Assistant Response Formatting Guidelines

These guidelines define the default formatting for AI-generated written responses in the My Race Engineer project spaces (Slack updates, PR comments, docs drafts, etc.). Apply them whenever tone or structure is not explicitly overridden by a request.

---

## Baseline structure
- **Use Markdown headings** (`##`, `###`, etc.) to organise content into logical sections when responding with more than a couple of sentences.
- **Lead with a brief summary section** that captures the key outcome or answer in bullet points.
- **Follow with detail sections** (e.g., "Details", "Rationale", "Next steps") that expand on the summary items.

## Bullets & lists
- Prefer **bulleted lists** for enumerating ideas, requirements, or steps when the order is not critical.
- Use **numbered lists** when sequence or priority matters.
- Keep individual bullet items concise (1–3 sentences). If longer explanation is required, nest secondary bullets beneath the primary point.

## Readability helpers
- Emphasise important callouts with **bold** text or callout blocks (`> Note:`) instead of writing them inline in long paragraphs.
- Break up dense content with tables when comparing options or summarising decision matrices.
- Include code blocks or inline code ticks for identifiers, commands, and filenames.

## Exceptions
- If a human requestor specifies a different format, follow the explicit instruction for that interaction.
- For quick confirmations ("done", "thanks", etc.) the structured template is optional; respond succinctly.
- When communicating in existing long-form documents, match the established document style to avoid inconsistent formatting.

---

## Maintenance
- Revisit these guidelines quarterly or when conversation patterns change.
- Document any significant deviation (e.g., new required sections) in the PR description that introduces the change so other collaborators can adopt it quickly.
