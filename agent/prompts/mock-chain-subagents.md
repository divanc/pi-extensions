---
description: Test subagent chain rendering with sleeping sequential workers
---
Use the subagent tool with the chain parameter to run this mock sequential workflow:

```ts
{
  chain: [
    {
      agent: "worker",
      task: "Mock chain step 1. Run this bash command exactly: sleep 3 && echo 'chain step 1 complete'. Then return the line STEP_1_RESULT=alpha."
    },
    {
      agent: "worker",
      task: "Mock chain step 2. Previous output:\n\n{previous}\n\nRun this bash command exactly: sleep 4 && echo 'chain step 2 complete'. Then return the line STEP_2_USED_PREVIOUS=yes if you saw STEP_1_RESULT=alpha."
    },
    {
      agent: "worker",
      task: "Mock chain step 3. Previous output:\n\n{previous}\n\nRun this bash command exactly: sleep 2 && echo 'chain step 3 complete'. Then return a final short summary proving the previous step was passed through."
    }
  ]
}
```

This is only for UI testing. Do not do any real repo work.
