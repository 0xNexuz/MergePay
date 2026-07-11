const form = document.querySelector('#settle-form');
const result = document.querySelector('#result');
const apiStatus = document.querySelector('#api-status');

document.documentElement.classList.add('js-motion');
const motionTargets = document.querySelectorAll('.reveal, .product-window');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.16, rootMargin: '0px 0px -40px' });
motionTargets.forEach(target => observer.observe(target));

const progress = document.querySelector('.scroll-progress span');
const nav = document.querySelector('.site-header');
let ticking = false;
function updateScrollEffects() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  nav.classList.toggle('scrolled', scrollY > 80);
  ticking = false;
}
addEventListener('scroll', () => {
  if (!ticking) { requestAnimationFrame(updateScrollEffects); ticking = true; }
}, { passive: true });
updateScrollEffects();

const tiltCard = document.querySelector('.tilt-card');
if (tiltCard && !matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(hover: hover)').matches) {
  tiltCard.addEventListener('pointermove', event => {
    const rect = tiltCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    tiltCard.style.transform = `perspective(1200px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg) translateY(-3px)`;
  });
  tiltCard.addEventListener('pointerleave', () => { tiltCard.style.transform = ''; });
}

fetch('/api/health').then(r => r.json()).then(data => {
  apiStatus.textContent = `● Agent online · ${data.keeperHubMode}`;
  apiStatus.classList.add('online');
  const modeLabel = document.querySelector('#mode-label');
  if (modeLabel) modeLabel.textContent = data.keeperHubMode === 'live' ? 'LIVE · KEEPERHUB' : 'SAFE · MOCK MODE';
}).catch(() => { apiStatus.textContent = '● Agent unavailable'; });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const label = button.querySelector('.button-label');
  button.disabled = true; label.textContent = 'Agent evaluating…';
  result.className = 'result';
  const data = new FormData(form);
  const payload = {
    deliveryId: `web-${Date.now()}`,
    repository: data.get('repository'),
    pullRequest: Number(data.get('pullRequest')),
    merged: data.get('merged') === 'on',
    labels: data.get('approved') === 'on' ? ['bounty-approved'] : [],
    contributor: 'demo-contributor',
    recipient: data.get('recipient'),
    amountUsd: Number(data.get('amountUsd'))
  };
  try {
    const response = await fetch('/api/bounties/settle', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.decision?.reasons?.join(' · ') || body.error || 'Execution rejected');
    const hash = body.receipt?.transactionHash || 'Awaiting confirmation';
    result.className = 'result show ok';
    result.innerHTML = `<b>✓ BOUNTY APPROVED & EXECUTED</b><br>Provider: ${body.receipt.provider}<br>Execution: ${body.receipt.executionId}<br>Transaction: ${hash}`;
  } catch (error) {
    result.className = 'result show error';
    result.textContent = `× NOT EXECUTED — ${error.message}`;
  } finally { button.disabled = false; label.textContent = 'Evaluate & execute'; }
});
