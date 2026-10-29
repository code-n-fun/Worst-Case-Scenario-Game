# Worst Case Scenario

A responsive multiplayer party game for 2–8 players, built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix UI components, Framer Motion, Zustand, and Supabase.

## Quick start

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The **Take it for a spin** button plays a complete offline demo with two explicitly labeled bots. Multiplayer never falls back to bots silently.

## Connect multiplayer

1. Create a Supabase project.
2. Enable **Authentication → Providers → Anonymous Sign-Ins**. There is no signup form; anonymous sessions identify returning browsers.
3. Run `supabase/migrations/001_party.sql` once, then run `supabase/community/02_tables.sql` through `17_lounge_unread.sql` separately in numerical order. File 13 is a read-only check. If you already ran these scripts successfully, do not repeat setup.
4. The current game already has its public project connection configured in `src/lib/project-config.ts`. Players do not configure anything. To move to a different project, the owner can edit that public configuration or set BOTH deployment values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Never put a service-role or secret key in a `NEXT_PUBLIC_` variable. The game needs no service-role key.

5. If changing the project configuration, restart/rebuild the app. Create a room in one browser and join its code from another device or browser profile. Separate tabs in one browser profile share the same guest identity; use different profiles for distinct players.
6. With three or more devices, play through writing, voting, results, and all five rounds. Verify reconnects on an actual mobile network before a public launch.

A local `.env.local` is ignored by Git and by the downloadable source archive. The shared project configuration is bundled with the website and automatically used by every browser. There is no player-facing connection form and no per-browser backend preference. Old browser connection settings are ignored. Only public publishable/anon keys are supported; secret/service-role keys are rejected. Deployment overrides must provide both values together.

## Deploy on Vercel

1. Push this source to a Git repository and import it into Vercel as a **Next.js** project.
2. The included shared public connection works by default. To override it, add BOTH public Supabase environment variables above to the desired Vercel environments.
3. Deploy with `npm run build`. The application uses Next.js static export; persistent data and realtime connections live in Supabase, with no process-local room state on Vercel.
4. If enabling Supabase Auth CAPTCHA, add an explicit challenge UI before guest sign-in; the current build has no CAPTCHA widget. Configure Auth rate limits for the launch audience.
5. Rebuild/redeploy after changing `NEXT_PUBLIC_` variables, because Next.js embeds them into the browser bundle at build time.

The repository includes `vercel.json`. No Vercel account or Supabase project is provisioned automatically by this source. The current ChatGPT-hosted preview retains its existing viewer access policy; Vercel hosting is separate.

## Game rules

- Required nicknames, four-letter room codes, 2–8 active players.
- Five rounds: 5-second prompt reveal → 90 seconds writing → 30 seconds voting → host-controlled results.
- Each player receives three distinct random items. Item use is a social rule, not keyword validation.
- Plans lock on submit. Votes lock on first successful submission. No self-voting.
- Votes determine round wins. Match standings count round wins, not total votes. A round win awards 10 coins, three wins in one match award a one-time 15-coin bonus, and the most round wins earn the 30-coin match bonus. Tied winners each receive the reward. Zero-vote rounds have no winner. Two-player practice cannot earn coins or competitive wins.
- Writing/voting end early when everyone eligible has submitted/voted.
- Late joiners wait until the next round. A refreshed browser retains its guest membership and unfinished local draft.
- Browser sessions are not portable: another browser/device cannot reclaim a nickname without the original session. Clearing browser storage loses the guest identity.
- Disconnected players remain round participants; their missing actions are skipped at the deadline. After 45 seconds without the creator's heartbeat, the room closes (requires scripts 14-17).
- Finished games return to the lobby and reset match standings when the host chooses Play Again. Coins and permanent unlocks are preserved for the current identity.

## Synchronization and privacy

Postgres is authoritative. `party_action` applies per-identity throttling, delegates validated actions, and returns a player-specific snapshot. Room row locks serialize transitions, joins, submissions, and scores. Unique constraints and score events prevent duplicate voting/scoring. Private database Broadcast sends only a changed-version notification, not raw plans or identities. Clients reload permission-filtered snapshots and ignore stale versions.

Heartbeat/polling is a recovery path if a Broadcast packet is missed. Snapshots include server time for clock-offset correction. No timer can change the database based on a device's local clock. Expired phases advance when a connected client checks in; if every browser is closed, the next client catches the room up. There is no continuously running timer server.

Clients cannot read or mutate raw tables. Before voting, only the caller's plan is returned. Author identities are withheld from voting projections; self-identification is provided solely to disable one's own vote option. Author names and vote totals appear at results. A room code is an invitation and is not a high-security password.

