---
description: Test subagent task-set rendering with sleeping parallel workers
---
Use the subagent tool with the tasks parameter to run this mock task set:

```ts
{
  tasks: [
    {
      agent: "worker",
      task: "Mock parallel worker A. Run this bash command exactly: sleep 5 && echo 'worker A done after 5s'. Then return a short summary."
    },
    {
      agent: "worker",
      task: "Mock parallel worker B. Run this bash command exactly: sleep 8 && echo 'worker B done after 8s'. Then return a short summary."
    },
    {
      agent: "worker",
      task: "Mock parallel worker C. Run this bash command exactly: sleep 3 && echo 'worker C done after 3s'. Then return a short summary."
    }
  ]
}
```

This is only for UI testing. Do not do any real repo work.
