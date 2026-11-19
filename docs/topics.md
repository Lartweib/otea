# Side topics

The questions you ask an agent off the work at hand ("why is the Windows build slow?") get answered in the chat and then lost. With topics on, the agent keeps each one as a short conversation, and the page lists what is left hanging. Topics are off until you turn them on, and they are never work: no lease, and `otea next` never offers one.

```sh
otea topic on                                                    # you, once per project (or Settings › Topics)
otea topic add "Why is the Windows build slow?" --as quill       # the agent records your question
otea topic answer TEM-1 --summary "Defender scans node_modules." --full "<the whole answer>" --as quill
otea topic add --to TEM-1 "And with SSD caching?" --as quill    # a follow-up goes on the topic it follows
otea topic note TEM-1 "And on Linux?"                            # you keep it going; a waiting agent wakes for it
otea topic close TEM-1                                           # only you close a topic
otea topic list --search "windows build"                         # what was said before, closed topics too
otea topic list --search "windows build" --all-projects          # ... in every project on this computer
otea topic show TEM-3 --project geo-api                          # a topic of another project
otea create --collection Cambios --title "Exclude node_modules" --field "Qué quiero=Faster builds" --from TEM-1 --as quill
```

- An open topic is the agent's turn; once answered it is yours, and Te toca folds the answered ones under its lanes. One nobody touched for a day reads as left hanging.
- Each answer shows its summary, with the answer folded below, «guardada por el agente»: the agent saves it as it gave it in the chat, but Otea reads no harness transcript, so what a topic keeps is the agent's own account, not a verbatim copy, whatever tool it runs in.
- From the page you can turn a topic into a task on a board you pick, linked both ways. An item lists its related topics, says while it is your turn that one is still open, and offers to close them once it is finished; a topic the same agent opened shortly before making the item, and that shares a word with it, is suggested for you to link or wave off (the three closest at most).
- While topics are on, the agent guide (MCP instructions, `otea board`) tells agents to record each side question before answering it, a follow-up on the topic it follows, and never small talk, a check-in or a question about something said before. For that last one they look in the topics (`topic_list` with `search`, `topic_show`); `otea next` and `otea wait` remind them. While off it never mentions them.
- `otea topic --help` lists the topic commands.
- The page has a search box over titles, questions and full answers, open and closed, and over the items' threads (notes and their answers, questions to you, handoff and send-back notes, titles and fields). `otea topic list --search` gives those items after the topics. A question about one project is often asked in another: «En todos los proyectos» under the search box, and `--all-projects`, search every project on this computer, each topic and item with its project; the guide tells agents to search there when nothing turns up here. Te toca shows three answered topics at most, the rest on the page; «Todos los proyectos» lists each project's answered topics too. Turning a topic into a task starts its first text field with the question and the last answer.
