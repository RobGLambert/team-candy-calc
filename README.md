# Candy Calc — Team Builder edition

A fork of [richi3f/candy-calc](https://github.com/richi3f/candy-calc) that plans a
whole party at once, aimed at Pokémon Legends: Z-A.

Upstream answers "how much candy does *this* Pokémon need?". This fork answers
"how much candy does my *team* need, and what does that cost in Mega Shards?".

## What changed

| | Upstream | This fork |
|---|---|---|
| Scope | One Pokémon | Up to 6 party slots |
| Solver | GLPK mixed-integer LP in the browser | Exact dynamic program |
| Dependencies | jQuery + `glpk.min.js` + `problem.txt` | None |
| Candy sizes | All five, always | Toggle for the S/M/L sold at Quasartico Inc. |
| Output | Candy counts | Per-Pokémon counts, party totals, Mega Shard price |
| Worst-case solve | Seconds, with a 60s timeout guard | ~10 ms |

Removed: `static/glpk.min.js`, `problem.txt`, the jQuery CDN tag.
Unchanged: `static/pokemon.json` (1,126 species and their Exp. groups).

## How the solver works

Every Exp. Candy yield is a multiple of 100, so the problem is counted in units
of 100 Exp. That turns it into a small unbounded knapsack:

- **Yields (units):** XS 1, S 8, M 30, L 100, XL 300
- `count[u]` = fewest candies that sum to *exactly* `u` units
- The table runs to `target + largest yield`, since overshooting by a whole
  candy is never optimal
- Pick the smallest feasible `u ≥ target` (least Exp. wasted), breaking ties on
  fewest candies, then walk the table back to recover the individual counts

This reproduces upstream's objective — `min Σ (yieldᵢ + 1) · cᵢ` is really
"waste the least Exp., then use the fewest candies" — but exactly and instantly,
and it handles the XS-excluded case where not every unit total is reachable.

`test.js` brute-forces 584 scenarios against the DP to confirm both halves of
that objective, and checks the six Exp. curves against published Lv100 values.

## Z-A shop reference

Quasartico Inc. sells three sizes for Mega Shards. M and L unlock in the
post-game.

| Candy | Exp. | Mega Shards |
|---|---|---|
| Exp. Candy XS | 100 | not sold |
| Exp. Candy S | 800 | 8 |
| Exp. Candy M | 3,000 | 30 |
| Exp. Candy L | 10,000 | 100 |
| Exp. Candy XL | 30,000 | not sold |

All three sold sizes are a flat 100 Exp. per shard, so which size you buy makes
no difference to the price — the only way to spend fewer shards is to waste less
Exp. That is exactly what the solver minimises.

## Running it

Open `index.html` directly, or serve it:

```sh
python3 -m http.server   # then http://localhost:8000
```

GitHub Pages works as-is: Settings → Pages → deploy from `master`.

### Deploying

Three files must sit next to `index.html` or the autocomplete will be empty:

```
index.html
.nojekyll                  stops GitHub Pages running the site through Jekyll
static/style.css
static/script.js
static/pokemon-data.js     the species list, as a plain script
static/pokemon.json        source data; only used by the fetch fallback
```

The species list ships as `static/pokemon-data.js`, a plain `<script>` rather
than a `fetch()`. That removes every runtime failure mode — Jekyll, MIME types,
CORS, caching, `file://` URLs — that can leave the name suggestions silently
empty. `static/pokemon.json` is still the source of truth; regenerate after
editing it:

```sh
node gen-dex.js
```

If the list ever fails to load, the page says so above the party grid instead of
just showing a dead autocomplete box, and the six slots still render.

### Tests

```sh
npm install jsdom
node test.js          # solver vs. brute force, plus Exp. curve values
node ui-test.js       # DOM behaviour against the bundled build
node deploy-test.js   # serves the repo over HTTP and checks a real deploy
node build.js         # bundle into one self-contained HTML file
```

## Known limits

- **No bag constraints.** It assumes you can get as much candy as you need. The
  "what's already in my satchel" input from upstream isn't wired up yet; see below.
- **Full National-style species list.** Not filtered to the Z-A dex.
- **No Rare Candy.** Same reason as upstream: their yield scales with level, so
  they don't fit a linear model. Lower the target level by the number of Rare
  Candies you plan to feed, and use those *after* the Exp. Candy.
- Mega Shards cap at 9,999, so a full party plan can exceed what you can hold in
  one go.

## Possible next steps

- A shard budget: "I have 4,000 shards — how far does that get my team?"
- Bag constraints. Per-Pokémon solves are independent, so a shared, scarce bag
  turns this into a joint allocation problem. A sequential greedy pass (largest
  Exp. requirement first) would cover most real cases.
- Filter the species list to the Z-A dex.
- Shareable team URLs via a query string.

## Licence

MIT, as upstream. Pokémon is © Nintendo, 1995–2025.