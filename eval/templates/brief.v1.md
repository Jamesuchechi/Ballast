# {{title}}

As of: {{as_of}}
Mode: {{mode}}
Status: {{status}}

## Answer
{{answer}}

## What I used
### Private
{{#what_i_used.private}}
- {{.}}
{{/what_i_used.private}}
{{^what_i_used.private}}
- None
{{/what_i_used.private}}

### Web
{{#what_i_used.web}}
- {{.}}
{{/what_i_used.web}}
{{^what_i_used.web}}
- None
{{/what_i_used.web}}

### Could not be checked
{{#what_i_used.unchecked}}
- {{.}}
{{/what_i_used.unchecked}}
{{^what_i_used.unchecked}}
- None
{{/what_i_used.unchecked}}

## Evidence
{{#evidence}}
- Claim: {{claim}}
{{#citations}}
  - [{{source_class}}] {{source_id}} — “{{quote}}”
{{/citations}}
{{/evidence}}
{{^evidence}}
- No grounded evidence claims published.
{{/evidence}}

## Uncertain / missing
{{#uncertain}}
- {{.}}
{{/uncertain}}
{{^uncertain}}
- None identified.
{{/uncertain}}

## Open loops
{{#open_loops}}
- {{.}}
{{/open_loops}}
{{^open_loops}}
- None.
{{/open_loops}}

## Actions
{{#actions}}
- [ ] {{.}}
{{/actions}}
{{^actions}}
- No actions proposed.
{{/actions}}

## What I did not do
{{#what_i_did_not_do}}
- {{.}}
{{/what_i_did_not_do}}
{{^what_i_did_not_do}}
- No additional withheld actions.
{{/what_i_did_not_do}}
