import { useCallback, useEffect, useState } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { HowToPlayScreen } from './components/HowToPlayScreen'
import { ModeSelectScreen } from './components/ModeSelectScreen'
import { OnlineProfileScreen } from './components/OnlineProfileScreen'
import { SolarChampionsScreen } from './components/SolarChampionsScreen'
import { RewardCentreScreen } from './components/RewardCentreScreen'
import { OperatorClaimsScreen } from './components/OperatorClaimsScreen'
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
import { PromotionalNicknameScreen } from './components/PromotionalNicknameScreen'
import { VoucherDetailsScreen } from './components/VoucherDetailsScreen'
import { ConfirmDialog } from './components/ConfirmDialog'
import { createPuzzleEngine, type PuzzleEngine } from './engine/puzzleState'
import {
  resetForNewPlayer,
  shouldConfirmResetBeforeFinish,
} from './services/playerSessionReset'
import { readCachedClaimResult } from './services/claimResultCache'
import { getFirstLevel, getLevelById, getNextLevel, LEVEL_5_CHAMPION } from './levels'
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
import { operatorClaimsService } from './backend/services/operatorClaims'
import { promotionalCampaignService } from './backend/services/promotionalCampaign'
import type { CampaignLevelId } from '../shared/achievements/registry'
import type { PromotionalCampaignRun } from '../shared/campaign/types'
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
  const [showOperatorClaims, setShowOperatorClaims] = useState(false)
  const [promoRun, setPromoRun] = useState<PromotionalCampaignRun | null>(null)
  const [promoFlowActive, setPromoFlowActive] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  useEffect(() => {
    void localProgressService.load().then(setProgress)
  }, [])

  useEffect(() => {
    if (!isBackendConfigured()) {
      setShowOperatorClaims(false)
      return
    }
    let cancelled = false
    void operatorClaimsService.checkAccess().then((ok) => {
      if (!cancelled) setShowOperatorClaims(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const soundEnabled = progress?.soundEnabled ?? true
  const timeAttackAvailable = (progress?.completedLevels.length ?? 0) > 0

  const toggleSound = useCallback(async () => {
    await unlockAudio()
    const next = await localProgressService.setSoundEnabled(!soundEnabled)
    setProgress(next)
  }, [soundEnabled])

  const maybeStartOnlineAttempt = useCallback(
    async (
      levelId: string,
      mode: GameMode,
      campaignRunId?: string | null,
    ): Promise<OnlineAttemptSession | null> => {
      if (!isBackendConfigured()) return null
      try {
        const profile = await profileService.getMyProfile()
        if (!profile) return null
        return await competitiveAttemptService.startAttempt({
          levelId,
          gameMode: mode,
          clientNonce: crypto.randomUUID(),
          campaignRunId: campaignRunId ?? undefined,
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
        setPromoRun((current) => {
          if (!current || !promoFlowActive) return current
          const levelId = activeLevelId as CampaignLevelId
          return promotionalCampaignService.recordVerified(current, {
            levelId,
            stars: outcome.verifiedStars,
            score: outcome.verifiedScore,
            verifiedRecordId: outcome.verifiedRecordId,
            verifiedAttemptId: session.attemptId,
          })
        })
      } else if (outcome.status === 'unable_to_connect') {
        setOnlineSubmission({
          status: 'unable_to_connect',
          message: outcome.message,
        })
      } else {
        setOnlineSubmission({ status: 'rejected', message: outcome.message })
      }
    },
    [activeLevelId, promoFlowActive],
  )

  const startLevel = useCallback(
    async (levelId: string, mode: GameMode, options?: { campaignRunId?: string | null }) => {
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

      const runId = options?.campaignRunId ?? (promoFlowActive ? promoRun?.id : null)
      const session = await maybeStartOnlineAttempt(
        levelId,
        mode,
        promoFlowActive && promoRun?.serverBacked ? runId : null,
      )
      setOnlineSession(session)
      setEngine(createPuzzleEngine(level, { recordActions: session !== null }))
      setEngineKey((k) => k + 1)
      setResult(null)
      setTimeAttackResult(null)
      setScreen('gameplay')
    },
    [maybeStartOnlineAttempt, promoFlowActive, promoRun],
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
    setScreen('promoNickname')
  }, [progress])

  const finishTutorial = useCallback(async () => {
    const next = await localProgressService.setTutorialCompleted(true)
    setProgress(next)
    setScreen('promoNickname')
  }, [])

  const beginPromotionalCampaign = useCallback(
    async (nickname: string, mode: 'online' | 'offline') => {
      await unlockAudio()
      const run =
        mode === 'online'
          ? await promotionalCampaignService.startServerRun(nickname)
          : promotionalCampaignService.createOfflineRun(nickname)
      setPromoRun(run)
      setPromoFlowActive(true)
      const first = getFirstLevel()
      await startLevel(first.id, 'classic', {
        campaignRunId: run.serverBacked ? run.id : null,
      })
    },
    [startLevel],
  )

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
      if (promoFlowActive) {
        setPromoRun((current) =>
          current
            ? promotionalCampaignService.recordLocalComplete(current, {
                levelId: levelResult.levelId as CampaignLevelId,
                stars: levelResult.stars,
                score: levelResult.score,
              })
            : current,
        )
      }
      setScreen('levelComplete')
      void submitOnlineIfNeeded(onlineSession, engine, {
        score: levelResult.score,
        durationMs: levelResult.durationMs,
        coveragePercent: levelResult.coveragePercent,
      })
    },
    [engine, onlineSession, promoFlowActive, submitOnlineIfNeeded],
  )

  const openCampaignComplete = useCallback(async () => {
    let run = promoRun
    if (!run && progress) {
      // Standalone Classic finish (outside promotional Play Now flow).
      let built = promotionalCampaignService.createOfflineRun('Solar Player')
      for (const levelId of [
        'sunny-house',
        'chimney-challenge',
        'tricky-rooftop',
        'solar-puzzle-master',
        'decarby-solar-champion',
      ] as const) {
        built = promotionalCampaignService.recordLocalComplete(built, {
          levelId,
          stars: progress.bestStars[levelId] ?? 0,
          score: progress.bestScores[levelId] ?? 0,
        })
      }
      run = built
    }
    if (!run) {
      setScreen('modeSelect')
      return
    }
    const evaluated = await promotionalCampaignService.evaluateServer(run)
    setPromoRun(evaluated)
    setScreen('campaignComplete')
  }, [promoRun, progress])

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

  const clearTransientPlayState = useCallback(() => {
    setEngine(null)
    setResult(null)
    setTimeAttackResult(null)
    setOnlineSession(null)
    setOnlineSubmission({ status: 'idle' })
    setAchievementToasts([])
    setPromoRun(null)
    setPromoFlowActive(false)
    setActiveLevelId('sunny-house')
    setGameMode('classic')
    setEngineKey((k) => k + 1)
  }, [])

  const performNewPlayerReset = useCallback(async () => {
    if (resetBusy) return
    setResetBusy(true)
    setResetConfirmOpen(false)
    try {
      const outcome = await resetForNewPlayer()
      setProgress(outcome.progress)
      clearTransientPlayState()
      setScreen('promoNickname')
    } finally {
      setResetBusy(false)
    }
  }, [clearTransientPlayState, resetBusy])

  const requestNewPlayer = useCallback(() => {
    const claimCompleted = promoRun ? readCachedClaimResult(promoRun.id) != null : false
    if (
      shouldConfirmResetBeforeFinish({
        promoFlowActive,
        claimCompleted,
      })
    ) {
      setResetConfirmOpen(true)
      return
    }
    void performNewPlayerReset()
  }, [performNewPlayerReset, promoFlowActive, promoRun])

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

      {screen === 'promoNickname' && (
        <PromotionalNicknameScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          initialNickname=""
          onContinue={(nickname, mode) => void beginPromotionalCampaign(nickname, mode)}
          onBack={() => setScreen('welcome')}
          onExploreModes={() => {
            setPromoFlowActive(false)
            setScreen('modeSelect')
          }}
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
          showOperatorClaims={showOperatorClaims}
          onOperatorClaims={() => setScreen('operatorClaims')}
          timeAttackAvailable={timeAttackAvailable}
        />
      )}

      {screen === 'operatorClaims' && (
        <OperatorClaimsScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen('modeSelect')}
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
          onCampaignComplete={() => void openCampaignComplete()}
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

      {screen === 'campaignComplete' && promoRun && (
        <CampaignCompleteScreen
          view={promotionalCampaignService.toView(promoRun)}
          onContinuePlaceholder={() => setScreen('voucherDetails')}
          onHome={() => {
            setPromoFlowActive(false)
            setScreen('welcome')
          }}
          onExploreModes={() => {
            setPromoFlowActive(false)
            setScreen('modeSelect')
          }}
        />
      )}

      {screen === 'voucherDetails' && promoRun && (
        <VoucherDetailsScreen
          view={promotionalCampaignService.toView(promoRun)}
          onBack={() => setScreen('campaignComplete')}
          onHome={() => {
            setPromoFlowActive(false)
            setScreen('welcome')
          }}
          onNewPlayer={() => requestNewPlayer()}
          onViewLeaderboard={() => {
            setPromoFlowActive(false)
            setScreen('solarChampions')
          }}
        />
      )}

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Start a new player?"
        message="This will clear the current campaign progress on this device and end the online session. Leaderboards and issued vouchers are kept on the server. Continue?"
        confirmLabel={resetBusy ? 'Resetting…' : 'New Player'}
        cancelLabel="Keep playing"
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => void performNewPlayerReset()}
      />

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
