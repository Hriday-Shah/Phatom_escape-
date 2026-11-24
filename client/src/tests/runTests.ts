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

console.log('Running tests...\n');

try {
  runManifestTest();
  runPathfindingTest();
  runGapRuleTest();
  runContainmentTest();
  runShellLayoutTest();
  runTargetingTest();
  runRealTimerTest();
  console.log('\n✅ All tests passed!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Tests failed:', error);
  process.exit(1);
}
