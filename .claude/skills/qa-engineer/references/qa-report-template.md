# QA Report Template

Save as `docs/qa/<slice-name>-qa-analysis.md`. Fill every section; use "N/A — <reason>" rather than deleting a section.

```markdown
# QA Analysis — <Feature Name>

**Component under test:** `<path>`
**Backing API:** `<path>` (`<verbs>`)
**Permission gate:** `<permission key>` via `<client hook>` and `<server check>`
**Existing test coverage:** `<test file(s)>` or "none"
**Status:** <one paragraph: audit date, what was fixed same-day, what's open and why (product decision vs. not-yet-done)>

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Nav entry | ... | ... |
| Page | ... | ... |
| Fetch | ... | ... |
| Save | ... | ... |
| Consumers of saved data | ... | ... |

## 2. Functional walkthrough
Prose description of the actual data flow, referencing line numbers, not a restatement of the component's prop types.

## 3. Findings (bugs / risks), ranked
### Critical
### High
### Medium
### Low
Each finding: one-line summary, whether fixed or open, and if open, whether it's a code fix or a product decision blocking a code fix.

## 4. Suggested test matrix
Group by concern (permissions, validation, data integrity, i18n, a11y, regression triggers). Mark `[x]` for automated, `[ ]` for manual/integration-only, and say why anything is `[ ]` (e.g. "needs a real DB, not a mocked fetch").

## 5. Recommended next steps
Numbered, ordered by priority. Strike through (`~~text~~`) items completed during this pass.
```
