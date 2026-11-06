import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  AlertCircle,
  CloudOff,
  Crown,
  LoaderCircle,
  Medal,
  RefreshCw,
  Trophy,
} from 'lucide-react'
import {
  competitiveLeaderboardService,
  connectivityService,
  isBackendError,
  isBackendConfigured,
  type CompetitionWeekInfo,
  type LeaderboardBoard,
  type OverallLeaderboardEntry,
  type RooftopLeaderboardEntry,
  type SpeedLeaderboardEntry,
  type WeeklyLeaderboardEntry,
} from '../backend'
import { listLocalLevels } from '../levels'
import { SoundToggle } from './SoundToggle'

type SolarChampionsScreenProps = {
  soundEnabled: boolean
  onToggleSound: () => void
  onBack: () => void
}

type LoadState = 'loading' | 'ready' | 'empty' | 'offline' | 'error'

type BoardRows =
  | { board: 'overall'; entries: readonly OverallLeaderboardEntry[] }
  | { board: 'weekly'; entries: readonly WeeklyLeaderboardEntry[] }
  | { board: 'rooftop'; entries: readonly RooftopLeaderboardEntry[] }
  | { board: 'speed'; entries: readonly SpeedLeaderboardEntry[] }

const TABS: { id: LeaderboardBoard; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'rooftop', label: 'Rooftop' },
  { id: 'speed', label: 'Speed' },
]

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatScore(value: number): string {
  return value.toLocaleString('en-AU')
}

function formatWeekReset(week: CompetitionWeekInfo | null): string {
  if (!week?.weekEnd) return 'Resets Monday 00:00 Australia/Canberra'
  try {
    const formatted = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Canberra',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(week.weekEnd))
    return `Resets ${formatted} (Canberra)`
  } catch {
    return 'Resets Monday 00:00 Australia/Canberra'
  }
}

function medalClass(rank: number): string {
  if (rank === 1) return 'is-gold'
  if (rank === 2) return 'is-silver'
  if (rank === 3) return 'is-bronze'
  return ''
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="champions-rank is-place-1" aria-label="Rank 1">
        <Trophy size={18} aria-hidden />
        <span>1</span>
      </span>
    )
  }
  if (rank === 2 || rank === 3) {
    return (
      <span className={`champions-rank is-place-${rank}`} aria-label={`Rank ${rank}`}>
        <Medal size={17} aria-hidden />
        <span>{rank}</span>
      </span>
    )
  }
  return (
    <span className="champions-rank" aria-label={`Rank ${rank}`}>
      <span>{rank}</span>
    </span>
  )
}

function ChampionRow({
  rank,
  publicNickname,
  isMine,
  value,
  detail,
  valueLabel,
}: {
  rank: number
  publicNickname: string
  isMine: boolean
  value: string
  detail: string
  valueLabel: string
}) {
  return (
    <li className={`champions-row ${medalClass(rank)} ${isMine ? 'is-mine' : ''}`}>
      <RankBadge rank={rank} />
      <div className="champions-identity">
        <span className="champions-name">
          {publicNickname}
          {isMine ? <em>You</em> : null}
        </span>
        <span className="champions-meta">{detail}</span>
      </div>
      <div className="champions-score">
        <strong>{value}</strong>
        <small>{valueLabel}</small>
      </div>
    </li>
  )
}

function getEmptyCopy({
  board,
  message,
  speedUnavailable,
}: {
  board: LeaderboardBoard
  message: string | null
  speedUnavailable: boolean
}): { title: string; body: string } {
  if (message && speedUnavailable) {
    return {
      title: 'Speed Champions unlocking soon',
      body: message,
    }
  }
  if (board === 'overall') {
    return {
      title: 'No Overall Champions yet',
      body:
        'A player needs verified Classic bests on all five active rooftops before they appear here. Local play still works anytime.',
    }
  }
  if (board === 'weekly') {
    return {
      title: 'No weekly leaders yet',
      body:
        'Verified Classic scores from the current Canberra competition week will show here. Previous weeks do not carry over.',
    }
  }
  if (board === 'rooftop') {
    return {
      title: 'No rooftop rankings yet',
      body: 'Be the first with a verified Classic score on this rooftop’s active puzzle version.',
    }
  }
  return {
    title: 'No Speed Champions yet',
    body:
      message ??
      'Verified Time Attack runs with 100% coverage on this rooftop will appear here, ranked by server-observed time.',
  }
}

