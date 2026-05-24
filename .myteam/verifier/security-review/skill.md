---
name: "security-review"
description: "Perform the security-sensitive review pass for the combined change."
---

# Verifier Security Review

Load this skill only when performing the verifier's security review.

## Required Actions

- Check for bypass vectors, race conditions, hardcoded secrets, missing authorization, missing input validation, and unsafe defaults.
- Note any security-sensitive behavior that lacks adequate tests or defensive handling.
