// Keep the entry independent of the dependency graph so loading failures are
// visible even when React, styles, or a cached development module cannot load.
async function mountInstrument() {
  try {
    const [React, { createRoot }, { default: App }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./App'),
      import('./styles.css'),
    ]);
    createRoot(document.getElementById('root')!).render(React.createElement(App));
  } catch (error) {
    console.error('Instrument startup failed:', error);
    const status = document.getElementById('startup-status');
    if (status) status.textContent = 'The instrument could not load. Please reload to try again.';
    const details = document.getElementById('startup-details');
    if (details) { details.hidden = false; details.textContent = error instanceof Error ? error.message : String(error); }
    const retry = document.getElementById('startup-retry');
    if (retry) retry.hidden = false;
  }
}

void mountInstrument();