export function SolarChampionsScreen({
  soundEnabled,
  onToggleSound,
  onBack,
}: SolarChampionsScreenProps) {
  const rooftops = listLocalLevels()
  const [board, setBoard] = useState<LeaderboardBoard>('overall')
  const [levelId, setLevelId] = useState(rooftops[0]?.id ?? 'sunny-house')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [rows, setRows] = useState<BoardRows | null>(null)
  const [myNickname, setMyNickname] = useState<string | null>(null)
  const [viewerRank, setViewerRank] = useState<number | null>(null)
  const [speedAvailable, setSpeedAvailable] = useState(false)
  const [week, setWeek] = useState<CompetitionWeekInfo | null>(null)

  const loadBoard = useCallback(async (nextBoard: LeaderboardBoard, nextLevelId: string): Promise<void> => {
    setLoadState('loading')
    setMessage(null)

    if (!isBackendConfigured()) {
      setRows(null)
      setLoadState('offline')
      setMessage('Online leaderboards need a connection. Your local rooftop progress is safe.')
      return
    }

    const connectivity = await connectivityService.ping()
    if (connectivity.status === 'error' || connectivity.status === 'not_configured') {
      setRows(null)
      setLoadState('offline')
      setMessage(connectivity.message)
      return
    }

    try {
      if (nextBoard === 'overall') {
        const page = await competitiveLeaderboardService.getOverall({ limit: 20 })
        setRows({ board: 'overall', entries: page.entries })
        setMyNickname(page.myNickname)
        setViewerRank(page.viewerRank)
        setSpeedAvailable(page.speedAvailable)
        setWeek(page.week)
        setLoadState(page.entries.length === 0 ? 'empty' : 'ready')
        return
      }

      if (nextBoard === 'weekly') {
        const page = await competitiveLeaderboardService.getWeekly({ limit: 20 })
        setRows({ board: 'weekly', entries: page.entries })
        setMyNickname(page.myNickname)
        setViewerRank(page.viewerRank)
        setSpeedAvailable(page.speedAvailable)
        setWeek(page.week)
        setLoadState(page.entries.length === 0 ? 'empty' : 'ready')
        return
      }

      if (nextBoard === 'rooftop') {
        const page = await competitiveLeaderboardService.getRooftop(nextLevelId, { limit: 20 })
        setRows({ board: 'rooftop', entries: page.entries })
        setMyNickname(page.myNickname)
        setViewerRank(page.viewerRank)
        setSpeedAvailable(page.speedAvailable)
        setWeek(page.week)
        setLoadState(page.entries.length === 0 ? 'empty' : 'ready')
        return
      }

      const available = await competitiveLeaderboardService.isSpeedAvailable()
      setSpeedAvailable(available)
      if (!available) {
        setRows({ board: 'speed', entries: [] })
        setLoadState('empty')
        setMessage(
          'Speed Champions appear after the first verified Time Attack run is accepted online.',
        )
        return
      }

      const page = await competitiveLeaderboardService.getSpeed(nextLevelId, { limit: 20 })
      setRows({ board: 'speed', entries: page.entries })
      setMyNickname(page.myNickname)
      setViewerRank(page.viewerRank)
      setSpeedAvailable(page.speedAvailable)
      setWeek(page.week)
      setLoadState(page.entries.length === 0 ? 'empty' : 'ready')
    } catch (error) {
      setRows(null)
      setLoadState('error')
      setMessage(isBackendError(error) ? error.message : 'Could not load Solar Champions.')
    }
  }, [])

  useEffect(() => {
    void loadBoard(board, levelId)
  }, [board, levelId, loadBoard])

  const ruleCopy =
    board === 'overall'
      ? 'Overall Champions need a verified Classic best on all five active rooftops. Only one best per rooftop counts.'
      : board === 'weekly'
        ? 'Weekly Leaders sum verified Classic scores recorded in the current Canberra competition week.'
        : board === 'rooftop'
          ? 'Rooftop Rankings show each player’s highest verified Classic score on the selected active rooftop version.'
          : 'Speed Champions rank the shortest server-observed Time Attack duration with 100% roof coverage on the active rooftop version.'

  const boardContextLabel =
    board === 'overall'
      ? 'Overall Champions'
      : board === 'weekly'
        ? 'Weekly Leaders'
        : board === 'rooftop'
          ? 'Rooftop Rankings'
          : 'Speed Champions'

  const emptyCopy = getEmptyCopy({
    board,
    message,
    speedUnavailable: board === 'speed' && !speedAvailable,
  })

  const standingSummary = useMemo(() => {
    if (!rows || viewerRank === null || !myNickname) return null

    if (rows.board === 'speed') {
      const entry = rows.entries.find((item) => item.publicNickname === myNickname)
      if (!entry) return null
      return {
        rank: viewerRank,
        nickname: myNickname,
        value: formatDuration(entry.verifiedDurationMs),
        valueLabel: 'time',
        context: boardContextLabel,
      }
    }
    if (rows.board === 'rooftop') {
      const entry = rows.entries.find((item) => item.publicNickname === myNickname)
      if (!entry) return null
      return {
        rank: viewerRank,
        nickname: myNickname,
        value: formatScore(entry.verifiedScore),
        valueLabel: 'score',
        context: boardContextLabel,
      }
    }
    if (rows.board === 'weekly') {
      const entry = rows.entries.find((item) => item.publicNickname === myNickname)
      if (!entry) return null
      return {
        rank: viewerRank,
        nickname: myNickname,
        value: formatScore(entry.totalScore),
        valueLabel: 'score',
        context: boardContextLabel,
      }
    }
    const entry = rows.entries.find((item) => item.publicNickname === myNickname)
    if (!entry) return null
    return {
      rank: viewerRank,
      nickname: myNickname,
      value: formatScore(entry.totalScore),
      valueLabel: 'score',
      context: boardContextLabel,
    }
  }, [boardContextLabel, myNickname, rows, viewerRank])

  const selectedRooftopTitle =
    rooftops.find((level) => level.id === levelId)?.title ?? 'Selected rooftop'

  return (
    <section className="screen solar-champions">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} className="sound-toggle" />

      <header className="solar-champions-header">
        <p className="brand-mark">
          <span>Decarby</span> Solar
        </p>
        <h1>
          <Trophy size={26} aria-hidden />
          Solar Champions
        </h1>
        <p className="tagline">Verified online rooftop rankings for the whole family.</p>
      </header>

      <div className="champions-tabs" role="tablist" aria-label="Leaderboard categories">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={board === tab.id}
            className={`champions-tab ${board === tab.id ? 'is-active' : ''}`}
            onClick={() => setBoard(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="champions-rule">{ruleCopy}</p>

      {board === 'weekly' && (
        <p className="champions-week">
          <Crown size={16} aria-hidden />
          <span className="champions-week-label">
            {week ? `Week ${week.label}` : 'Current Canberra week'}
          </span>
          <span className="champions-week-reset">{formatWeekReset(week)}</span>
        </p>
      )}

      {(board === 'rooftop' || board === 'speed') && (
        <label className="champions-rooftop-picker">
          <span>Rooftop</span>
          <select
            value={levelId}
            onChange={(event) => setLevelId(event.target.value)}
            disabled={board === 'speed' && !speedAvailable && loadState !== 'loading'}
            aria-label={`Choose rooftop for ${boardContextLabel}`}
          >
            {rooftops.map((level) => (
              <option key={level.id} value={level.id}>
                {level.number}. {level.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div
        className={`champions-board ${loadState === 'ready' ? 'has-results' : 'is-status'}`}
        aria-live="polite"
      >
        {loadState === 'loading' && (
          <div className="champions-state">
            <LoaderCircle className="spin" size={26} aria-hidden />
            <p className="champions-state-title">Loading rankings</p>
            <p className="champions-state-body">Fetching verified Solar Champions…</p>
          </div>
        )}

        {loadState === 'offline' && (
          <div className="champions-state">
            <CloudOff size={26} aria-hidden />
            <p className="champions-state-title">Leaderboards offline</p>
            <p className="champions-state-body">
              {message ?? 'Connect to view verified rankings. Local rooftop challenges still work.'}
            </p>
          </div>
        )}

        {loadState === 'error' && (
          <div className="champions-state">
            <AlertCircle size={26} aria-hidden />
            <p className="champions-state-title">Couldn’t load rankings</p>
            <p className="champions-state-body">
              {message ?? 'Something went wrong talking to the online service.'}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadBoard(board, levelId)}
            >
              <RefreshCw size={16} aria-hidden />
              Try again
            </button>
          </div>
        )}

        {loadState === 'empty' && (
          <div className="champions-state">
            <Medal size={26} aria-hidden />
            <p className="champions-state-title">{emptyCopy.title}</p>
            <p className="champions-state-body">{emptyCopy.body}</p>
          </div>
        )}

        {loadState === 'ready' && rows && (
          <ol className="champions-list">
            {rows.board === 'overall' &&
              rows.entries.map((entry) => (
                <ChampionRow
                  key={`${entry.rank}-${entry.publicNickname}`}
                  rank={entry.rank}
                  publicNickname={entry.publicNickname}
                  isMine={myNickname === entry.publicNickname}
                  value={formatScore(entry.totalScore)}
                  detail={`${entry.levelsCompleted} rooftops · ${formatDuration(entry.totalDurationMs)}`}
                  valueLabel="points"
                />
              ))}
            {rows.board === 'weekly' &&
              rows.entries.map((entry) => (
                <ChampionRow
                  key={`${entry.rank}-${entry.publicNickname}`}
                  rank={entry.rank}
                  publicNickname={entry.publicNickname}
                  isMine={myNickname === entry.publicNickname}
                  value={formatScore(entry.totalScore)}
                  detail={`${entry.levelsCounted} rooftop${entry.levelsCounted === 1 ? '' : 's'} this week`}
                  valueLabel="points"
                />
              ))}
            {rows.board === 'rooftop' &&
              rows.entries.map((entry) => (
                <ChampionRow
                  key={`${entry.rank}-${entry.publicNickname}`}
                  rank={entry.rank}
                  publicNickname={entry.publicNickname}
                  isMine={myNickname === entry.publicNickname}
                  value={formatScore(entry.verifiedScore)}
                  detail={`${selectedRooftopTitle} · ${formatDuration(entry.verifiedDurationMs)}`}
                  valueLabel="points"
                />
              ))}
            {rows.board === 'speed' &&
              rows.entries.map((entry) => (
                <ChampionRow
                  key={`${entry.rank}-${entry.publicNickname}`}
                  rank={entry.rank}
                  publicNickname={entry.publicNickname}
                  isMine={myNickname === entry.publicNickname}
                  value={formatDuration(entry.verifiedDurationMs)}
                  detail={`${selectedRooftopTitle} · score ${formatScore(entry.verifiedScore)}`}
                  valueLabel="time"
                />
              ))}
          </ol>
        )}
      </div>

      {standingSummary && loadState === 'ready' && (
        <aside className="champions-standing" aria-label="Your standing">
          <div className="champions-standing-copy">
            <p className="champions-standing-kicker">Your standing · {standingSummary.context}</p>
            <p className="champions-standing-name">
              <strong>#{standingSummary.rank}</strong> {standingSummary.nickname}
            </p>
          </div>
          <div className="champions-standing-score">
            <strong>{standingSummary.value}</strong>
            <small>{standingSummary.valueLabel}</small>
          </div>
        </aside>
      )}

      {myNickname === null && loadState !== 'offline' && loadState !== 'loading' && (
        <p className="champions-standing-hint">
          Set a public nickname in Online Profile to highlight your standing here.
        </p>
      )}

      {myNickname !== null && viewerRank === null && loadState === 'ready' && (
        <p className="champions-standing-hint">
          You’re signed in as <strong>{myNickname}</strong>, but not ranked on this board yet.
        </p>
      )}

      <div className="level-select-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          Back to modes
        </button>
      </div>
    </section>
  )
}