## Operations and free-tier considerations

- This is designed for small party rooms, not an unlimited number of concurrent rooms. Supabase free-tier quotas, connection limits, and project suspension policies still apply.
- Rooms expire after six hours. Schedule `delete from public.rooms where expires_at < now();` daily with Supabase Cron to remove expired rooms and cascading game data.
- Also prune old throttle entries: `delete from public.party_rate_limits where window_start < now() - interval '1 day';`.
- Review Supabase anonymous-user cleanup and Auth abuse controls for a public launch. Throttling is per guest identity, not per IP, and cannot prevent automated creation of new identities by itself.
- No paid AI service, external fonts, or external image dependency is required. Scenarios and items are curated; server-side assignments are stored permanently for each round.

## Validation

```bash
npm test
npm run typecheck
npm run build
```

Vitest runs the real SQL migration in PGlite (embedded Postgres), with Supabase Auth/Realtime functions stubbed. Tests cover private projections, RLS, host permission and handoff, room capacity, late joins, scoring idempotency, self-vote rejection, a full eight-player five-round game, timeout recovery, expiry, reconnect identity, throttling, and the demo lifecycle.

The embedded tests validate database rules; they do not replace live Supabase Broadcast delivery, Auth configuration, or real multi-device network testing. A Supabase project is required to verify those integrations.

## Project structure

- `src/app/page.tsx` — responsive lobby and game screens
- `src/app/globals.css` — Tailwind entry, custom visual system, responsive layouts
- `src/components/ui/button.tsx` — shadcn-style Radix Slot/CVA button
- `src/lib/client.ts` — automatic Supabase anonymous session, actions, private channel, reconnect
- `src/lib/project-config.ts` — owner-managed public connection shared by every player
- `src/lib/store.ts` — versioned Zustand snapshots
- `src/lib/demo.ts` — explicitly offline bot demo
- `supabase/migrations/001_party.sql` — schema, authorization, state machine, score events
- `tests/` — database integration and demo lifecycle checks

The room infrastructure is separate from the browser UI, so additional party games can later share identities, invites, and connection handling. This release implements Worst Case Scenario only.

## Community interface

- Public room directory with host, title, occupancy, and Join / Join Next Round.
- Public lounge and room chat with clickable invitations, reports, blocks, and per-message sender identifiers. Room chat is read-only during prompt/writing/voting.
- Lobby host settings for public/private visibility, room title, and optional item rerolls.
- Coin shop: one private 10-coin hint per round, one 20-coin reroll when host-enabled, Goose Negotiator badge, and match-victory sparkles. Coin history and permanent unlocks are visible.
- The offline demo simulates victory rewards and purchases; it does not fake live chat or public rooms.
- Live mode uses the RPCs in supabase/community. Realtime room chat shares the existing room subscription so it does not replace game-state delivery.
- Anonymous wallets are tied to the current browser's Supabase guest session. Account linking and cross-device wallet recovery are not implemented.
- Reporting records an operator-review request; there is no automatic moderation or operator dashboard. Scenario packs remain unavailable until their content is implemented.

Community database verification can also be run with `node scripts/verify-community.mjs`.

## Creator-owned rooms and message notifications

Existing projects must run `supabase/community/14_room_events.sql` through
`17_lounge_unread.sql` once, in numerical order, to enable the new server rules.
These scripts are additional to the original setup; do not rerun 001_party.sql.

- The room creator's Leave button closes the room for everybody immediately.
- Closing the browser or losing the creator connection closes the room after
  a 45-second heartbeat grace period; a quick reconnect remains possible.
- No ownership handoff occurs. Closed rooms disappear from the public list and
  reject joins, including direct invite codes.
- Other player departures generate room notices, including timed-out players.
- The global Messages icon shows a red unread lounge badge even during a game.
  Own messages and blocked senders do not count. Viewing the latest messages in
  a visible lounge clears the badge; read positions persist per guest identity.
- Realtime is backed by periodic refreshes. Room departure events are durable
  and deduplicated; returning tabs can catch up from stored event positions.
- No operating-system/browser notification permission is requested. These are
  in-app notifications; they appear while the website is open.

Until scripts 14–17 are applied, the new UI uses a limited recent-message
fallback for lounge badges, but the old server still transfers room ownership.
The public browser key cannot install database functions or triggers. Apply the
scripts as the project owner via Supabase SQL Editor or an authorized migration
connection. Keep public room policies and per-player reads in place.

## Social messaging and Peek update

Apply community scripts 18 through 29, one file at a time in numerical order,
after scripts 14-17. Every new file is below 3 KB. The frontend can be deployed
first, but direct messages, search, replies/reactions, and Peek activate only
after the database update. No player needs connection settings.

