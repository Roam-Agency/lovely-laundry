// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle && links) {
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  links.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => links.classList.remove('open'))
  );
}

// Top bar ticker (mobile): wrap the contact items in a track and clone them so
// the marquee loops seamlessly. On desktop the clones are hidden via CSS and the
// bar lays out as before; if this script doesn't run, the original items still
// show normally.
const topWrap = document.querySelector('.topbar .wrap');
if (topWrap && !topWrap.querySelector('.topbar-track')) {
  const track = document.createElement('div');
  track.className = 'topbar-track';
  while (topWrap.firstChild) track.appendChild(topWrap.firstChild);
  [...track.children].forEach((node) => {
    const clone = node.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('tabindex', '-1');
    clone.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    track.appendChild(clone);
  });
  topWrap.appendChild(track);
}

// Scroll reveal (respects reduced-motion)
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealEls = document.querySelectorAll('.reveal');
if (prefersReduced || !('IntersectionObserver' in window)) {
  revealEls.forEach(el => el.classList.add('in'));
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => io.observe(el));
}
