# Pro MVP: Datamodell och UI-flode

## 1. AI Betescoach + Bite Radar

### Firestore
- `AiCoachSignals/{signalId}`
  - `waterId`
  - `waterName`
  - `generatedAtMs`
  - `generatedForDate`
  - `timezone`
  - `topLures[]`
  - `topMethods[]`
  - `slots[]` (`startAtMs`, `endAtMs`, `biteScore`, `confidence`, `reasonTags[]`)
  - `summary`
  - `modelVersion`
- `AiAdviceLog/{logId}`
  - `uid`
  - `waterId`
  - `requestedAtMs`
  - `source` (`manual`/`auto-refresh`)
  - `acceptedSuggestion`

### UI-flode
1. Anvandare oppnar vatten-sida.
2. Kort: "Bite Radar (Pro)" visas over fangstflodet.
3. Tryck pa kort:
   - timmar med score (0-100)
   - "Top 3 beten nu"
   - "Byt till..." forslag efter X min utan hugg.
4. CTA: `Lås upp Pro` om ej premium.

### Backend
- Cloud Function som bygger signaler 1-2 ganger/dygn per aktivt vatten.
- On-demand endpoint for manuell refresh med rate limit.

## 2. Vanner-ligor och live-tavling

### Firestore
- `Leagues/{leagueId}`
  - `name`, `nameLower`
  - `ownerUid`, `ownerDisplayName`
  - `visibility` (`invite-only`/`friends-only`)
  - `ruleSet` (bucket-poang, sasonslage)
  - `active`, `memberCount`
  - `createdAtMs`
- `LeagueMembers/{leagueId_uid}`
  - `leagueId`, `uid`, `displayName`, `photoURL`
  - `role` (`owner`/`admin`/`member`)
  - `joinedAtMs`, `lastActiveAtMs`
- `LeagueInvites/{inviteId}`
  - `leagueId`, `fromUid`, `toUid`
  - `status` (`pending`/`accepted`/`declined`/`expired`)
  - `createdAtMs`, `expiresAtMs`
- `LeagueWeeklyScores/{leagueId_uid_weekKey}`
  - `leagueId`, `uid`, `weekKey`
  - `points`, `totalCatches`
  - `counts` per bucket
  - `updatedAtMs`

### UI-flode
1. Ny tab: `Ligor`.
2. Skapa liga (Pro): namn + regler.
3. Bjud in van (via befintlig friend-lista).
4. Live-lista:
   - rank, poang, senaste aktivitet.
5. Vecko-reset med historik per vecka.

### Backend
- Callable: `createLeague`, `inviteToLeague`, `respondLeagueInvite`.
- Trigger pa `DailyCatchEvents` som uppdaterar `LeagueWeeklyScores` atomiskt.

## 3. Passrapport + Tackle Log

### Firestore
- `SessionReports/{sessionId}`
  - `uid`, `waterId`, `waterName`
  - `startedAtMs`, `endedAtMs`, `durationMin`
  - `catchesCount`, `points`
  - `avgLengthCm`, `avgWeightG`
  - `weatherSummary`, `pressureHpa`
  - `bestLureLabel`
  - `recommendation`
- `TackleLog/{uid_waterId_lureKey}`
  - `uid`, `waterId`, `waterName`
  - `lureId`, `lureBrand`, `lureName`, `lureSize`, `lureColor`
  - `method`
  - `sampleSize`, `catchesCount`
  - `avgLengthCm`, `lastCatchAtMs`, `updatedAtMs`

### UI-flode
1. Efter sparad fangst:
   - pass-overlay med snabb summering.
2. Sida `Rapporter`:
   - senaste pass
   - toppbeten per vatten
   - "Nasta pass: testa X".
3. Profil-flik:
   - `Mitt Tackle Log` med filter per vatten/sasong.

### Backend
- Batch-jobb som grupperar fangster till pass (t.ex. <= 4h mellan fangster).
- Aggregatfunktion for tackle-performance.

## Pro-gating (rekommenderad)
- Free:
  - grundlaggande fangstloggning, karta, social.
- Pro:
  - full AI Coach
  - skapa liga
  - full rapporthistorik och tackle-logg.

## Firestore Indexforslag
- `AiCoachSignals`: `waterId ASC`, `generatedAtMs DESC`
- `LeagueWeeklyScores`: `leagueId ASC`, `weekKey ASC`, `points DESC`
- `SessionReports`: `uid ASC`, `endedAtMs DESC`
- `TackleLog`: `uid ASC`, `waterId ASC`, `updatedAtMs DESC`

## Rules-principer
- Endast verifierade anvandare skapar/laser egna logs.
- League writes via callable functions (server-authoritative).
- Score-dokument skrivs endast av backend (ingen klient-write).

## Genomforandeordning (4 sprintar)
1. Datamodell + rules/index + read-only UI placeholders.
2. Ligor (create/invite/leaderboard).
3. Passrapport + tackle-logg aggregat.
4. AI Coach + paywall + trial-konvertering.
