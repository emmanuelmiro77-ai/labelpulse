// Smoke test: import Bugsnag packages, ensure they load without crashing
process.env.NODE_ENV = 'production';
process.env.NEXT_PUBLIC_BUGSNAG_API_KEY = '1fa4d8a88468f9c892f1c59e9305cd2c';
process.env.BUGSNAG_API_KEY = '1fa4d8a88468f9c892f1c59e9305cd2c';

const BugsnagMod = await import('@bugsnag/js');
const Bugsnag = BugsnagMod.default;
const ReactPluginMod = await import('@bugsnag/plugin-react');
const BugsnagPluginReact = ReactPluginMod.default;
const PerfMod = await import('@bugsnag/browser-performance');
const BugsnagPerformance = PerfMod.default;

console.log('Bugsnag.start:', typeof Bugsnag.start);
console.log('Bugsnag.notify:', typeof Bugsnag.notify);
console.log('Bugsnag.getPlugin:', typeof Bugsnag.getPlugin);
console.log('BugsnagPluginReact:', typeof BugsnagPluginReact);
console.log('BugsnagPerformance.start:', typeof BugsnagPerformance.start);

// Init
Bugsnag.start({
  apiKey: process.env.BUGSNAG_API_KEY,
  plugins: [new BugsnagPluginReact()],
  enabledReleaseStages: ['production'],
  releaseStage: 'production',
});

BugsnagPerformance.start({
  apiKey: process.env.BUGSNAG_API_KEY,
  releaseStage: 'production',
  enabledReleaseStages: ['production'],
});

console.log('Has _client after start:', !!Bugsnag._client);
const reactPlugin = Bugsnag.getPlugin('react');
console.log('reactPlugin present:', !!reactPlugin);

// Notify (will not actually deliver from this test script, but should not throw)
Bugsnag.notify(new Error('Test error from smoke script'));
console.log('Notify did not throw');

console.log('SMOKE TEST PASSED');
