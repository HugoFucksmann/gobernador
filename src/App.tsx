import { CityWorldCanvas } from './components/CityWorldCanvas';
import { CausalInspectModal } from './components/hud/CausalChainView';
import { CitizenCard } from './components/hud/CitizenCard';
import { GameHudTop } from './components/hud/GameHudTop';
import { PolicyDrawers } from './components/hud/PolicyDrawers';
import { RctStatusBar } from './components/hud/RctStatusBar';
import { OutcomeBanner } from './components/OutcomeBanner';
import { WorldConfigModal } from './components/WorldConfigModal';
import { useGameSession } from './hooks/useGameSession';

export default function App() {
  const session = useGameSession();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#2d4726] text-slate-100">
      {/* 1. Full-Viewport Large Isometric City Stage */}
      <CityWorldCanvas
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        selectedNpcId={session.selectedNpc?.id ?? null}
        filter={session.mapFilter}
        roleFilter="todos"
        lens={session.mapLens}
        followSelected={session.followSelected}
        cameraTarget={session.cameraTarget}
        zoomRequest={session.zoomRequest}
        onSelectNpc={session.selectNpc}
        onOpenSection={session.openLandmarkSection}
        onCancelFollow={session.cancelFollow}
        onHoverInfoChange={session.setHoverInfo}
      />

      {/* 2. Top Governance Bar */}
      <GameHudTop
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        speed={session.speed}
        aiBusy={session.aiBusy}
        aiStatus={session.aiStatus}
        devMode={session.devMode}
        simStepMs={session.simStepMs}
        activeSection={session.activeSection}
        hasConditionAlert={session.hasConditionAlert}
        onTogglePause={session.togglePause}
        onSetSpeed={session.setSpeed}
        onStepDay={session.stepDay}
        onToggleDevMode={() => session.setDevMode(!session.devMode)}
        onForceClimate={session.forceClimatePhenomenon}
        onToggleSection={session.toggleSection}
        onOpenAlerts={session.openAlertsDrawer}
        onOpenObjetivo={() => session.openCiudadTab('objetivo')}
        onOpenNewGame={() => session.setShowConfigModal(true)}
      />

      {/* 3. Right Citizen Inspector / Community Pulse */}
      <CitizenCard
        state={session.state}
        derived={session.derived}
        selectedNpc={session.selectedNpc}
        followSelected={session.followSelected}
        onToggleFollow={() => session.setFollowSelected((f) => !f)}
        onClearSelection={session.clearSelectedNpc}
        onOpenCommunityDrawer={() => session.openCiudadTab('vecinos')}
        onInspectCausal={(title, ref, fallbackText) =>
          session.openCausalInspect({ title, ref, fallbackText })
        }
      />

      {/* 4. Left Centralized Governance Window */}
      {session.activeSection && (
        <PolicyDrawers
          section={session.activeSection}
          state={session.state}
          derived={session.derived}
          aiBusy={session.aiBusy}
          ciudadTabRequest={session.ciudadTabRequest}
          onClose={() => session.setActiveSection(null)}
          onUpdateLevers={session.updateLevers}
          onUpdateMediaIntervention={session.updateMediaIntervention}
          onTriggerPress={session.triggerPressManual}
          onJumpDistrict={session.jumpToDistrict}
          onSelectRoleSample={session.selectRoleSample}
          onSelectNpc={session.selectNpc}
          onInspectCausal={(title, ref, fallbackText) =>
            session.openCausalInspect({ title, ref, fallbackText })
          }
        />
      )}

      {/* 5. Bottom Status & Map Controls Bar */}
      <RctStatusBar
        state={session.state}
        hoverInfo={session.hoverInfo}
        mapLens={session.mapLens}
        mapFilter={session.mapFilter}
        onChangeLens={session.setMapLens}
        onChangeFilter={session.setMapFilter}
        onJumpDistrict={session.jumpToDistrict}
        onZoom={session.requestZoom}
        onOpenPress={() => session.openCiudadTab('gaceta')}
      />

      {session.showConfigModal && (
        <WorldConfigModal
          initialConfig={session.state.config}
          aiAvailable={session.aiAvailable}
          currentDay={session.state.reloj.dia}
          manualSaveMeta={session.manualSaveMeta}
          autoSaveMeta={session.autoSaveMeta}
          onSaveManual={session.saveManual}
          onLoadManual={session.loadManual}
          onLoadAutoSave={session.loadAutoSave}
          onStartNewGame={session.startNewGame}
          onClose={() => session.setShowConfigModal(false)}
        />
      )}

      <OutcomeBanner
        state={session.state}
        derived={session.derived}
        milestoneBannerDismissed={session.milestoneBannerDismissed}
        onDismissMilestone={session.dismissMilestoneBanner}
        onOpenNewGame={() => session.setShowConfigModal(true)}
      />

      {session.causalInspect && (
        <CausalInspectModal
          state={session.state}
          title={session.causalInspect.title}
          startRef={session.causalInspect.ref}
          fallbackText={session.causalInspect.fallbackText}
          onClose={session.closeCausalInspect}
          onSelectNpc={session.selectNpc}
          onJumpDistrict={session.jumpToDistrict}
        />
      )}
    </div>
  );
}
