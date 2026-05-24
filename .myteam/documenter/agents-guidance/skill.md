---
name: "agents-guidance"
description: "Conditionally review bootstrap guidance and update repository-wide myteam instructions when shared guidance actually changed."
---

# Documenter Guidance Review

Load this skill only when the implemented change may affect startup bootstrap guidance, repository-wide agent or contributor instructions, or repository-defined documentation requirements for code comments, docblocks, docstrings, or file headers.

## Required Actions

- Run `detect_guidance_targets.py` when changed-file evidence is available and you need a quick determination of whether guidance-file review is likely in scope.
- Run `scan_in_code_doc_requirements.py` when repository guidance may define documentation requirements that apply inside changed product files.
- Review the relevant bootstrap, runtime, or documentation-guidance files only when changed-file evidence indicates they are in scope.
- Identify repository-specific documentation requirements that govern in-code comments, such as function comments, docblocks, docstrings, file headers, author metadata, or last-modified fields.
- Treat bootstrap instructions in `AGENTS.md` as separately protected from other repository-policy sections; update non-bootstrap sections only when the current implementation changed their accuracy or when required documentation policy must be synchronized with implemented behavior.
- Re-read any edited guidance files and confirm the updated guidance is accurate.

## Tools

- `detect_guidance_targets.py` classifies changed files into bootstrap-guidance, repository-runtime-guidance, or ordinary documentation buckets so the model can skip unnecessary `AGENTS.md` or `.myteam` review.
- `scan_in_code_doc_requirements.py` reads repository guidance files and extracts structured in-code documentation requirements that the documenter should enforce for changed product files.