Messages now includes an Everyone channel, online player search, and direct
conversations. Search accepts a nickname plus a room name/code filter. Players
are shown with an ID suffix to distinguish duplicate nicknames. Private-room
locations are disclosed only to members of those rooms. People in the lobby
appear after choosing a nickname, with presence refreshed while the page is
visible. A stopped heartbeat removes a person from online search after a minute.

Direct messages are scoped to sender and recipient, with a private personal
Realtime channel and polling fallback. Messages support Unicode emoji, replies
within the same channel/conversation, and eight toggleable emoji reactions.
Unread direct-message counts are server-backed and combined with the existing
lounge badge. Blocking prevents further direct messages in both directions;
reporting records a review request for the operator, without an automated
moderation service. Persistent wallets and identity remain browser-session
based; nickname matching is not identity verification or account recovery.

Peek costs 15 earned coins and reveals ONE item from a selected player's kit.
It is available once per round during writing, before the buyer submits. It
never reveals plans or votes. The purchase is idempotent, stored privately,
and restored after refresh in the same round. First Responder is the new visible
name for the existing badge; old badge ownership is preserved.

The new dark visual theme and abstract escape-door illustration are in
src/app/modern.css and the home page. No external image or font download is
required. src/components/direct-thread.tsx and message-tools.tsx contain the
social UI. SQL privacy, reply boundaries, reactions, unread counts, and Peek
purchase protection are covered by tests/social.test.ts.

## Daily check-in gifts

Run `supabase/community/30_daily_reward_status.sql`, then `31_claim_daily_reward.sql`.
The header's **Daily gift** button opens the coin shop with a claim card. A player's
first claim awards 6 coins; later UTC days offer 2 coins. The welcome gift replaces
the daily gift on that first day. Missing days never accumulate. Existing players
can also claim a welcome gift without resetting their wallet.

Claims use a per-identity row lock, a unique identity/day receipt, and the existing
transactional ledger. Browser time cannot determine eligibility. Reading status
never issues coins. Duplicate claims return zero and the current balance.
Guest identities can be recreated, so these checks prevent repeat claims for the
same identity, not abuse across new identities. All rewards remain virtual.
This update does not enable credit staking or change existing match rewards.

## Leaving during a match

Apply `32_departure_fees.sql` then `33_match_leave_penalty.sql` after the earlier
community updates. An explicit Leave during an unfinished match transfers up to
3 coins from the active round participant to the protected platform coin ledger.
The confirmation explains the fee and the insufficient-balance rule. There is
no negative balance, and a zero balance produces a zero-value receipt. A unique
user/match receipt prevents a second charge after rejoining the same match.
Lobbies, completed matches, waiting spectators, offline demos, and automatic
connection timeouts have no fee. The host pays only their own fee when leaving;
other players are not charged when that closes the room.
This is a virtual-coin transfer, not cash revenue.

## Launch cleanup

As the project owner, run `supabase/maintenance/launch_cleanup.sql` once in the
Supabase SQL Editor after community scripts 02–33. It is deliberately outside
the migrations folder and is never executed by the browser or normal deployment.
It archives social records in the owner-only `launch_backup` schema, clears
messages and presence up to the fixed cutoff 2026-10-29 20:33:53 UTC, and expires
rooms created before that cutoff. Reports associated with removed messages
cascade; their archive is retained. ID sequences and read cursors are preserved.
Wallets, purchases, reward eligibility, platform receipts, guest identities,
nicknames, authored scenarios, and items are preserved. No balances are reset.
A completion marker prevents repeated cleanup. Newer messages and rooms survive.
This script requires owner SQL access; a public publishable key cannot run it.

The solo demo remains opt-in and explicitly marked as offline with bots.
All public rooms and conversations use actual database records, without seeded
players or fake activity. Publishing source does not run SQL migrations.
The proposed credit exchange and ranked entry pools are not enabled.

## Verified departure and wallet refresh fix

Apply `34_verified_leave.sql` after scripts 32–33. Online departures now use
`leave_room`, which returns a server-confirmed debit and remaining balance. It
rolls back an eligible departure if the platform receipt is missing. Old clients
still use the original leave action; the new client requires the verified RPC.
Retries do not charge twice. Returning to the same match does not create another
fee; the confirmation now describes the once-per-match rule.

Wallet refresh listens for settlement and room-closure events, ignores stale
responses, and reloads when entering or leaving the offline demo. A creator's
room-closure broadcast cannot discard their own confirmed fee receipt.
The public frontend cannot install SQL; missing RPCs are reported instead of
pretending that a charged exit succeeded.
