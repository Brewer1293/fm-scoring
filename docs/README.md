# Docs

- `训练excel Training excel.xlsx`: FM training spreadsheet by harvestgreen22 on [FM-Arena](https://fm-arena.com/). Kept here as a reference for future development; all credit to its author.
- `Harvestgreen training.pptx` / `.pdf`: slides explaining harvestgreen22's training test, then my own FM27 test of tactical training setups, compared with other people's results.
- `FM27 attibute 属性表…xlsx`: harvestgreen22's FM27 attribute test ([sortitoutsi thread](https://sortitoutsi.net/content/78219/fm27-attribute-test-tactical-understanding-training-system-preset-tactics-ai-reverse-engineering-engine-for-test), 3 Nov 2026). All 18-year-olds with every attribute at 12, one attribute at a time changed to 1, 6 or 18 for the whole team, preset Gegenpress 4-4-2, 5 opponents × 100 matches each.
- `attribute_test_fm27.csv`: that spreadsheet's tables as one CSV. Values are the win-rate change in percentage points: `to_1`/`to_6`/`to_18` against the all-12 base, then the gain over each range, and FM24's for comparison. A blank means not tested.
- `ca_costs_fm27.csv`: CA cost of each attribute by position.
- `training_focuses_fm27.csv`: the attributes each training session works on.
- `match_experience.md`: how match experience feeds monthly CA growth (from a YouTube comment by the FM-Arena AI tester).

My test's schedules are in `schedules/`. Each setup has one schedule per week of a 4-week cycle, plus a matching `u18` version for the youth team:

- `A minimal`: no tactical sessions (one schedule, repeated every week)
- `B1`–`B4 min+8TE`: 8 tactical sessions a month
- `C1`–`C4 min+24TE`: 24 tactical sessions a month
