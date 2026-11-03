# Product: work and bugs

This project has two boards. `work` holds the tasks being built (the `tasks` preset); `bugs` holds
what is broken, from the report to the verified fix (the `bug-triage` preset). Each board has its
own playbook: read it with `otea playbook --collection <board>` before acting there.

## How the boards connect

- A bug can block a task: `otea link BUGS-<n> blocks WORK-<n>`. Link it when the task cannot be
  finished, or would ship broken, until the bug is fixed. `otea show WORK-<n>` lists what blocks it.
- That is the only link between the two boards. Any other one (a task blocking a bug, a bug
  relating to a task) is refused with exit 16 (`link_not_in_blueprint`), and the message lists what
  is allowed. Links inside one board are not restricted.

## While you work

- Found a bug while working a task? File it in `bugs` following its playbook, link it as blocking
  the task, and tell the human in the task's handover instead of fixing it on the side.
- Before handing a task to review, check that nothing open still blocks it.
