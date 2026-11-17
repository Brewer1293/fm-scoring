# FM player scoring

A helper for Football Manager 2027. It gives every player you look at a score for each position, so you can
compare them at a glance: your own squad, transfer targets, whole leagues, and your staff. It remembers every
player you've seen, so you can also watch how they develop over the seasons.

FM can't export its data, so this works from screenshots. You take screenshots of FM's player lists, and an
AI assistant (Claude Code or Codex) reads them for you and updates your pages. You never need to type
any data in yourself.

Works on Mac, Windows and Linux.

---

## Use it in your browser (easiest)

**Open [brewer1293.github.io/fm-scoring](https://brewer1293.github.io/fm-scoring/).** There's nothing to install, and no
terminal. You drag your FM screenshots onto the page, check what was read, and see every player scored.

- **What you need:** FM27 and an [OpenAI API key](https://platform.openai.com/api-keys). Screenshots are read by OpenAI
  with your key: a squad screenshot costs a cent or two with the default model, and the app shows what each batch cost.
- **One-time setup (5 minutes):** OpenAI won't take requests straight from a web page, so they go through a tiny relay
  you run free on your own Cloudflare account. [Set up the relay](relay/README.md), then put its address and your key
  into the app's **Settings**.
- **Before saving, you check each reading.** Cells OpenAI wasn't sure of are yellow, and values that can't be right
  (an attribute of 23) are red. You can correct any cell against the screenshot.
- **Your data stays in your browser**, on that computer. Use **Settings → Download a backup** now and then. **Export for
  the Python version** and **Import a saves folder** move saves between the web app and the version below.

---

## Just want the training schedules?

**[Download the FM27 training schedules](https://github.com/jamiebolden/fm-scoring/releases/latest/download/fm27-training-schedules.zip)**

Click the link and a zip file downloads. Open it to unzip it, then follow `How to install.txt` inside. You don't need anything else from this page.

---

## Just want the FM views and search filters?

This project comes with ready-made FM views, search filters and training schedules that you can use on their own.
They're in four folders: `views`, `player search filters`, `staff search filters` and `schedules`.

**The quick way:** download the ZIP (step 1 below), quit FM, double-click the Start file for your computer
(`Start FM Scoring (Mac).command` or `Start FM Scoring (Windows).bat`) and choose **3**. It copies everything into FM's
folders without replacing any of your own. It needs Python, and opens the download page if you don't have it.

**By hand:**

1. **Download them.** At the top of this page, click the green **Code** button, then **Download ZIP**. Open the
   downloaded file to unzip it. You'll get a folder called `fm-scoring-main`.
2. **Quit FM.** It only picks up new views and filters when it starts.
3. **Open FM's folder:**
   - **Mac:** in Finder, click **Go** in the menu bar, then **Go to Folder…**, paste
     `~/Library/Application Support/Sports Interactive/Football Manager 27`, and press Enter.
   - **Windows:** open File Explorer, click the address bar at the top, paste `%LOCALAPPDATA%\Sports Interactive`,
     and press Enter. Open the **Football Manager 27** folder. If it isn't there, look in
     **Documents → Sports Interactive → Football Manager 27** instead.

   You're in the right place if you can see folders such as `views` and `tactics`.
4. **Copy the files in.** Do this for each of the four folders:
   - Open the folder in `fm-scoring-main` (e.g. `views`), select all the files in it (**⌘ A** on Mac, **Ctrl A** on
     Windows) and copy them (**⌘ C** / **Ctrl C**).
   - Open the folder with the same name in FM's folder and paste them (**⌘ V** / **Ctrl V**). If FM's folder doesn't
     have one with that name, create it first, named exactly the same.

   Copy the files, not the whole folder. On a Mac, dragging a folder onto one with the same name and choosing
   **Replace** deletes the views you already have. If you're asked about replacing a file with the same name,
   that's one of your own views, filters or schedules, so choose **Skip** if you want to keep yours.
5. **Start FM.** The views are in the view options above player and staff lists. The filters are in the player and
   staff search screens. The schedules are in the training screen. Each one has the name of its file.

---

## Running it on your computer instead

This is the original way: an AI assistant (Claude Code or Codex) on your computer reads the screenshots and keeps your
pages up to date. It works the same, and your data lives in files in the project folder.

## What you need

- **Football Manager 2027.**
- **Python**, version 3.11 or newer. It's free, from [python.org/downloads](https://www.python.org/downloads/).
  Not sure if you have it? Skip this: the Start file checks, and opens the download page if you need it.
- **An AI assistant**, to read your screenshots. Either:
  - **Claude Code**, which needs a paid Claude plan (Pro or above): [claude.com/claude-code](https://claude.com/claude-code).
    The Claude desktop app works too.
  - **Codex**, with a paid ChatGPT plan or an OpenAI API key: [developers.openai.com/codex](https://developers.openai.com/codex).

You don't need Git, and you don't need to type commands. Your screenshots are sent to the AI service (Anthropic or
OpenAI) so it can read them.

---

## Setting up (about 10 minutes)

### 1. Download this project

At the top of this page, click the green **Code** button, then **Download ZIP**. Open the downloaded file to unzip it.
You'll get a folder called `fm-scoring-main`: move it somewhere you'll find it again, such as your Documents folder.

### 2. Install your AI assistant

Follow the install steps on [claude.com/claude-code](https://claude.com/claude-code) (or
[Codex's page](https://developers.openai.com/codex)). The first time it starts, it asks you to log in.

### 3. Double-click the Start file

In the `fm-scoring-main` folder, double-click:

- **Mac:** `Start FM Scoring (Mac).command`
- **Windows:** `Start FM Scoring (Windows).bat`
- **Linux:** `Start FM Scoring (Linux).sh`

The first time, your computer may warn you that it comes from the internet. That's expected: see
[Mac says it can't be opened](#mac-says-the-start-file-cant-be-opened) or
[Windows protected your PC](#windows-protected-your-pc).

A window opens and checks everything's ready, something like this:

```
  ✓  Python 3.13.1
  ✓  Claude Code installed
  !  No save set up yet
  !  53 of this project's 53 FM views, filters and schedules aren't in FM yet

What would you like to do?
   1  Set up my save with Claude Code (recommended)   <- press Enter
   2  Set up my save here instead: answer a few questions
   3  Put this project's views, filters and schedules into FM
   q  Quit
```

If Python's missing, it opens python.org instead: install it (on Windows, tick **"Add python.exe to PATH"** on the
installer's first screen), then double-click the Start file again.

### 4. Set up your save

Press **Enter**. Your assistant starts and asks you a few questions:

- **Which club you manage.** Type the name **exactly as FM shows it in its tables**, e.g. "Man Utd", not "Manchester United".
- **Your club's division**, again exactly as FM shows it, e.g. "Sky Bet League One".
- **Where your screenshots are saved.** If you're not sure, take a screenshot and see where it appears:
  - **Mac:** ⌘ Shift 4, then drag over the area. Screenshots go to your Desktop unless you've changed it.
  - **Windows:** Windows key + Print Screen. Screenshots go to Pictures → Screenshots.
- **Which currency** FM shows wages in (£, €, $…).

It saves your answers, so you only do this once per save. It also offers to put this project's views into FM (next step).

### 5. Put the views into FM

The assistant only knows what your screenshots show, so FM's player lists need the right columns. This project
comes with ready-made FM views, search filters and training schedules. To add them to FM, **close FM first**, then
either say yes when your assistant offers, or choose **3** in the Start window. Both copy them into FM's folders,
and never replace any of your own views, filters or schedules without asking. Then start FM again so it picks them up.

| View | Use it on | Columns |
|---|---|---|
| `attribs_outfield` | your squad screen | Name, Age, Left Foot, Wage and the outfield attributes |
| `attribs_gk` | your squad screen | Name, Age, Left Foot, Wage and the goalkeeping attributes |
| `player_search_outfield` | player search, shortlists | Name, Club, Age, Left Foot, Wage, Transfer Value and the outfield attributes |
| `player_search_gk` | player search, shortlists | the same for goalkeepers |
| `division_outfield` | a whole-league search (for the charts page) | the search view plus Division, Minutes and Average Rating |
| `division_gk` | a whole-league search of keepers | the same for goalkeepers |
| `staff_everything` | staff search | Person, Preferred Job, Club, Personality and every staff attribute |

In FM, you pick a list's view from the view options above it. The search filters (player positions such as
`cb` and `wb left`, staff jobs such as `physio` and `scout`; `league_outfield_players` and `league_gk` for a whole league)
show up in FM's search screens under their file names.

If you'd rather make your own views, these are the attributes they need:

- **Outfield:** Acceleration, Agility, Anticipation, Balance, Composure, Concentration, Crossing, Decisions, Dribbling,
  Finishing, First Touch, Heading, Jumping Reach, Natural Fitness, Off The Ball, Pace, Passing, Positioning, Stamina,
  Strength, Tackling, Teamwork, Vision and Work Rate.
- **Goalkeepers:** Acceleration, Aerial Reach, Agility, Anticipation, Balance, Command of Area, Communication, Composure,
  Concentration, Decisions, Dribbling, Handling, Jumping Reach, Kicking, Natural Fitness, One on Ones, Pace, Passing,
  Positioning, Reflexes, Stamina, Strength, Throwing, Vision and Work Rate.
- **Whole league** (for the charts page): the search view plus Division, Minutes and Average Rating.

### 6. Take your first screenshots

1. In FM, open your **squad** screen with the outfield view.
2. Screenshot it. Scroll down and screenshot again until you've covered every player.
3. Switch to the goalkeeper view and screenshot your keepers.

Keep **FM's date** (top right) and **your club's crest** (top left) in every screenshot. That's how the
assistant knows when each one was taken.

Then tell your assistant:

> New screenshots.

It reads them, saves the players, and opens your pages in your web browser.

---

## Using it

Whenever you want to add players, screenshot them in FM and tell your assistant **"new screenshots"**. For example:

- **A transfer search:** screenshot the results to compare everyone it finds.
- **A shortlist or scouting list.**
- **A whole league:** screenshot every player in a division, with Minutes, Average Rating and Division showing.
  That fills the charts page, so you can see how your squad compares. Until you do, the charts page uses the
  shared English leagues in `leagues/` (Premier League to the National Leagues, January 2030, names hidden).
- **Staff searches:** coaches, scouts, physios and so on, with the staff view.
- **Your squad again later:** re-screenshot it every few months of game time to see who's improving.

The assistant tells you about notable players each time. It's worth checking a few numbers against FM
now and then, because a misread number is the most likely mistake.

### The pages

Press the number keys to move between pages, and **?** on any page for its keyboard shortcuts.

| Key | Page | What's on it |
|---|---|---|
| 1 | Your squad | Every player at your club, scored for each position |
| 2 | Elsewhere | Every other player you've screenshotted |
| 3 | Last | Just the players from your latest screenshots |
| 4 | Filters | Your best players per position, and minimum attributes to search FM for players better than them |
| 5 | Charts | Your squad against a whole league: scores, key attributes and ratings |
| 6 | Staff | Every staff member you've screenshotted, scored for each job |
| 7 | Last staff | Just the staff from your latest staff screenshots |
| 8 | Staff filters | Your best staff per job, and minimum attributes to search FM for staff better than them |

Click a column heading to sort by it, and double-click a player to see their history. Type in the box at the top
to filter: for example, `age<=21 best=CB` shows centre-backs aged 21 and under.

To open the pages yourself, double-click the Start file and choose **2**, or ask your assistant to "open my squad page".

### Coming back later

Double-click the Start file and press **Enter** to talk to your assistant. Then carry on with "new screenshots".

### Starting another save

Tell your assistant "help me set up a new save" again. Each save keeps its own players. To switch between saves,
ask it to "switch to my <club> save".

### Updating to a newer version

Your save data lives in the `saves` folder and your settings in `config.toml`, both inside the project folder.
Download the ZIP again, unzip it, and copy `saves` and `config.toml` from your old folder into the new one. Then use
the new folder's Start file. (If you used `git clone`, run `git pull` in the folder instead.)

---

## If something goes wrong

### Mac says the Start file can't be opened

Macs block files downloaded from the internet until you say they're OK. You only need to do this once:

1. Double-click the Start file and click **Done** on the warning.
2. Open **System Settings → Privacy & Security** and scroll down to **Security**. Next to the message about
   `Start FM Scoring (Mac).command`, click **Open Anyway**, then confirm.

On macOS 14 (Sonoma) or older, you can instead Control-click the file, choose **Open**, then **Open** again.

If double-clicking opens the file in a text editor instead, it's lost its "can be run" setting (some unzip apps do
this). Open Terminal, type `chmod +x ` (with the space), drag the Start file into the Terminal window, and press Enter.

### Windows protected your PC

Windows warns about files from the internet. Click **More info**, then **Run anyway**. If you see an
"Open File – Security Warning" instead, click **Run**.

### Python is installed, but the Start file says it isn't

- **Windows:** run Python's installer again, choose **Modify**, and make sure **"Add Python to environment variables"**
  is ticked. If that doesn't help, open **Settings → Apps → Advanced app settings → App execution aliases** and
  turn off the two **python** entries (they point at the Microsoft Store, not your Python).
- **Mac:** the `python3` that comes with Apple's developer tools is too old. Install Python from
  [python.org](https://www.python.org/downloads/).

### It says no AI assistant was found, but I use the Claude desktop app

That's fine. In the desktop app, open the project folder (in Claude Code, choose a folder to work in) and type
"Help me set up a new save." Everything else works the same.

### It can't find FM's folder

Start FM27 once and quit it: FM creates the folder on its first run. If you've moved FM's user data somewhere
unusual, tell your assistant where it is and it will remember.

---

## Prefer the terminal?

If you're happy with a terminal and Git, you can clone instead of downloading the ZIP, and start your assistant
yourself:

```
cd Documents
git clone https://github.com/Brewer1293/fm-scoring.git
cd fm-scoring
claude
```

Use `codex` instead of `claude` if that's your assistant. Then say "Help me set up a new save." With Git installed,
your save data also keeps a history, so the Last pages can step back through earlier screenshot sets (**b** / **B**).
`python3 start.py` opens the same menu as the Start file.

---

## How the scores work

Each position has a list of attributes that matter for it, each with a weight. A player's position score is the
weighted average of those attributes, on FM's 1–20 scale. **vs Age** compares their best score with what's
typical for their age: 100% means they're on track to be a high-end Championship or low-end Premier League
player in their prime, once fully developed. More than 100% means they're ahead of that.

The weights are in the `weights` folder. Ask your assistant if you want to change what matters for a position.
