/**
 * scripts/seed.ts
 * Ports your TestData.gs into Firestore.
 * Run with: npx tsx scripts/seed.ts
 * Delete with: npx tsx scripts/seed.ts --delete
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { config } from 'dotenv'

// Load .env.local
config({ path: '.env.local' })

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = getFirestore()
const TEST_MARKER = '[TEST_DATA]'

// ─── Ported directly from your TestData.gs ───────────────────────────────────

const TEST_SUGGESTIONS = [
  { category: 'Discord',                    type: 'Improvement',       suggestion: 'Add a cleaner LFG format so people include rank, class, platform, availability, and vibe before posting.',      why: 'It would make squad-finding faster and cut down on messy posts like anyone on with no useful info.',      username: 'sweatlab_goober',    extra: 'Could tie into free-agent and squad-up channels.',         source: 'Discord',                              status: 'New',      notes: 'Core LFG cleanup test case.' },
  { category: 'Discord',                    type: 'Improvement',       suggestion: 'Add a free-agent template for people looking for squads.',                                                        why: 'People would know exactly what info to include.',                                                         username: 'ranked_rat',         extra: 'Could be a copy-paste format.',                            source: 'Discord',                              status: 'New',      notes: 'Related to LFG format.' },
  { category: 'Discord',                    type: 'Community request',  suggestion: 'Pin a squad-up example post so people can copy the format.',                                                     why: 'It would reduce low-effort posts.',                                                                       username: 'goober_commander',   extra: 'Put it in squad-up.',                                      source: 'Discord',                              status: 'Active',   notes: 'Good candidate for a pinned message.' },
  { category: 'Live stream',                type: 'Improvement',       suggestion: 'Add a stream command for the weekly schedule.',                                                                   why: 'People keep asking when the next stream is.',                                                             username: 'chatlurker',         extra: '!schedule maybe.',                                         source: 'Stream chat',                          status: 'Done',     notes: 'Easy bot command.' },
  { category: 'Video / Shorts',             type: 'Content idea',      suggestion: 'Make clip titles clearer in the first few words.',                                                               why: 'It could improve retention on Shorts.',                                                                   username: 'clipfiend',          extra: 'Avoid vague hooks.',                                       source: 'YouTube video description',            status: 'Active',   notes: '' },
  { category: 'Live stream',                type: 'Community request',  suggestion: 'Do a viewer loadout review night.',                                                                              why: 'It gives chat something interactive to submit.',                                                          username: 'loadout_larry',      extra: 'Could be weekly.',                                         source: 'Twitch profile / About page',          status: 'Active',   notes: 'Needs format.' },
  { category: 'Discord',                    type: 'Rules / moderation', suggestion: 'Create a separate LFG rules channel.',                                                                          why: 'Rules would be easier to find.',                                                                          username: 'modmaybe',           extra: 'Could be read-only.',                                      source: 'Discord',                              status: 'Rejected', notes: 'Probably too many channels.' },
  { category: 'Website / links / resources',type: 'Problem / bug',     suggestion: 'The Discord invite link might be expired.',                                                                      why: 'New viewers may not be able to join.',                                                                    username: 'viewer123',          extra: 'Clicked from Twitch panel.',                               source: 'Twitch profile / About page',          status: 'New',      notes: '' },
  { category: 'Coaching / Sweat Lab',       type: 'Rules / moderation', suggestion: 'Add clear Sweat Lab submission rules before people submit VODs.',                                               why: 'It avoids incomplete submissions.',                                                                       username: 'vod_watcher',        extra: 'Need VOD link and timestamp.',                             source: 'Discord',                              status: 'New',      notes: '' },
  { category: 'Video / Shorts',             type: 'Improvement',       suggestion: 'Use consistent captions on Shorts with the same font and position.',                                             why: 'It would make the clips feel more professional.',                                                         username: 'caption_guy',        extra: 'Not too large.',                                           source: 'YouTube video description',            status: 'New',      notes: '' },
  { category: 'Discord',                    type: 'New idea',           suggestion: 'Add Discord roles for rank ranges so people can find similarly ranked teammates.',                               why: 'It makes LFG easier and less awkward.',                                                                   username: 'ranked_grinder',     extra: 'Bronze-Silver, Gold-Plat, Diamond+.',                      source: 'Discord',                              status: 'Active',   notes: '' },
  { category: 'Emotes / graphics',          type: 'New idea',           suggestion: 'Make an emote for goober panic when the squad gets wiped.',                                                     why: 'It fits the stream vibe.',                                                                                username: 'emote_enjoyer',      extra: 'Green slime face.',                                        source: 'Twitch profile / About page',          status: 'Active',   notes: '' },
  { category: 'Website / links / resources',type: 'Improvement',       suggestion: 'Put Discord and suggestion box links higher in YouTube descriptions.',                                           why: 'Viewers may not scroll far enough.',                                                                      username: 'yt_viewer',          extra: 'First two lines.',                                         source: 'YouTube video description',            status: 'New',      notes: '' },
  { category: 'Live stream',                type: 'Improvement',       suggestion: 'Add a chat command that posts the suggestion form link every so often.',                                         why: 'Viewers forget links exist.',                                                                             username: 'bot_buddy',          extra: 'Every 30 minutes maybe.',                                  source: 'Stream chat',                          status: 'New',      notes: '' },
  { category: 'Events / community games',   type: 'Community request',  suggestion: 'Host monthly community games with viewers.',                                                                    why: 'It gives the Discord a reason to stay active.',                                                           username: 'squad_host',         extra: 'Maybe Sunday.',                                            source: 'Discord',                              status: 'Active',   notes: '' },
  { category: 'Video / Shorts',             type: 'Improvement',       suggestion: 'Use fewer words on thumbnails and make the key phrase bigger.',                                                  why: 'Small mobile screens make long text unreadable.',                                                         username: 'thumbnail_n8',       extra: '2-4 words max.',                                           source: 'YouTube video description',            status: 'New',      notes: '' },
  { category: 'Discord',                    type: 'Improvement',       suggestion: 'Make channel descriptions more direct so people know what goes where.',                                         why: 'It reduces confusion and reposts.',                                                                       username: 'server_cleaner',     extra: 'Especially free-agent and squad-up.',                      source: 'Discord',                              status: 'Active',   notes: '' },
  { category: 'Live stream',                type: 'Improvement',       suggestion: 'Move the suggestion box panel higher on the Twitch about page.',                                                why: 'It is easy to miss if it is below too many panels.',                                                      username: 'panel_viewer',       extra: 'Put it under schedule.',                                   source: 'Twitch profile / About page',          status: 'New',      notes: '' },
  { category: 'Live stream',                type: 'Improvement',       suggestion: 'Add the suggestion link to the YouTube live description.',                                                       why: 'YouTube viewers may not see Twitch panels.',                                                              username: 'yt_live_guy',        extra: 'Different link source.',                                   source: 'YouTube stream page / description',    status: 'New',      notes: '' },
  { category: 'Discord',                    type: 'Rules / moderation', suggestion: 'Make LFG repost cooldowns clearer.',                                                                           why: 'People may repost because they do not know the rule.',                                                    username: 'cooldown_confused',  extra: '6-hour cooldown maybe.',                                   source: 'Discord',                              status: 'New',      notes: '' },
  { category: 'Video / Shorts',             type: 'Content idea',      suggestion: 'Let viewers suggest video topics, not just Discord changes.',                                                   why: 'Some feedback is better as content ideas.',                                                               username: 'yt_ideas',           extra: 'Tier lists, patch notes, loadouts.',                       source: 'YouTube video description',            status: 'New',      notes: '' },
  { category: 'Live stream',                type: 'Improvement',       suggestion: 'Use a consistent stream title format with ranked goal and game mode.',                                          why: 'New viewers know what the stream is about faster.',                                                       username: 'title_rat',          extra: 'Road to 250.',                                             source: 'Stream chat',                          status: 'Active',   notes: '' },
  { category: 'Website / links / resources',type: 'New idea',          suggestion: 'Let suggestions have statuses like active, done, duplicate, or rejected.',                                     why: 'It helps track what happened after someone submits.',                                                     username: 'feedback_loop',      extra: 'Exactly like this tool.',                                  source: 'Discord',                              status: 'Active',   notes: '' },
  { category: 'Events / community games',   type: 'New idea',          suggestion: 'Use a simple RSVP format for community games.',                                                                 why: 'It helps know who is showing up.',                                                                        username: 'event_nasty',        extra: 'Maybe Discord event.',                                     source: 'Discord',                              status: 'Active',   notes: '' },
  { category: 'Discord',                    type: 'Improvement',       suggestion: 'Use the suggestion box art as a clickable image or button in Discord.',                                        why: 'It keeps the art visible while sending people to the form.',                                              username: 'art_enjoyer',        extra: 'Could go in welcome or resources.',                        source: 'Discord',                              status: 'New',      notes: '' },
  { category: 'Website / links / resources',type: 'Improvement',       suggestion: 'Use separate prefilled links so the spreadsheet tracks where each suggestion came from.',                      why: 'It shows whether Twitch, YouTube, Discord, or stream chat actually gets used.',                           username: 'analytics_goober',   extra: 'Source should stay prefilled.',                            source: 'Twitch profile / About page',          status: 'Active',   notes: '' },
  { category: 'Discord',                    type: 'New idea',          suggestion: 'Add a no-mic tag so people can be clear when they are not using voice.',                                       why: 'It avoids mismatched expectations.',                                                                      username: 'silent_player',      extra: 'Maybe @No Mic.',                                           source: 'Discord',                              status: 'Duplicate',notes: 'Covered by vibe field.' },
  { category: 'Live stream',                type: 'Improvement',       suggestion: 'Add the weekly schedule graphic to Twitch panels.',                                                             why: 'People can quickly see when you go live.',                                                                username: 'schedule_guy',       extra: 'Road to 250 caption.',                                     source: 'Twitch profile / About page',          status: 'Done',     notes: 'Done in panel draft.' },
  { category: 'Discord',                    type: 'Question',          suggestion: 'Can moderation suggestions stay private?',                                                                      why: 'People might not want to call someone out publicly.',                                                     username: 'quiet_mod',          extra: 'Form helps with that.',                                    source: 'Discord',                              status: 'Active',   notes: '' },
  { category: 'Video / Shorts',             type: 'Improvement',       suggestion: 'Make a few hashtag presets for common clip types.',                                                             why: 'It saves time when posting clips.',                                                                       username: 'hashtag_helper',     extra: '#bf6 #redsec etc.',                                        source: 'YouTube video description',            status: 'Active',   notes: '' },
]

// ─── Helpers (same logic as your Apps Script) ─────────────────────────────────

function makeTitle(text: string): string {
  const cleaned = (text || '').trim()
  if (!cleaned) return 'Untitled suggestion'
  const first = cleaned.split(/[.!?]/)[0].trim()
  const t = first || cleaned
  return t.length <= 58 ? t : t.slice(0, 57).trim() + '…'
}

function makePreview(text: string): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  return t.length <= 120 ? t : t.slice(0, 119).trim() + '…'
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Inserting ${TEST_SUGGESTIONS.length} test suggestions into Firestore…\n`)

  const batch = db.batch()
  const now = Date.now()

  TEST_SUGGESTIONS.forEach((item, i) => {
    const ref = db.collection('suggestions').doc()
    // Spread timestamps so they appear in order (oldest first)
    const timestamp = new Date(now - (TEST_SUGGESTIONS.length - i) * 11 * 60 * 1000)

    batch.set(ref, {
      timestamp,
      category:      item.category,
      type:          item.type,
      suggestion:    item.suggestion,
      why:           item.why,
      username:      item.username,
      extra:         item.extra,
      source:        item.source,
      status:        item.status,
      internalNotes: item.notes ? `${TEST_MARKER} ${item.notes}` : TEST_MARKER,
      preview:       makePreview(item.suggestion),
      title:         makeTitle(item.suggestion),
    })
  })

  await batch.commit()
  console.log(`✅ Inserted ${TEST_SUGGESTIONS.length} test suggestions.`)
  console.log(`   To delete them later, run: npx tsx scripts/seed.ts --delete\n`)
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteTestData() {
  console.log('Deleting test suggestions…\n')

  const snap = await db.collection('suggestions').get()
  const testDocs = snap.docs.filter(d => {
    const notes = String(d.data().internalNotes || '')
    return notes.includes(TEST_MARKER)
  })

  if (testDocs.length === 0) {
    console.log('No test suggestions found.')
    return
  }

  // Firestore batch limit is 500
  const chunks = []
  for (let i = 0; i < testDocs.length; i += 500) {
    chunks.push(testDocs.slice(i, i + 500))
  }

  for (const chunk of chunks) {
    const batch = db.batch()
    chunk.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }

  console.log(`✅ Deleted ${testDocs.length} test suggestion(s).`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const isDelete = process.argv.includes('--delete')

if (isDelete) {
  deleteTestData().catch(console.error)
} else {
  seed().catch(console.error)
}
