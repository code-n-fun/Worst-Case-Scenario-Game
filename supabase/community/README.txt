WORST CASE SCENARIO — COMMUNITY + WINNER REWARDS

Prerequisite: the complete original 001_party.sql must already have succeeded.
These are ADDITIONAL scripts. Do not paste or run 001_party.sql again.

HOW TO APPLY
1. Extract this ZIP.
2. In Supabase SQL Editor, create a new query.
3. Open 02_tables.sql in a text editor. Copy ALL its contents into the query.
4. Clear text selection, then Run. Wait for success.
5. Repeat for 03, 04, 05, ... 12, in numeric order. Each file is under 4 KiB.
6. If a file fails, stop. Keep the exact error and file name. Each file uses a
   transaction, so a failure should not leave half of that file applied.
7. Run 13_verify_setup.sql to confirm the functions and tables exist.

These scripts were tested against the supplied 001_party.sql in embedded
PostgreSQL, with Supabase Auth/Realtime stubs. 29 checks passed: room visibility,
chat access, blocking/reporting, round-chat restrictions, a complete five-round
match, round-win standings, coin rewards, hint and reroll purchases, duplicate
purchase/reward protection, permanent unlocks, replay, and privilege restrictions.
They have NOT been applied to your live project by ChatGPT.

RUN ORDER
02_tables.sql                  Additional columns and protected tables
03_public_rooms.sql            Nicknames, host room settings, room browser
04_chat_send.sql               Room/lounge messages and room invites
05_chat_read_and_safety.sql     Message reading, blocking, reporting
06_wallet_function.sql         Internal transactional coin ledger
07_round_rewards.sql           10 coins per win, 15 bonus at three wins
08_match_rewards.sql           30 coins for overall victory; automatic triggers
09_shop_effects.sql            Private creative hints and actual item rerolls
10_shop_purchase.sql           Validated spending; duplicate purchase protection
11_wallet_read.sql             Balance, purchase catalog, unlocks, history
12_game_snapshot.sql           Standings by round wins; coins/hints in snapshots
13_verify_setup.sql            Read-only setup check

REWARD RULES
Votes select the round winner. Votes themselves award NO coins.
Tied round winners receive a win and 10 coins each, provided the top vote count
is greater than zero. The three-win bonus is awarded once per match.
The overall winner has the most round wins; tied overall winners each receive
30 coins. The match bonus is credited when the final round resolves, without
waiting for the host to click Next. A player winning all five rounds earns
95 coins before purchases: 50 + 15 + 30.
Two-player rounds are practice: no spendable coins or competitive round wins.
Coins and permanent unlocks survive replay and expired-room deletion.
Existing completed rounds are not retroactively rewarded.

SHOP
Creative hint: 10 coins; one per player per round, while writing, before submit.
Hints are curated creative guidance, not AI-generated answers.
Item reroll: 20 coins; one per player per round; host must enable it in lobby.
Goose Negotiator badge: 50 coins; permanent unlock.
Victory sparkles: 100 coins; permanent unlock.
Cosmetic purchases record ownership; frontend rendering is still required.
Scenario packs are deliberately not for sale until playable content exists.

FRONTEND INTEGRATION
The updated source includes the room directory, lounge, room chat, wallet, shop,
cosmetics, block/report controls, and host settings. Deploy the updated source
and configure your public connection; SQL alone cannot update an older website.
Existing party_action calls still work; player.score now counts round wins,
player.voteScore preserves the earlier total, and coins/hint fields are added.

RPC EXAMPLES (JavaScript using an anonymously authenticated Supabase client)
await supabase.rpc('community_profile', {p_nickname: 'Goose Whisperer'});
await supabase.rpc('room_settings', {
 p_code: 'ABCD', p_public: true, p_title: 'Goose squad', p_rerolls: false
});
await supabase.rpc('list_public_rooms');
// Join a listed room through the existing party_action('join', ...) flow.
await supabase.rpc('chat_send', {
 p_body: 'Join our game!', p_room_code: null, p_invite_code: 'ABCD'
});
await supabase.rpc('chat_read', {p_room_code: null, p_after: 0});
// Null room_code means the public lounge; a real code means room chat.
await supabase.rpc('chat_block', {p_user: senderId, p_block: true});
await supabase.rpc('chat_report', {p_message: messageId, p_reason: 'Spam'});
await supabase.rpc('wallet_read');
await supabase.rpc('shop_buy', {p_sku: 'creative_hint', p_room_code: 'ABCD'});
await supabase.rpc('shop_buy', {
 p_sku: 'item_reroll', p_room_code: 'ABCD', p_item: 0
});
await supabase.rpc('shop_buy', {p_sku: 'goose_badge'});

All these RPCs need a guest/authenticated session. Calling them directly from
the SQL Editor as an admin without a user JWT will return a sign-in error.
Check both data and error from RPC responses. Render chat as plain text in
React, never as untrusted HTML. Invites are clickable buttons using invite_code.

REALTIME
Use private channel community:lounge, event chat_changed, to invalidate the
lounge message list. For room chat, the existing room:ABCD private channel uses
the chat_changed event. Reload chat_read when notified, and periodically or on
reconnect as a fallback. Broadcast never contains full message bodies.
chat_read returns the newest 50 unblocked messages, in chronological order.
Use overlap/deduplicate by message id; p_after is optional for incremental reads.
Coin balances refresh through party_action snapshots or wallet_read.

OPERATIONS
Rooms start PRIVATE. Only the host can publish them.
Room chat is read-only during prompt, writing, and voting.
Messages are limited to one per 2 seconds and 15 per minute per guest identity.
Blocking filters messages for the blocker. Reports are recorded for an operator
to review in Supabase; there is no automatic moderation or admin review UI yet.
Consider periodic chat retention cleanup, Auth anti-abuse settings, and operator
review before a public launch. Guest identities can be recreated, so per-user
limits alone cannot stop determined abuse.
A guest wallet belongs to its Supabase user ID, not to the nickname. Clearing
browser storage loses access unless the identity was linked to a recoverable
account. Cross-device wallet recovery/account-linking UI is not implemented.
