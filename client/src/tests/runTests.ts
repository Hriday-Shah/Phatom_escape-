/**
 * Run all tests
 */

import { runPathfindingTest } from './pathfindingTest';
import { runManifestTest } from './manifestTest';

console.log('Running tests...\n');

try {
  runManifestTest();
  runPathfindingTest();
  console.log('\n✅ All tests passed!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Tests failed:', error);
  process.exit(1);
}
