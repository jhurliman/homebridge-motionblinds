import DeviceManager from '../src/deviceManager';

describe('DeviceManager', () => {
  test('should store and emit device updates', async () => {
    const dm = new DeviceManager({ logger: { debug: () => {}, info: () => {}, error: () => {} } });

    // Simulate clients by directly emitting events from the manager's clients
    const device = { id: 'dev-1', name: 'Test Blind', position: 50 };

    let updated: any = null;
    dm.on('deviceUpdated', (d) => { updated = d; });

    // Add device through internal API
    (dm as any).addOrUpdateDevice(device, true);

    expect(dm.getDevice('dev-1')).toBeDefined();
    expect(dm.getDevice('dev-1')!.position).toBe(50);
    expect(updated).not.toBeNull();
    expect(updated.id).toBe('dev-1');
  });
});
