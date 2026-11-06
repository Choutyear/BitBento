const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const tickerTrack = document.querySelector('.ticker-track');
const tickerSource = tickerTrack?.querySelector('.ticker-sequence')?.cloneNode(true);
let tickerResizeTimer;

function buildTicker() {
  if (!tickerTrack || !tickerSource) return;
  const groups = tickerTrack.querySelectorAll('.ticker-group');
  groups.forEach((group, index) => {
    if (index > 0) group.remove();
  });
  const firstGroup = tickerTrack.querySelector('.ticker-group');
  firstGroup.replaceChildren(tickerSource.cloneNode(true));
  while (firstGroup.scrollWidth < window.innerWidth * 1.35) {
    firstGroup.appendChild(tickerSource.cloneNode(true));
  }
  const duplicate = firstGroup.cloneNode(true);
  duplicate.setAttribute('aria-hidden', 'true');
  tickerTrack.appendChild(duplicate);
  const shift = firstGroup.getBoundingClientRect().width;
  tickerTrack.style.setProperty('--ticker-shift', `${shift}px`);
  tickerTrack.style.setProperty('--ticker-duration', `${Math.max(22, shift / 58)}s`);
  tickerTrack.style.animation = 'none';
  void tickerTrack.offsetWidth;
  tickerTrack.style.animation = '';
}

buildTicker();
window.addEventListener('resize', () => {
  window.clearTimeout(tickerResizeTimer);
  tickerResizeTimer = window.setTimeout(buildTicker, 180);
}, { passive: true });

window.addEventListener('load', () => {
  const previewTarget = new URLSearchParams(window.location.search).get('preview');
  const selector = previewTarget ? `#${previewTarget}` : window.location.hash;
  if (!selector) return;
  window.setTimeout(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    const previousBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
    window.requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousBehavior;
    });
  }, 120);
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => {
  element.style.setProperty('--delay', `${element.dataset.delay || 0}ms`);
  revealObserver.observe(element);
});

window.setTimeout(() => {
  document.querySelectorAll('.reveal:not(.visible)').forEach((element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.top < window.innerHeight * 1.15) element.classList.add('visible');
  });
}, 700);

const counters = document.querySelectorAll('[data-count]');
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const counter = entry.target;
    if (!entry.isIntersecting || counter.dataset.done) return;
    counter.dataset.done = 'true';
    const target = Number(counter.dataset.count);
    if (reducedMotion) {
      counter.textContent = String(target);
      countObserver.unobserve(counter);
      return;
    }
    counter.textContent = '0';
    counter.classList.add('is-counting');
    const started = performance.now();
    const update = (now) => {
      const progress = Math.min((now - started) / 1350, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      counter.textContent = String(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        counter.classList.remove('is-counting');
        countObserver.unobserve(counter);
      }
    };
    requestAnimationFrame(update);
  });
}, { threshold: 0.28 });
counters.forEach((counter) => countObserver.observe(counter));

const screen = document.querySelector('.screen-frame');
document.querySelectorAll('.mode-switch button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-switch button').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    screen.dataset.view = button.dataset.focus;
  });
});

if (!reducedMotion) {
  const glow = document.querySelector('.cursor-glow');
  window.addEventListener('pointermove', (event) => {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
  }, { passive: true });

  const tilt = document.querySelector('.tilt-card');
  tilt.addEventListener('pointermove', (event) => {
    const bounds = tilt.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    tilt.style.transform = `rotateY(${x * 7 - 4}deg) rotateX(${y * -6 + 2}deg)`;
  });
  tilt.addEventListener('pointerleave', () => {
    tilt.style.transform = 'rotateY(-4deg) rotateX(2deg)';
  });
}
