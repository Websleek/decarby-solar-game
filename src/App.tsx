import { useCallback, useEffect, useState } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { HowToPlayScreen } from './components/HowToPlayScreen'
import { ModeSelectScreen } from './components/ModeSelectScreen'
import { OnlineProfileScreen } from './components/OnlineProfileScreen'
import { SolarChampionsScreen } from './components/SolarChampionsScreen'
import { RewardCentreScreen } from './components/RewardCentreScreen'
import {
  AchievementToastHost,
  type AchievementToastItem,
} from './components/AchievementToastHost'
import { ACHIEVEMENT_BY_ID, type VerifiedAchievementId } from '../shared/achievements/registry'
import { LevelSelectScreen } from './components/LevelSelectScreen'
import { GameplayScreen } from './components/GameplayScreen'
import { LevelCompleteScreen } from './components/LevelCompleteScreen'
import { TimeAttackResultsScreen } from './components/TimeAttackResultsScreen'
import { CampaignCompleteScreen } from './components/CampaignCompleteScreen'
import { createPuzzleEngine, type PuzzleEngine } from './engine/puzzleState'
import { getLevelById, getNextLevel, LEVEL_5_CHAMPION } from './levels'
import {
  getLevelScoreDisplay,
  isLevelUnlocked,
  isTimeAttackLevelAvailable,
  localProgressService,
} from './services/localProgress'
import { unlockAudio } from './audio/soundEffects'
import {
  competitiveAttemptService,
  type OnlineAttemptSession,
} from './backend/services/competitiveAttempts'
import { isBackendConfigured } from './backend/config'
import { profileService } from './backend/services/profile'
import type {
  GameMode,
  LevelResult,
  OnlineSubmissionState,
  ScreenId,
  TimeAttackResult,
} from './types/game'
import type { PlayerProgress } from './types/services'

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('welcome')
  const [progress, setProgress] = useState<PlayerProgress | null>(null)
  const [engine, setEngine] = useState<PuzzleEngine | null>(null)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [timeAttackResult, setTimeAttackResult] = useState<TimeAttackResult | null>(null)
  const [activeLevelId, setActiveLevelId] = useState<string>('sunny-house')
  const [gameMode, setGameMode] = useState<GameMode>('classic')
  const [engineKey, setEngineKey] = useState(0)
  const [onlineSession, setOnlineSession] = useState<OnlineAttemptSession | null>(null)
  const [onlineSubmission, setOnlineSubmission] = useState<OnlineSubmissionState>({
    status: 'idle',
  })
  const [achievementToasts, setAchievementToasts] = useState<AchievementToastItem[]>([])

  useEffect(() => {
    void localProgressService.load().then(setProgress)
  }, [])

  const soundEnabled = progress?.soundEnabled ?? true
  const timeAttackAvailable = (progress?.completedLevels.length ?? 0) > 0

  const toggleSound = useCallback(async () => {
    await unlockAudio()
    const next = await localProgressService.setSoundEnabled(!soundEnabled)
    setProgress(next)
  }, [soundEnabled])

  const maybeStartOnlineAttempt = useCallback(
    async (levelId: string, mode: GameMode): Promise<OnlineAttemptSession | null> => {
      if (!isBackendConfigured()) return null
      try {
        const profile = await profileService.getMyProfile()
        if (!profile) return null
        return await competitiveAttemptService.startAttempt({
          levelId,
          gameMode: mode,
          clientNonce: crypto.randomUUID(),
        })
      } catch {
        return null
      }
    },
    [],
  )

  const submitOnlineIfNeeded = useCallback(
    async (
      session: OnlineAttemptSession | null,
      activeEngine: PuzzleEngine | null,
      claimed: {
        score: number
        durationMs: number
        coveragePercent: number
      },
    ) => {
      if (!session || !activeEngine) {
        setOnlineSubmission({ status: 'idle' })
        return
      }
      setOnlineSubmission({ status: 'submitting' })
      activeEngine.recordCompleteAction()
      const outcome = await competitiveAttemptService.submitAttempt({
        attemptId: session.attemptId,
        actions: activeEngine.getActionLog(),
        claimedScore: claimed.score,
        claimedDurationMs: claimed.durationMs,
        claimedCoveragePercent: claimed.coveragePercent,
        configurationHash: session.configurationHash,
      })
      if (outcome.ok) {
        setOnlineSubmission({
          status: 'verified',
          verifiedScore: outcome.verifiedScore,
          verifiedStars: outcome.verifiedStars,
          verifiedCoveragePercent: outcome.verifiedCoveragePercent,
          verifiedDurationMs: outcome.verifiedDurationMs,
          newlyEarnedAchievements: outcome.newlyEarnedAchievements,
        })
        const fresh = outcome.newlyEarnedAchievements.filter(
          (id): id is VerifiedAchievementId => id in ACHIEVEMENT_BY_ID,
        )
        if (fresh.length > 0) {
          setAchievementToasts((prev) => [
            ...prev,
            ...fresh.map((achievementId) => ({
              id: `${achievementId}-${crypto.randomUUID()}`,
              achievementId,
            })),
          ])
        }
      } else if (outcome.status === 'unable_to_connect') {
        setOnlineSubmission({
          status: 'unable_to_connect',
          message: outcome.message,
        })
      } else {
        setOnlineSubmission({ status: 'rejected', message: outcome.message })
      }
    },
    [],
  )

  const startLevel = useCallback(
    async (levelId: string, mode: GameMode) => {
      const current = await localProgressService.load()
      if (mode === 'classic' && !isLevelUnlocked(current, levelId)) {
        setProgress(current)
        setScreen('levelSelect')
        return
      }
      if (mode === 'timeAttack' && !isTimeAttackLevelAvailable(current, levelId)) {
        setProgress(current)
        setScreen('levelSelect')
        return
      }
      const level = getLevelById(levelId)
      if (!level) return

      if (mode === 'classic') {
        await localProgressService.setSelectedLevel(levelId)
      }
      const withMode = await localProgressService.setPreferredGameMode(mode)
      setProgress(withMode)
      setGameMode(mode)
      setActiveLevelId(levelId)
      setOnlineSubmission({ status: 'idle' })

      const session = await maybeStartOnlineAttempt(levelId, mode)
      setOnlineSession(session)
      setEngine(createPuzzleEngine(level, { recordActions: session !== null }))
      setEngineKey((k) => k + 1)
      setResult(null)
      setTimeAttackResult(null)
      setScreen('gameplay')
    },
    [maybeStartOnlineAttempt],
  )

  const goToLevelSelect = useCallback(async () => {
    const current = progress ?? (await localProgressService.load())
    setProgress(current)
    setOnlineSession(null)
    setScreen('levelSelect')
  }, [progress])

  const goToModeSelect = useCallback(async () => {
    const current = progress ?? (await localProgressService.load())
    setProgress(current)
    setScreen('modeSelect')
  }, [progress])

  const handlePlay = useCallback(async () => {
    await unlockAudio()
    const current = progress ?? (await localProgressService.load())
    setProgress(current)
    if (!current.tutorialCompleted) {
      setScreen('howToPlay')
      return
    }
    setScreen('modeSelect')
  }, [progress])

  const finishTutorial = useCallback(async () => {
    const next = await localProgressService.setTutorialCompleted(true)
    setProgress(next)
    setScreen('modeSelect')
  }, [])

  const handleSelectMode = useCallback(async (mode: GameMode) => {
    await unlockAudio()
    const next = await localProgressService.setPreferredGameMode(mode)
    setProgress(next)
    setGameMode(mode)
    setScreen('levelSelect')
  }, [])

  const handleComplete = useCallback(
    async (levelResult: LevelResult) => {
      setResult(levelResult)
      const next = await localProgressService.recordLevelResult(levelResult)
      setProgress(next)
      setScreen('levelComplete')
      void submitOnlineIfNeeded(onlineSession, engine, {
        score: levelResult.score,
        durationMs: levelResult.durationMs,
        coveragePercent: levelResult.coveragePercent,
      })
    },
    [engine, onlineSession, submitOnlineIfNeeded],
  )

  const handleTimeAttackComplete = useCallback(
    async (taResult: TimeAttackResult) => {
      setTimeAttackResult(taResult)
      const next = await localProgressService.recordTimeAttackResult(taResult)
      setProgress(next)
      setScreen('timeAttackResults')
      void submitOnlineIfNeeded(onlineSession, engine, {
        score: 0,
        durationMs: taResult.durationMs,
        coveragePercent: taResult.coveragePercent,
      })
    },
    [engine, onlineSession, submitOnlineIfNeeded],
  )

  const handleReplay = useCallback(() => {
    void startLevel(activeLevelId, gameMode)
  }, [activeLevelId, gameMode, startLevel])

  const handleNextLevel = useCallback(() => {
    const next = getNextLevel(activeLevelId)
    if (next) void startLevel(next.id, 'classic')
  }, [activeLevelId, startLevel])

  const nextLevel = result ? getNextLevel(result.levelId) : undefined
  const nextUnlocked =
    !!progress && !!nextLevel && progress.unlockedLevels.includes(nextLevel.id)
  const isFinalLevel = activeLevelId === LEVEL_5_CHAMPION.id

  const previousBestScore =
    progress && engine
      ? getLevelScoreDisplay(progress, engine.level).currentBest ?? 0
      : 0
  const previousBestTimeMs = progress?.timeAttackBestMs[activeLevelId] ?? null

  return (
    <div className="app-shell">
      {screen === 'welcome' && (
        <WelcomeScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onPlay={() => void handlePlay()}
          onHowToPlay={() => setScreen('howToPlay')}
        />
      )}

      {screen === 'howToPlay' && (
        <HowToPlayScreen
          onSkip={() => void finishTutorial()}
          onDone={() => void finishTutorial()}
        />
      )}

      {screen === 'modeSelect' && (
        <ModeSelectScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onSelectMode={(mode) => void handleSelectMode(mode)}
          onBack={() => setScreen('welcome')}
          onOnlineProfile={() => setScreen('onlineProfile')}
          onSolarChampions={() => setScreen('solarChampions')}
          onRewardCentre={() => setScreen('rewardCentre')}
          timeAttackAvailable={timeAttackAvailable}
        />
      )}

      {screen === 'onlineProfile' && (
        <OnlineProfileScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen('modeSelect')}
        />
      )}

      {screen === 'solarChampions' && (
        <SolarChampionsScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen('modeSelect')}
        />
      )}

      {screen === 'rewardCentre' && progress && (
        <RewardCentreScreen
          progress={progress}
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen('modeSelect')}
          onOnlineProfile={() => setScreen('onlineProfile')}
        />
      )}

      {screen === 'levelSelect' && progress && (
        <LevelSelectScreen
          progress={progress}
          mode={gameMode}
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onPlayLevel={(id) => void startLevel(id, gameMode)}
          onBack={() => void goToModeSelect()}
        />
      )}

      {screen === 'gameplay' && engine && (
        <GameplayScreen
          key={engineKey}
          engine={engine}
          mode={gameMode}
          soundEnabled={soundEnabled}
          previousBestScore={previousBestScore}
          previousBestTimeMs={previousBestTimeMs}
          onlineAttemptActive={onlineSession !== null}
          onComplete={(r) => void handleComplete(r)}
          onTimeAttackComplete={(r) => void handleTimeAttackComplete(r)}
          onExit={() => void goToLevelSelect()}
        />
      )}

      {screen === 'levelComplete' && result && progress && (
        <LevelCompleteScreen
          result={result}
          progress={progress}
          onlineSubmission={onlineSubmission}
          nextUnlocked={nextUnlocked}
          isFinalLevel={isFinalLevel}
          onReplay={handleReplay}
          onNextLevel={handleNextLevel}
          onLevelSelect={() => void goToLevelSelect()}
          onCampaignComplete={() => setScreen('campaignComplete')}
        />
      )}

      {screen === 'timeAttackResults' && timeAttackResult && (
        <TimeAttackResultsScreen
          result={timeAttackResult}
          onlineSubmission={onlineSubmission}
          onRetry={handleReplay}
          onChooseLevel={() => void goToLevelSelect()}
        />
      )}

      {screen === 'campaignComplete' && progress && (
        <CampaignCompleteScreen
          progress={progress}
          onReplayFinal={() => void startLevel(LEVEL_5_CHAMPION.id, 'classic')}
          onLevelSelect={() => void goToLevelSelect()}
          onHome={() => setScreen('welcome')}
        />
      )}

      <AchievementToastHost
        queue={achievementToasts}
        soundEnabled={soundEnabled}
        onDismiss={(id) =>
          setAchievementToasts((prev) => prev.filter((item) => item.id !== id))
        }
      />
    </div>
  )
}
