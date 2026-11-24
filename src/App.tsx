import { CityWorldCanvas } from './components/CityWorldCanvas';
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
      {/* 1. Full-Viewport Large Isometric RCT City Stage */}
      <CityWorldCanvas
        state={session.state}
        paused={session.paused}
        selectedNpcId={session.selectedNpc?.id ?? null}
        filter={session.mapFilter}
        roleFilter="todos"
        lens={session.mapLens}
        followSelected={session.followSelected}
        cameraTarget={session.cameraTarget}
        zoomRequest={session.zoomRequest}
        onSelectNpc={session.selectNpc}
        onOpenSection={session.setActiveSection}
        onCancelFollow={session.cancelFollow}
        onHoverInfoChange={session.setHoverInfo}
      />

      {/* 2. RCT Compact Top Toolbar */}
      <GameHudTop
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        speed={session.speed}
        aiBusy={session.aiBusy}
        activeSection={session.activeSection}
        hasConditionAlert={session.hasConditionAlert}
        onTogglePause={session.togglePause}
        onSetSpeed={session.setSpeed}
        onStepDay={session.stepDay}
        onToggleSection={session.toggleSection}
        onOpenNewGame={() => session.setShowConfigModal(true)}
      />

      {/* 3. Draggable Right Citizen Inspector Window / Community Pulse */}
      <CitizenCard
        state={session.state}
        derived={session.derived}
        selectedNpc={session.selectedNpc}
        followSelected={session.followSelected}
        thoughtLoading={session.thoughtLoading}
        onToggleFollow={() => session.setFollowSelected((f) => !f)}
        onClearSelection={session.clearSelectedNpc}
        onRefreshThought={session.refreshNpcThought}
        onOpenCommunityDrawer={() => session.setActiveSection('ciudad')}
      />

      {/* 4. Draggable Left Governance Window (compact RCT floating window) */}
      {session.activeSection && (
        <PolicyDrawers
          section={session.activeSection}
          state={session.state}
          derived={session.derived}
          aiBusy={session.aiBusy}
          mapFilter={session.mapFilter}
          mapLens={session.mapLens}
          onClose={() => session.setActiveSection(null)}
          onUpdateLevers={session.updateLevers}
          onUpdateMediaIntervention={session.updateMediaIntervention}
          onTriggerPress={session.triggerPressManual}
          onChangeMapFilter={session.setMapFilter}
          onChangeMapLens={session.setMapLens}
          onJumpDistrict={session.jumpToDistrict}
          onSelectRoleSample={session.selectRoleSample}
        />
      )}

      {/* 5. Thin RCT Bottom Status Bar */}
      <RctStatusBar
        state={session.state}
        hoverInfo={session.hoverInfo}
        mapLens={session.mapLens}
        onChangeLens={session.setMapLens}
        onJumpDistrict={session.jumpToDistrict}
        onZoom={session.requestZoom}
        onOpenPress={() => session.setActiveSection('prensa')}
      />

      {session.showConfigModal && (
        <WorldConfigModal
          initialConfig={session.state.config}
          aiAvailable={session.aiAvailable}
          onStartNewGame={session.startNewGame}
          onClose={() => session.setShowConfigModal(false)}
        />
      )}

      <OutcomeBanner
        state={session.state}
        derived={session.derived}
        onOpenNewGame={() => session.setShowConfigModal(true)}
      />
    </div>
  );
}
