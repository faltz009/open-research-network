// Set to Twitter OAuth URL when ready. Null shows a "coming soon" state.
const TWITTER_AUTH_URL = null;

const PROJECTS = [
  {
    tag: 'Project 01',
    title: 'Organizational Integrity Analysis',
    lead: 'Open Research Network',
    abstract: 'How do you tell when a company is getting worse because of bad luck or bad structure — versus because the people one level above the workers are actively capturing value for themselves, against the interests of everyone else? This project builds the methodology.',
    relation: 'Most organizational failures are misread as incompetence. The actual driver is usually a small group optimizing for themselves against the system. Naming that pattern precisely — with evidence — is the first step to fixing it.'
  },
  {
    tag: 'Project 02',
    title: 'Smear Campaign Fingerprinting',
    lead: 'Open Research Network',
    abstract: 'Coordinated reputation attacks have a structure. The timing, the framing, the amplification patterns — they leave a trace. This project catalogs those traces so that any observer can distinguish a genuine criticism from a manufactured one.',
    relation: 'Good people get destroyed not because they are wrong but because they cannot prove they are being attacked. A shared fingerprint library changes that. One documented pattern is evidence; a hundred is a standard.'
  },
  {
    tag: 'Project 03',
    title: 'Whistleblower Credibility Framework',
    lead: 'Open Research Network',
    abstract: 'When someone steps forward with inside information, the question is never just "is this true?" It is also "why now, why this person, who benefits if we believe it, and who benefits if we don\'t?" This project offers a structured way to ask those questions.',
    relation: 'The credibility problem cuts both ways. Real whistleblowers get ignored. Planted ones get amplified. A framework that makes both errors visible is more valuable than one that just confirms what we already want to believe.'
  },
  {
    tag: 'Project 04',
    title: 'Power Suppression Index',
    lead: 'Open Research Network',
    abstract: 'When people with power suppress legitimate criticism, they follow a playbook: delay, discredit, exhaust. This project tracks how often that playbook is used in specific institutions and what the outcome was for the person who spoke up.',
    relation: 'The index does not assign blame. It assigns cost. When suppression is cheap and exposure is expensive, the balance tips toward corruption. Making that ratio visible — across many cases, over time — is what changes the incentive structure.'
  }
];

const TRANSITION_OUT_MS = 180;
const TRANSITION_IN_MS = 340;

let index = 0;
let locked = false;

const deck = document.getElementById('supporting-deck');
const dotsHost = document.getElementById('project-dots');
const els = {
  tag: document.getElementById('project-tag'),
  counter: document.getElementById('project-counter'),
  title: document.getElementById('project-title'),
  lead: document.getElementById('project-lead'),
  abstract: document.getElementById('project-abstract'),
  relation: document.getElementById('project-relation'),
  placeholderNum: document.getElementById('placeholder-num'),
  endorseBtn: document.getElementById('endorse-btn'),
  endorseCount: document.getElementById('endorse-count'),
  prev: document.getElementById('project-prev'),
  next: document.getElementById('project-next')
};

function buildDots() {
  dotsHost.innerHTML = '';
  PROJECTS.forEach(function (project, i) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'supporting-dot';
    btn.setAttribute('aria-label', project.title);
    btn.addEventListener('click', function () { goTo(i); });
    dotsHost.appendChild(btn);
  });
}

function syncDots() {
  Array.from(dotsHost.children).forEach(function (dot, i) {
    dot.classList.toggle('active', i === index);
  });
}

function renderProject(i) {
  const project = PROJECTS[i];
  index = i;
  const num = String(i + 1).padStart(2, '0');
  els.tag.textContent = project.tag;
  els.counter.textContent = (i + 1) + ' / ' + PROJECTS.length;
  els.title.textContent = project.title;
  els.lead.textContent = project.lead;
  els.abstract.textContent = project.abstract;
  els.relation.textContent = project.relation;
  els.placeholderNum.textContent = num;
  els.endorseCount.textContent = '';
  els.endorseBtn.textContent = 'Endorse';
  els.endorseBtn.disabled = false;
  els.prev.disabled = i === 0;
  els.next.disabled = i === PROJECTS.length - 1;
  syncDots();
}

function goTo(nextIndex) {
  if (locked || nextIndex < 0 || nextIndex >= PROJECTS.length || nextIndex === index) {
    return;
  }

  locked = true;
  deck.classList.add('is-leaving');

  window.setTimeout(function () {
    renderProject(nextIndex);
    deck.classList.remove('is-leaving');
    deck.classList.add('is-entering');

    requestAnimationFrame(function () {
      deck.classList.add('is-entering-active');
    });

    window.setTimeout(function () {
      deck.classList.remove('is-entering', 'is-entering-active');
      locked = false;
    }, TRANSITION_IN_MS);
  }, TRANSITION_OUT_MS);
}

els.prev.addEventListener('click', function () { goTo(index - 1); });
els.next.addEventListener('click', function () { goTo(index + 1); });

document.addEventListener('keydown', function (event) {
  if (event.key === 'ArrowLeft') goTo(index - 1);
  if (event.key === 'ArrowRight') goTo(index + 1);
});

els.endorseBtn.addEventListener('click', function () {
  if (TWITTER_AUTH_URL) {
    window.location.href = TWITTER_AUTH_URL;
  } else {
    els.endorseBtn.textContent = 'Coming soon';
    els.endorseBtn.disabled = true;
    window.setTimeout(function () {
      els.endorseBtn.textContent = 'Endorse';
      els.endorseBtn.disabled = false;
    }, 2000);
  }
});

buildDots();
renderProject(0);
