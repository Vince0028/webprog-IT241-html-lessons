document.addEventListener('DOMContentLoaded', async function () {
  const username = 'Vince0028';
  const calendarEl = document.getElementById('github-calendar');
  if (!calendarEl) return;

  function renderSkeleton() {
    const skeleton = `
      <div class="contrib-header">Loading contributions...</div>
      <div class="contrib-calendar">
        <div class="contrib-months"></div>
        <div class="contrib-days">
          <span style="grid-row: 2;">Mon</span>
          <span style="grid-row: 4;">Wed</span>
          <span style="grid-row: 6;">Fri</span>
        </div>
        <div class="contrib-grid">${'<div class="contrib-week">' + '<div class="contrib-day empty"></div>'.repeat(7) + '</div>'.repeat(26)}</div>
        <div class="contrib-legend">
          <span>Less</span>
          <div class="contrib-day level-0"></div>
          <div class="contrib-day level-1"></div>
          <div class="contrib-day level-2"></div>
          <div class="contrib-day level-3"></div>
          <div class="contrib-day level-4"></div>
          <span>More</span>
        </div>
      </div>
    `;
    calendarEl.innerHTML = skeleton;
  }

  function renderCalendar(data) {
    if (!data || !data.contributions) return;

    const contributions = data.contributions.slice();
    const totalContributions = data.total ? data.total[Object.keys(data.total)[0]] : 0;

    const lastDate = new Date(contributions[contributions.length - 1].date);
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    let currentDate = new Date(lastDate);
    currentDate.setDate(currentDate.getDate() + 1);
    while (currentDate <= endOfYear) {
      contributions.push({ date: currentDate.toISOString().split('T')[0], count: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const weeks = [];
    let week = [];
    contributions.forEach((d, idx) => {
      const dow = new Date(d.date).getDay();
      week[dow] = d;
      if (dow === 6 || idx === contributions.length - 1) {
        weeks.push(week.slice());
        week = [];
      }
    });

    let html = `<div class="contrib-header">${(totalContributions || 0).toLocaleString()} contributions in the last year</div>`;
    html += `<div class="contrib-calendar">`;
    html += `<div class="contrib-months">`;
    const monthPositions = {};
    weeks.forEach((w, i) => {
      for (let j = 0; j < 7; j++) {
        const day = w[j];
        if (day) {
          const dt = new Date(day.date);
          const key = `${dt.getFullYear()}-${dt.getMonth()}`;
          if (!(key in monthPositions)) monthPositions[key] = i;
        }
      }
    });
    Object.keys(monthPositions).forEach(k => {
      const i = monthPositions[k];
      const year = parseInt(k.split('-')[0], 10);
      const month = parseInt(k.split('-')[1], 10);
      const label = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' });
      const left = i * 14.5;
      html += `<span style="left:${left}px">${label}</span>`;
    });
    html += `</div>`;

    html += `<div class="contrib-days">`;
    html += `<span style="grid-row: 2;">Mon</span>`;
    html += `<span style="grid-row: 4;">Wed</span>`;
    html += `<span style="grid-row: 6;">Fri</span>`;
    html += `</div>`;

    html += `<div class="contrib-grid">`;

    let maxContribution = 0;
    contributions.forEach(d => {
      if (d.count > maxContribution) maxContribution = d.count;
    });

    const levelThresholds = [0];
    if (maxContribution > 0) {
      levelThresholds.push(Math.ceil(maxContribution * 0.25));
      levelThresholds.push(Math.ceil(maxContribution * 0.5));
      levelThresholds.push(Math.ceil(maxContribution * 0.75));
    }

    weeks.forEach(w => {
      html += `<div class="contrib-week">`;
      for (let i = 0; i < 7; i++) {
        const day = w[i];
        if (!day) { html += `<div class="contrib-day empty"></div>`; continue; }
        const c = day.count || 0;
        let level = 0;
        if (c > 0) {
          if (c >= levelThresholds[3]) level = 4;
          else if (c >= levelThresholds[2]) level = 3;
          else if (c >= levelThresholds[1]) level = 2;
          else level = 1;
        }
        const dt = new Date(day.date);
        const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        html += `<div class="contrib-day level-${level}" data-count="${c}" data-date="${dateStr}" title="${c} contribution${c !== 1 ? 's' : ''} on ${dateStr}"></div>`;
      }
      html += `</div>`;
    });
    html += `</div>`; // .contrib-grid

    html += `<div class="contrib-legend">`;
    html += `<span>Less</span>`;
    html += `<div class="contrib-day level-0"></div>`;
    html += `<div class="contrib-day level-1"></div>`;
    html += `<div class="contrib-day level-2"></div>`;
    html += `<div class="contrib-day level-3"></div>`;
    html += `<div class="contrib-day level-4"></div>`;
    html += `<span>More</span>`;
    html += `</div>`; // .contrib-legend

    html += `</div>`; // .contrib-calendar

    calendarEl.innerHTML = html;
  }

  const cacheKey = 'gh_contribs_' + username;
  let cachedData = null;

  // 1. Try to load from cache first
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Valid if less than 12 hours old
      if (parsed && parsed.ts && Date.now() - parsed.ts < 12 * 60 * 60 * 1000 && parsed.data) {
        cachedData = parsed.data;
        renderCalendar(cachedData);
      }
    }
  } catch (e) {
    console.warn('Cache read error', e);
  }

  // 2. If no cache was rendered, show skeleton
  if (!cachedData) {
    renderSkeleton();
  }

  // 3. Fetch fresh data regardless (to update in background or initial load)
  // Delay slightly to prioritize main thread for other animations
  setTimeout(async () => {
    try {
      const resp = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`, { signal: AbortSignal.timeout(6000) });
      if (!resp.ok) throw new Error('Network error');
      const data = await resp.json();
      if (!data || !data.contributions) throw new Error('No data');

      // Check if we need to update
      const needsUpdate = !cachedData || JSON.stringify(data) !== JSON.stringify(cachedData);

      if (needsUpdate) {
        console.log('GitHub contributions updated');
        renderCalendar(data);
        // Update cache
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) { }
      }
    } catch (err) {
      console.error('Error fetching GitHub contributions:', err);
      // Only show error if we haven't shown anything yet
      if (!cachedData) {
        if (calendarEl.querySelector('.contrib-header')) {
          calendarEl.querySelector('.contrib-header').textContent = 'Contributions unavailable (Network/API Error)';
          calendarEl.querySelector('.contrib-header').style.color = '#ff6b6b';
        }
      }
    }
  }, cachedData ? 2000 : 0); // If we have cache, delay fetch longer. If not, fetch immediately (0ms delay but next tick).
});


