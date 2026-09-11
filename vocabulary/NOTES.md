# Vocabulary Studio

Public route: `/vocabulary/`. Static HTML, CSS and browser ES modules; no build step or new server secrets. Linked from Home, Profile and Blog.

112 entries extracted from the original teaching notes in IELTS_Advanced_Vocabulary_Study_List.md (11 September 2026): advanced words, topics, Task 1 expressions and speaking expressions. The 570-family AWL PDF is not reproduced.

Vendored scheduler: ts-fsrs 5.4.2, MIT (vendor/LICENSE), FSRS-6 defaults, target retention 0.90, fuzz disabled, short-term model enabled, automatic learning steps empty. Application supplies ten-minute Forgotten retries and a two-attempt daily ceiling. This first version fixes retention at 0.90 and timezone at first use; it does not implement parameter fitting, account sync, workload forecasting or progress import. Due ordering reserves every fifth review selection for oldest-due items, then prioritizes predicted recall for other selections.

IndexedDB read/write transactions serialize prompt admission and rating across same-origin tabs. UTC review records and the saved IANA timezone define daily usage. Export includes settings, card memory states, day usage and review events. Keep word IDs stable when editing the dataset.

Validation: existing CMS self-test 41/41; scheduling assertions for daily cap, pending prompt persistence, reveal requirement, retry delay and ceiling, duplicate ratings, pause, and FSRS state updates; browser reveal, Known rating, and reload persistence checked.
