const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { MotionGateway, BlindType, VoltageMode, Operation } = require('motionblinds');
const { MotionBlindsAccessory } = require('../dist/platformAccessory');
const { MotionBlindsPlatform } = require('../dist/platform');
const mac = 'aabbccddeeff';
const status = { type: BlindType.RollerBlind, currentPosition: 20, currentAngle: 90, voltageMode: VoltageMode.DC, batteryLevel: 800, operation: Operation.OpenUp };
async function api() {
  const { HomebridgeAPI } = await import('../node_modules/homebridge/dist/api.js');
  return new HomebridgeAPI();
}
async function setup(t, config = {}, initial = status, key = '0123456789abcdef') {
  const homebridge = await api();
  const gateway = new EventEmitter(); gateway.key = key;
  const writes = [];
  gateway.writeDevice = async (...args) => { writes.push(args); return { data: initial }; };
  gateway.readDevice = async () => ({ data: initial });
  const accessory = new homebridge.platformAccessory('Fixture blind', homebridge.hap.uuid.generate(mac));
  accessory.context = { mac, deviceType: '10000000', status: initial };
  const platform = { Service: homebridge.hap.Service, Characteristic: homebridge.hap.Characteristic, gateway,
    blindConfigs: new Map([[mac, { mac, ...config }]]), pollSeconds: 10, log: { debug() {}, warn() {}, error() {} } };
  const handler = new MotionBlindsAccessory(platform, accessory);
  t.after(() => handler.dispose());
  return { handler, platform, accessory, writes, C: homebridge.hap.Characteristic, service: accessory.getService(homebridge.hap.Service.WindowCovering) };
}
test('position getters, broadcasts, and command conversion share one inversion rule', async t => {
  for (const invert of [false, true]) {
    const { handler, service, C, writes } = await setup(t, { invert });
    assert.equal(await service.getCharacteristic(C.CurrentPosition).handleGetRequest(), invert ? 20 : 80);
    await service.getCharacteristic(C.TargetPosition).handleSetRequest(75);
    assert.deepEqual(writes[0][2], { targetPosition: invert ? 75 : 25 });
    handler.updateAccessory({ ...status, currentPosition: 40 });
    assert.equal(service.getCharacteristic(C.CurrentPosition).value, invert ? 40 : 60);
    assert.equal(await service.getCharacteristic(C.PositionState).handleGetRequest(), invert ? 1 : 0);
  }
});
test('stale operation cannot keep Home tiles moving; duplicate reports do not stop motion early', async t => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { handler, service, accessory, C } = await setup(t);
  now += 1000; handler.updateAccessory({ ...status, currentPosition: 10 });
  assert.equal(service.getCharacteristic(C.PositionState).value, 1);
  now += 10; handler.updateAccessory({ ...status, currentPosition: 10 });
  assert.equal(service.getCharacteristic(C.PositionState).value, 1);
  now += 10000; handler.updateAccessory({ ...status, currentPosition: 10 });
  assert.equal(await service.getCharacteristic(C.PositionState).handleGetRequest(), 2);
  assert.equal(service.getCharacteristic(C.TargetPosition).value, 90);
  assert.equal(accessory.context.targetPosition, 90);
});
test('mains and unknown battery readings are not reported as low batteries', async t => {
  const mains = await setup(t, {}, { ...status, voltageMode: VoltageMode.AC, batteryLevel: 0 });
  assert.equal(mains.accessory.getService(mains.platform.Service.Battery), undefined);
  const disabled = await setup(t, { battery: false });
  assert.equal(disabled.accessory.getService(disabled.platform.Service.Battery), undefined);
});
test('missing positions and dual-motor payloads do not reach HomeKit', async t => {
  const { handler, service, C } = await setup(t);
  await service.getCharacteristic(C.CurrentPosition).handleGetRequest();
  handler.updateAccessory({ ...status, currentPosition: undefined });
  handler.updateAccessory({ currentPosition_T: 20, currentPosition_B: 50, type: 9 });
  assert.equal(await service.getCharacteristic(C.CurrentPosition).handleGetRequest(), 80);
});
test('no-key controls fail explicitly without writes', async t => {
  const { service, C, writes } = await setup(t, {}, status, undefined);
  // setup default parameters supply a key for undefined; explicitly remove it.
  const other = await setup(t, {}, status, '');
  await assert.rejects(other.service.getCharacteristic(C.TargetPosition).handleSetRequest(50));
  assert.equal(other.writes.length, 0); assert.equal(writes.length, 0);
});
test('polls never overlap and disposed handlers ignore late responses', async t => {
  const { handler, platform } = await setup(t);
  let calls = 0, release;
  platform.gateway.readDevice = async () => { calls++; return new Promise(resolve => release = resolve); };
  const first = handler.poll(); await handler.poll(); assert.equal(calls, 1);
  handler.dispose(); release({ data: { ...status, currentPosition: 40 } }); await first;
  assert.equal(handler.status.currentPosition, 20);
});
test('discovery skips gateway records, handles 28 devices, reuses handlers and stops timers', async t => {
  const homebridge = await api();
  const registered = [], removed = [];
  homebridge.registerPlatformAccessories = (plugin, name, accessories) => registered.push(...accessories);
  homebridge.unregisterPlatformAccessories = (plugin, name, accessories) => removed.push(...accessories);
  homebridge.updatePlatformAccessories = () => {};
  const devices = Array.from({ length: 28 }, (_, i) => ({ mac: (i + 1).toString(16).padStart(12, '0'), deviceType: '10000000' }));
  t.mock.method(MotionGateway.prototype, 'getDeviceList', async () => ({ data: [{ mac, deviceType: '02000002' }, ...devices] }));
  const reads = [];
  t.mock.method(MotionGateway.prototype, 'readDevice', async (id, type) => { reads.push([id, type]); return { data: status }; });
  t.mock.method(MotionGateway.prototype, 'stop', () => {});
  const platform = new MotionBlindsPlatform({ debug() {}, info() {}, warn() {}, error() {} }, { platform: 'MotionBlinds' }, homebridge);
  t.after(() => homebridge.emit('shutdown'));
  await platform.discoverDevices();
  assert.equal(reads.length, 28); assert.equal(registered.length, 28); assert.equal(platform.accessories.length, 28);
  await platform.discoverDevices(); assert.equal(registered.length, 28);
  homebridge.emit('shutdown');
  assert.equal(platform.gateway.listenerCount('report'), 0);
  assert.equal(removed.length, 0);
});
