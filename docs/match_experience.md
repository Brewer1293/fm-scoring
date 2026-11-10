# Match experience and CA development

How playing matches feeds a player's monthly CA (current ability) growth.

Sources:

- A YouTube comment on the training test video from the FM-Arena member behind the AI testing it mentioned. Their
  longer FM-Arena post, with the formula, was probably
  ["Some training and development conventional wisdom for FM24"](https://fm-arena.com/thread/20900-some-training-and-development-conventional-wisdom-for-fm24/)
  (thread 20900). FM-Arena went down in November 2026 (reportedly a hack wiping its server), and the Wayback Machine
  has no copy.
- [FM-24-Match-Harness](https://github.com/PhilipArmstead/FM-24-Match-Harness), a headless runner of FM24's match
  engine and development routine. Its `tools/experiments/match_points.py` (added in commit `d32d6a3`, removed in
  `5b8be9c` when the simulator moved into its UI) reimplements the game's per-match function (`sub_144886B30`),
  checked against measured matches. The formula below is from there; its `docs/CLI.md` has the bands.

All of this is **FM24**, reverse-engineered, not official, and not tested here on FM27.

## The monthly counter

- Every match a player appears in adds **match points** to a counter. On the player's monthly development day the
  counter is banded, then reset.
- Bands: under 20 points = "no matches", then **20, 40, 60, 80, 100, 125, 150** start bands 0 to 6. So **150 is the
  top**: points beyond it do nothing that month.
- A higher band means more growth for players with headroom (about **+1 to +1.8 CA a month** for a full month),
  but bands 0 and 1 can *cost* CA for players at their peak.
- **Under-19s get band 2 to 4 without playing** (60–100 points' worth), depending on Professionalism. That's why
  youngsters develop without games, and only points above their floor help them.

## Points per match (FM24)

```python
def match_points(minutes, level, average_ability, opponent_reputation, played_level, appearances,
                 competitive=True, result="draw", player_of_the_match=False):
    minutes = min(minutes, 90)
    if minutes <= 0:
        return 0
    steps = max(1, minutes // 5)                       # 5-minute blocks
    if minutes >= 45:                                  # result counts only after 45 minutes
        steps += {"win": 1, "draw": 0, "loss": -1}[result] + player_of_the_match
    weight = (average_ability // 10 + level + opponent_reputation // 500) / 40 + 0.5
    if competitive:
        weight = max(weight, 1.0)
    ratio = level / played_level if played_level else 1.0
    if level and level >= played_level and appearances <= 59:   # new-level bonus
        ratio *= 1.5 - 0.5 * appearances / 60
    ratio = min(max(ratio, 1.0 if competitive else 0.85), 2.0)
    return int(weight * ratio * steps)
```

- `level`: the competition's reputation ÷ 10 (Premier League 18, Serie A 17; **friendlies 1**).
- `average_ability`: minutes-weighted mean CA of both matchday squads.
- `opponent_reputation`: 0–10000.
- `played_level`: the player's *established* level, the best league reputation ÷ 10 in which they've made **11+
  league appearances in a season** (cups and Europe don't count). `appearances`: their appearances there (0–120).
- U21 and reserve games appear not to count as competitive (unconfirmed).

Checks from the harness: an AI friendly (average CA 109, opponent 5100, a 90-minute win) gave a senior (played
level 12) **16** points and a youth (played level 1) **29**. A full Premier League game earns a regular senior about
**27–33**, a young player up to twice that; a full U21 game about 20–23.

## What follows

- **Seniors find it harder to earn.** A high played level lowers the ratio, and it can't go below 1.0 in
  competitive games, so for an established player matches are worth roughly their weight × minutes, nothing more.
- **Playing above your level pays double.** A youngster in a competition above their played level gets up to 2×,
  plus the new-level bonus while they have under 60 appearances there.
- **Friendlies are worth little to seniors.** Level 1 makes the ratio tiny and it floors at 0.85, while a
  youth whose played level is also 1 still gets the full rate.
- **Bigger games are worth more.** Higher average CA, a stronger competition and a stronger opponent all raise the
  weight.
- **Wins help, losses hurt** (±1 block), as does Player of the Match (+1), but only after 45 minutes on the pitch.

## Where the sources disagree

- The comment gives the competition level as reputation ÷ 100 (Premier League "about 17"); the code divides by 10
  (Premier League 18). Either way it's the same scale of levels, with friendlies at 1.
- The comment says under-18s get an effective 100 a month and that more can be worth **about 3 CA a month**. The
  harness says under-19s get 60–100 depending on Professionalism, and that a full band is worth +1 to +1.8 CA. The
  thread 20900 summary in search results put maximising match experience for an U18 at **1.5–1.7 CA a month**
  (measured on two players).
- A [harness issue](https://github.com/PhilipArmstead/FM-24-Match-Harness/issues/2) (5 Nov 2026) found 150 points
  giving *less* CA than 100 over 36 simulated months for some U18s, with the 150 boost happening only once. That's
  the simulator, not the game, and unanswered so far.

## For this tool

My reading of the above:

- Youth on page 2 (grid): games only help once they push a youngster past their floor, so the minutes need to be
  worth something: competitive matches, ideally at or above their played level. A loan to a league above their
  played level gets the 2× ratio; reserve, U21 and friendly games mostly don't.
- Training tests (`schedules/`, the slides in this folder) measure training alone: match points are a separate
  input to development, so keep game time comparable between runs.
