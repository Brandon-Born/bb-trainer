# Replay Investigation Notes (2026-02-08)

These notes summarize observed structure from sanitized demo replay files:

1. `demo-replays/demo1.bbr`
2. `demo-replays/demo2.bbr`
3. `demo-replays/demo3.bbr`

## Key Findings

1. Core turn progression is represented by repeated `EventExecuteSequence` blocks plus `EventEndTurn`.
2. Sequence payloads use nested base64 in `MessageData` (double decode required).
3. Step-level payloads commonly use:
   - `PlayerStep`
   - `DamageStep`
   - `BallStep`
4. Frequent result tags include:
   - `ResultUseAction`
   - `ResultBlockRoll`
   - `ResultBlockOutcome`
   - `ResultPushBack`
   - `ResultTeamRerollUsage`
   - `ResultInjuryRoll`
   - `ResultPlayerRemoval`

## Working Mapping Assumptions

1. `block`:
   - `ResultBlockRoll`, `ResultBlockOutcome`, `ResultPushBack`
2. `blitz`:
   - `ResultUseAction` with `Action=2`
3. `dodge`:
   - `ResultRoll` when step context `StepType=1`
4. `reroll`:
   - `QuestionTeamRerollUsage`, `ResultTeamRerollUsage`
5. `casualty`:
   - `ResultInjuryRoll`, `ResultCasualtyRoll`, `ResultPlayerRemoval`
6. `ball_state`:
   - `BallStep`, `Carrier`, `ResultTouchBack`
7. `possible turnover`:
   - `EventEndTurn` with `Reason != 1`

## Observed Code Ranges

Across the three demo replays:

1. Common `StepType` values: `0`, `1`, `2`, `3`, `6`, `10`.
2. Additional observed `StepType` values: `13`, `17`, `24`, `27`, `29`, `31`, `32`.
3. Common `ResultUseAction.Action` values: `1`, `2`, `3`.
4. Additional observed `Action` values: `4`, `5`, `6`, `15`, `16`.

These extra codes are not fully mapped yet and should be refined as more replay coverage is added.

