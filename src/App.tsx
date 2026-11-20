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
import {
  ACHIEVEMENT_BY_ID,
  CAMPAIGN_LEVEL_IDS,
  type VerifiedAchievementId,
} from '../shared/achievements/registry'
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
import {
  isCampaignLevelLocked,
  nextIncompleteCampaignLevelId,
  resolveAttemptCampaignRunId,
  clearPromoRunDraft,
  readPromoRunDraft,
  writePromoRunDraft,
} from './services/promoRunCache'
import {
  getFirstLevel,
  getLevelById,
  getNextCampaignLevel,
  getNextLevel,
  isFinalCampaignLevel,
} from './levels'
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

  // Recover interrupted event campaign after refresh.
  useEffect(() => {
    const draft = readPromoRunDraft()
    if (!draft) return
    setPromoRun(draft)
    setPromoFlowActive(true)
    const nextId = nextIncompleteCampaignLevelId(draft)
    if (!nextId && draft.levels.every((l) => l.status === 'local_complete' || l.status === 'verified')) {
      setScreen('campaignComplete')
      return
    }
    if (nextId) {
      setActiveLevelId(nextId)
    }
  }, [])

  useEffect(() => {
    if (promoRun && promoFlowActive) writePromoRunDraft(promoRun)
  }, [promoRun, promoFlowActive])

  // Staff tools: open only via #operator-claims. Do not probe operator-claims
  // on every public session — OperatorClaimsScreen still enforces authorization.
  useEffect(() => {
    const syncOperatorHash = () => {
      if (typeof window === 'undefined') return
      if (window.location.hash.replace(/^#/, '') === 'operator-claims') {
        setShowOperatorClaims(true)
        setScreen('operatorClaims')
      }
    }
    syncOperatorHash()
    window.addEventListener('hashchange', syncOperatorHash)
    return () => window.removeEventListener('hashchange', syncOperatorHash)
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
    async (
      levelId: string,
      mode: GameMode,
      options?: {
        campaignRunId?: string | null
        requireServerAttempt?: boolean
        /** When starting the first rooftop before React promo state has committed. */
        promoStarting?: boolean
      },
    ): Promise<boolean> => {
      const current = await localProgressService.load()
      const promoActive = promoFlowActive || options?.promoStarting === true
      if (promoActive && promoRun && isCampaignLevelLocked(promoRun, levelId)) {
        // Completed rooftops are locked for this run — never replay.
        const nextId = nextIncompleteCampaignLevelId(promoRun)
        if (!nextId || nextId === levelId) {
          setScreen('campaignComplete')
          return false
        }
        levelId = nextId
      }
      if (!promoActive && mode === 'classic' && !isLevelUnlocked(current, levelId)) {
        setProgress(current)
        setScreen('welcome')
        return false
      }
      if (!promoActive && mode === 'timeAttack' && !isTimeAttackLevelAvailable(current, levelId)) {
        setProgress(current)
        setScreen('welcome')
        return false
      }
      const level = getLevelById(levelId)
      if (!level) return false

      if (mode === 'classic') {
        await localProgressService.setSelectedLevel(levelId)
      }
      const withMode = await localProgressService.setPreferredGameMode(mode)
      setProgress(withMode)
      setGameMode(mode)
      setActiveLevelId(levelId)
      setOnlineSubmission({ status: 'idle' })

      // Explicit options.campaignRunId must win: beginPromotionalCampaign calls
      // startLevel before setPromoFlowActive/setPromoRun have re-rendered.
      const runId = resolveAttemptCampaignRunId({
        explicitCampaignRunId: options?.campaignRunId,
        promoFlowActive: promoActive,
        serverBackedRunId: promoRun?.serverBacked ? promoRun.id : null,
      })
      const requiresServerAttempt =
        (options?.requireServerAttempt === true || (promoActive && Boolean(runId))) &&
        isBackendConfigured()
      const session = await maybeStartOnlineAttempt(levelId, mode, runId)
      if (requiresServerAttempt && !session) {
        // Never start a rooftop that looks like a verified event run without a live attempt.
        setOnlineSession(null)
        setOnlineSubmission({
          status: 'unable_to_connect',
          message:
            'Could not start a verified rooftop attempt. Check your connection and try again.',
        })
        return false
      }
      setOnlineSession(session)
      setEngine(createPuzzleEngine(level, { recordActions: session !== null }))
      setEngineKey((k) => k + 1)
      setResult(null)
      setTimeAttackResult(null)
      setScreen('gameplay')
      return true
    },
    [maybeStartOnlineAttempt, promoFlowActive, promoRun],
  )

  const goToLevelSelect = useCallback(async () => {
    // Event mode never exposes level select / mode hubs.
    if (promoFlowActive) {
      setOnlineSession(null)
      setScreen('promoNickname')
      return
    }
    const current = progress ?? (await localProgressService.load())
    setProgress(current)
    setOnlineSession(null)
    setScreen('welcome')
  }, [progress, promoFlowActive])

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
    async (
      nickname: string,
      mode: 'online' | 'offline',
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      await unlockAudio()
      if (mode === 'offline') {
        const run = promotionalCampaignService.createOfflineRun(nickname)
        setPromoRun(run)
        setPromoFlowActive(true)
        const first = getFirstLevel()
        const started = await startLevel(first.id, 'classic', {
          campaignRunId: null,
          promoStarting: true,
        })
        if (!started) {
          setPromoRun(null)
          setPromoFlowActive(false)
          return {
            ok: false,
            message: 'Could not start the local demo. Please try again.',
          }
        }
        return { ok: true }
      }

      const startedRun = await promotionalCampaignService.startServerRun(nickname)
      if (!startedRun.ok) {
        return { ok: false, message: startedRun.message }
      }
      const run = startedRun.run
      setPromoRun(run)
      setPromoFlowActive(true)
      const first = getFirstLevel()
      const startedLevel = await startLevel(first.id, 'classic', {
        campaignRunId: run.id,
        requireServerAttempt: true,
        promoStarting: true,
      })
      if (!startedLevel) {
        setPromoRun(null)
        setPromoFlowActive(false)
        clearPromoRunDraft()
        return {
          ok: false,
          message:
            'Verified challenge started, but the first rooftop could not connect. Tap Retry connection.',
        }
      }
      return { ok: true }
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
      if (promoFlowActive && promoRun?.serverBacked && !onlineSession) {
        setOnlineSubmission({
          status: 'unable_to_connect',
          message:
            'This rooftop finished without a verified online attempt. Retry verification before continuing.',
        })
      } else if (promoFlowActive && promoRun?.serverBacked && onlineSession) {
        // Mark submitting before paint so event mode cannot advance on idle.
        setOnlineSubmission({ status: 'submitting' })
        void submitOnlineIfNeeded(onlineSession, engine, {
          score: levelResult.score,
          durationMs: levelResult.durationMs,
          coveragePercent: levelResult.coveragePercent,
        })
      } else {
        void submitOnlineIfNeeded(onlineSession, engine, {
          score: levelResult.score,
          durationMs: levelResult.durationMs,
          coveragePercent: levelResult.coveragePercent,
        })
      }
      setScreen('levelComplete')
    },
    [engine, onlineSession, promoFlowActive, promoRun, submitOnlineIfNeeded],
  )

  const openCampaignComplete = useCallback(async () => {
    let run = promoRun
    if (!run && progress) {
      // Standalone Classic finish (outside promotional Play Now flow).
      let built = promotionalCampaignService.createOfflineRun('Solar Player')
      for (const levelId of CAMPAIGN_LEVEL_IDS) {
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
    // Event campaign: replays are disabled.
    if (promoFlowActive) return
    void startLevel(activeLevelId, gameMode)
  }, [activeLevelId, gameMode, promoFlowActive, startLevel])

  const handleNextLevel = useCallback(() => {
    const next = promoFlowActive
      ? getNextCampaignLevel(activeLevelId)
      : getNextLevel(activeLevelId)
    if (next) {
      void startLevel(next.id, 'classic', {
        campaignRunId: promoFlowActive && promoRun?.serverBacked ? promoRun.id : null,
      })
    }
  }, [activeLevelId, promoFlowActive, promoRun, startLevel])

  const retryCampaignVerification = useCallback(async () => {
    if (!promoRun) return
    if (!promoRun.serverBacked) {
      // Local/offline completion cannot be upgraded into a genuine voucher run.
      clearPromoRunDraft()
      setPromoRun(null)
      setPromoFlowActive(false)
      setScreen('promoNickname')
      return
    }
    const evaluated = await promotionalCampaignService.evaluateServer(promoRun)
    setPromoRun(evaluated)
  }, [promoRun])

  const nextLevel = result
    ? promoFlowActive
      ? getNextCampaignLevel(result.levelId)
      : getNextLevel(result.levelId)
    : undefined
  const nextUnlocked =
    !!progress &&
    !!nextLevel &&
    (promoFlowActive || progress.unlockedLevels.includes(nextLevel.id))
  const isFinalLevel = promoFlowActive
    ? isFinalCampaignLevel(activeLevelId)
    : activeLevelId === 'decarby-solar-champion'

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
          onContinue={(nickname, mode) => beginPromotionalCampaign(nickname, mode)}
          onBack={() => setScreen('welcome')}
        />
      )}

      {/* Secondary hubs retained in codebase for operators / legacy routes only. */}
      {screen === 'modeSelect' && showOperatorClaims && (
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
          onBack={() => setScreen('welcome')}
        />
      )}

      {screen === 'onlineProfile' && (
        <OnlineProfileScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen('welcome')}
        />
      )}

      {screen === 'solarChampions' && (
        <SolarChampionsScreen
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen(promoRun ? 'voucherDetails' : 'welcome')}
        />
      )}

      {screen === 'rewardCentre' && progress && showOperatorClaims && (
        <RewardCentreScreen
          progress={progress}
          soundEnabled={soundEnabled}
          onToggleSound={() => void toggleSound()}
          onBack={() => setScreen('welcome')}
          onOnlineProfile={() => setScreen('onlineProfile')}
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
          onExit={() => {
            if (promoFlowActive) {
              requestNewPlayer()
              return
            }
            void goToLevelSelect()
          }}
        />
      )}

      {screen === 'levelComplete' && result && progress && (
        <LevelCompleteScreen
          result={result}
          progress={progress}
          onlineSubmission={onlineSubmission}
          nextUnlocked={nextUnlocked}
          isFinalLevel={isFinalLevel}
          eventCampaignMode={promoFlowActive}
          onNextLevel={handleNextLevel}
          onCampaignComplete={() => void openCampaignComplete()}
          onRetryVerification={() => {
            if (onlineSession && engine && result) {
              void submitOnlineIfNeeded(onlineSession, engine, {
                score: result.score,
                durationMs: result.durationMs,
                coveragePercent: result.coveragePercent,
              })
            }
          }}
        />
      )}

      {screen === 'timeAttackResults' && timeAttackResult && showOperatorClaims && (
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
          onRetryVerification={() => void retryCampaignVerification()}
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
          onViewLeaderboard={() => setScreen('solarChampions')}
          onRetryVerification={() => void retryCampaignVerification()}
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
