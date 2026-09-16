// Keep preview navigation independent of p5's processing and export dimensions.
(() => {
  const viewport = document.getElementById('previewViewport');
  const container = document.getElementById('canvas-container');
  const level = document.getElementById('zoomLevel');
  const zoomOut = document.getElementById('zoomOutButton');
  const zoomIn = document.getElementById('zoomInButton');
  const actual = document.getElementById('zoomActualButton');
  const fit = document.getElementById('zoomFitButton');
  const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  let canvas = null;
  let scale = 1;
  let fitMode = true;

  function render(center = null) {
    if (!canvas) return;
    if (fitMode) {
      // Use the outer viewport size so existing scrollbars don't affect fitting.
      scale = Math.min(1, viewport.offsetWidth / canvas.width,
        viewport.offsetHeight / canvas.height);
    }
    canvas.style.setProperty('--preview-width', `${canvas.width * scale}px`);
    canvas.style.setProperty('--preview-height', `${canvas.height * scale}px`);
    level.textContent = `${Math.round(scale * 100)}%`;
    fit.setAttribute('aria-pressed', String(fitMode));
    actual.setAttribute('aria-pressed', String(!fitMode && scale === 1));
    zoomOut.disabled = scale <= steps[0];
    zoomIn.disabled = scale >= steps[steps.length - 1];

    if (fitMode) {
      viewport.scrollTo(0, 0);
    } else if (center) {
      const bounds = canvas.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      viewport.scrollTo(
        viewport.scrollLeft + bounds.left - view.left + center.x * bounds.width - viewport.clientWidth / 2,
        viewport.scrollTop + bounds.top - view.top + center.y * bounds.height - viewport.clientHeight / 2
      );
    }
  }

  function setZoom(nextScale) {
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const center = {
      x: (view.left + viewport.clientWidth / 2 - bounds.left) / bounds.width,
      y: (view.top + viewport.clientHeight / 2 - bounds.top) / bounds.height
    };
    fitMode = false;
    scale = nextScale;
    render(center);
  }

  zoomIn.addEventListener('click', () => {
    setZoom(steps.find(step => step > scale + 0.0001) ?? steps[steps.length - 1]);
  });
  zoomOut.addEventListener('click', () => {
    setZoom([...steps].reverse().find(step => step < scale - 0.0001) ?? steps[0]);
  });
  actual.addEventListener('click', () => setZoom(1));
  fit.addEventListener('click', () => { fitMode = true; render(); });
  document.getElementById('fileInput').addEventListener('change', event => {
    if (event.target.files.length) { fitMode = true; render(); }
  });

  // p5 creates and resizes the canvas asynchronously, including for video.
  new MutationObserver(() => {
    canvas = container.querySelector('canvas');
    render();
  }).observe(container, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['width', 'height'] });
  new ResizeObserver(() => render()).observe(viewport);
})();
