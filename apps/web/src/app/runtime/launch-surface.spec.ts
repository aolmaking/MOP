import { heldBackSurfaces, isHeldBack, visibleNavigation } from './launch-surface';

describe('launch surface', () => {
  it('holds back every page under a held-back role, not just its root', () => {
    // The scope defers the Data Analyst role, all seven pages of it. A
    // manifest that only matched the root would leave six live links.
    expect(isHeldBack('/analyst')).toBe(true);
    expect(isHeldBack('/analyst/saved-views')).toBe(true);
  });

  it('does not hold back a route that merely starts with the same letters', () => {
    // The reason the prefix match is on a path boundary rather than a
    // bare startsWith: an unrelated future `/analyst-training` must not
    // silently disappear from a rail.
    expect(isHeldBack('/analyst-training')).toBe(false);
  });

  it('leaves the launch surface alone', () => {
    for (const route of ['/branch/attention', '/tech/work', '/inventory/requests', '/owner/pricing', '/customer']) {
      expect(isHeldBack(route)).toBe(false);
    }
  });

  it('filters a rail without disturbing the order of what remains', () => {
    const rail = [
      { label: 'Home', route: '/owner/home' },
      { label: 'Messages', route: '/owner/messages' },
      { label: 'Pricing', route: '/owner/pricing' },
    ];

    expect(visibleNavigation(rail).map((item) => item.label)).toEqual(['Home', 'Pricing']);
  });

  /**
   * Hide is not delete, and the difference has to be legible to whoever
   * writes the handover document listing every deferral.
   */
  it('says why each surface is held back', () => {
    for (const entry of heldBackSurfaces()) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });
});
