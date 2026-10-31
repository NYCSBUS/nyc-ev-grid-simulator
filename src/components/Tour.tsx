import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useStore } from '../state/store';

const LS_KEY = 'evsim.tour.seen.v1';

export function useTour() {
  const tourRequested = useStore((s) => s.tourRequested);
  const requestTour = useStore((s) => s.requestTour);
  const setPanel = useStore((s) => s.setPanel);
  const setTab = useStore((s) => s.setTab);

  useEffect(() => {
    const seen = localStorage.getItem(LS_KEY);
    if (!seen && !tourRequested) {
      const t = setTimeout(() => requestTour(true), 1200);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tourRequested) return;
    setTab('map');
    setPanel('scenario');
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.6,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Start exploring',
      onDestroyed: () => {
        localStorage.setItem(LS_KEY, '1');
        requestTour(false);
      },
      steps: [
        {
          popover: {
            title: 'NYC EV Load Growth Simulator',
            description:
              'Test where new EV charging load can land on Con Edison\'s grid. This 90-second tour shows the main controls. You can replay it any time from Help.',
          },
        },
        {
          element: '#tour-search',
          popover: { title: 'Search an address', description: 'Type any NYC address, landmark or neighbourhood. Picking a result flies the map there and offers to drop a charging site.', side: 'bottom' },
        },
        {
          element: '#tour-map',
          popover: {
            title: 'The map',
            description:
              'Con Edison networks (blue), disadvantaged communities (orange dash), and — as you zoom in — EV transformers, feeders coloured by headroom, and NYC buildings. Click anything for its attributes.',
            side: 'left',
          },
        },
        {
          element: '#tour-add-site',
          popover: { title: 'Add a site', description: 'Click, then click the map to place a charging site. Shift-clicking a building also works and picks up its MapPLUTO address.', side: 'right' },
        },
        {
          element: '#tour-scenario',
          popover: {
            title: 'Scenario panel',
            description:
              'Each site card shows its status. Select one to edit charger mix, use profile, utilization, managed charging and storage — and to see the impact list for nearby transformers, feeders, plates and the network.',
            side: 'right',
          },
        },
        {
          element: '#tour-area',
          popover: { title: 'Area-wide adoption', description: 'Switch on to simulate organic EV growth for any year to 2045. Tracts shade by added kW/km² and networks colour by stress.', side: 'right' },
        },
        {
          element: '#tour-rail-layers',
          popover: { title: 'Layers', description: 'Toggle every Con Edison, NYC and Census layer. Heavy layers stream live when you zoom in.', side: 'right' },
          onHighlightStarted: () => setPanel('layers'),
        },
        {
          element: '#tour-rail-filters',
          popover: { title: 'Filters', description: 'Filter transformers by voltage and capacity range, feeders by headroom, buildings by land use and unit count, and colour tracts by demographics.', side: 'right' },
          onHighlightStarted: () => setPanel('filters'),
        },
        {
          element: '#tour-rail-settings',
          popover: { title: 'Model settings', description: 'Season, peak hour, status thresholds, kVA per transformer range, and all cost/incentive assumptions. Saved with the scenario.', side: 'right' },
          onHighlightStarted: () => setPanel('settings'),
        },
        {
          element: '#tour-rail-missions',
          popover: { title: 'Missions', description: 'Optional challenges modelled on the EV Strategy team\'s real tasks: equity hubs, managed depots, 2030 outlooks, budget portfolios.', side: 'right' },
          onHighlightStarted: () => setPanel('missions'),
        },
        {
          element: '#tour-rail-saved',
          popover: { title: 'Save, share, compare', description: 'Save scenarios in your browser, copy a share link that encodes the whole scenario, export JSON, or pick a saved scenario to compare in Analytics.', side: 'right' },
          onHighlightStarted: () => setPanel('saved'),
        },
        {
          element: '#tour-tab-analytics',
          popover: { title: 'Analytics', description: 'Hourly load curves, asset loading, cost breakdown, adoption curves, network stress tables, scenario comparison and CSV/PNG export.', side: 'bottom' },
        },
        {
          element: '#tour-tab-help',
          popover: { title: 'Help', description: 'Illustrated explanations of hosting capacity, coincidence, diversity, the area model, DACs and data caveats. Hover any (?) in the app for a quick definition.', side: 'bottom' },
          onHighlightStarted: () => setPanel('scenario'),
        },
      ],
    });
    d.drive();
    return () => d.destroy();
  }, [tourRequested]); // eslint-disable-line react-hooks/exhaustive-deps
}
