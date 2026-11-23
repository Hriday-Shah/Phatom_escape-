/**
 * Run all tests
 */

import { runPathfindingTest } from './pathfindingTest';

console.log('Running tests...\n');

try {
  runPathfindingTest();
  console.log('\n✅ All tests passed!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Tests failed:', error);
  process.exit(1);
}
