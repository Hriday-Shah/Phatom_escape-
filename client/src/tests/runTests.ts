/**
 * Run all tests
 */

import { runPathfindingTest } from './pathfindingTest';
import { runManifestTest } from './manifestTest';
import { runGapRuleTest } from './gapRuleTest';
import { runContainmentTest } from './containmentTest';
import { runShellLayoutTest } from './shellLayoutTest';
import { runTargetingTest } from './targetingTest';
import { runRealTimerTest } from './realTimerTest';
import { runHomeSettingsTest } from './homeSettingsTest';
import { runLobbyTest } from './lobbyTest';
import { runFacingFilterTest } from './facingFilterTest';
import { runNetTest } from './netTest';
import { runOnlineSpawnTest } from './onlineSpawnTest';
import { runMinigameTest } from './minigameTest';

console.log('Running tests...\n');

try {
  runManifestTest();
  runPathfindingTest();
  runGapRuleTest();
  runContainmentTest();
  runShellLayoutTest();
  runTargetingTest();
  runRealTimerTest();
  runHomeSettingsTest();
  runLobbyTest();
  runFacingFilterTest();
  runNetTest();
  runOnlineSpawnTest();
  runMinigameTest();
  console.log('\n✅ All tests passed!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Tests failed:', error);
  process.exit(1);
}
