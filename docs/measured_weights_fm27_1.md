# Measured weights for FM27 27.1.0 (`weights/fm27_1_measured.toml`)

These weights come from measuring FM27's own 27.1.0 match engine instead of weighting by hand. The engine was run
natively on a Mac with the tooling in [fm27-headless-research](https://github.com/Brewer1293/fm27-headless-research).
That tool replays saved FM matches exactly: score, goal minutes, shots and xG matched the in-game results on three
of three test matches.

## The study (17 Nov 2026)

- **Design.** Random configurations, after Purity's FM27 study on fm-arena:
  - 1,002 random line-ups of one team's starting XI.
  - Every attribute of every starter was shifted by an independent −5 to +5 levels.
  - Each line-up was played with 4 seeds on one of three real 27.1.0 recordings (Man Utd v PSV twice, Man Utd v Congleton).
  - That makes 4,008 matches, all checked: every edit was read back from the engine, and every match finished cleanly.
- **Model.** Goal difference was regressed on each attribute's total shift, with an effect per recording and errors
  clustered by line-up. It was fitted once over all outfield players, and once with position groups (CB, FB/WB, DM/CM,
  wide/attacking) and the goalkeeper.

Goal difference per 38-match season, per +1 level for one outfield starter chosen at random (GK: the goalkeeper):

| Attribute | Effect | 95% CI | z |
|---|---|---|---|
| Pace | +0.56 | +0.31 to +0.81 | 4.4 (confirmed) |
| Acceleration | +0.48 | +0.24 to +0.72 | 3.9 (confirmed) |
| GK Reflexes | +1.29 | +0.52 to +2.06 | 3.3 |
| Stamina | +0.41 | +0.16 to +0.66 | 3.2 |
| GK Agility | +1.06 | +0.32 to +1.80 | 2.8 |
| Strength | +0.35 | +0.10 to +0.59 | 2.7 |
| Dribbling | +0.32 | +0.09 to +0.55 | 2.7 |
| Jumping Reach | +0.32 | +0.08 to +0.56 | 2.6 |
| Anticipation | +0.23 | −0.02 to +0.48 | 1.8 |

No other attribute in this repo's views had a detectable effect: |z| was 1.5 or less for Passing, Tackling, Finishing,
Decisions, Vision, Composure and the rest. By position, the largest single effects were wide/attacking players'
Stamina (+0.94) and Pace (+0.75), and centre-backs' Acceleration (+0.81 in goal difference, +0.52 points).

## From effects to weights

1. **Shrinkage between positions.** Each position's estimate was pulled towards the all-outfield estimate by
   empirical Bayes, in proportion to its noise. For FB and the attacking roles, the spread between positions was no
   larger than chance, so they share one table. CB and the 6 keep mild differences.
2. **Evidence threshold.** Only attributes with |z| > 1.5 over all outfield players are weighted. Weighting noise
   would only add noise to the scores.
3. **Scaling.** Each position's largest effect is set to 5, then rounded to halves, as in the other weights files.
4. **Goalkeepers.** Shrunk towards zero; only Reflexes and Agility have evidence.

## Caveats

- **One team, three matches.** The study used one team (Man Utd) and three recorded matches. Treat it as a first
  measurement, not a final table.
- **Single matches only.** Effects are measured within single matches. Fitness, injuries, morale and development
  across a season are not included; the community's season-long tests (fm27v2's basis) capture some of those.
- **Patch.** Measured on patch 27.1.0. Don't mix it with 27.0.x results without checking.
- **Unchanged sections.** The `[curve]`, `[win]`, `[gk_pts]`, age-benchmark and staff sections are copied from
  `fm27v2` unchanged.
