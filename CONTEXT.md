# Pi User Configuration

This context names the user-level pi customization concepts used by local extensions, agents, and prompts.

## Language

**Subagent**:
A delegated pi agent running in an isolated child pi process and returning its result to the parent conversation.
_Avoid_: task, worker, background job

**Agent Definition**:
A markdown file that names a **Subagent** and defines its role, tools, model, and system prompt.
_Avoid_: skill, prompt template

**Live Agent Roster**:
A transient UI widget that lists currently running **Subagents** and their latest visible progress.
_Avoid_: task list, teamwork

## Relationships

- A **Subagent** is created from exactly one **Agent Definition**.
- A **Live Agent Roster** displays zero or more running **Subagents**.

## Example dialogue

> **Dev:** "When the parent asks a **Subagent** to inspect files, should that appear in the **Live Agent Roster**?"
> **Domain expert:** "Yes — each running **Subagent** gets one line showing its name and latest progress."

## Flagged ambiguities

- "task" was used as a UI analogy from teamwork; resolved: the pi domain term is **Subagent**, and the UI list is the **Live Agent Roster**.
