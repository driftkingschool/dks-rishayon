/* =====================================================
   DKS Sport Driving License Course - Landing Page Logic
   ===================================================== */

'use strict';

const CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxlZOG-IpkM85PUbLVKdE4mHWPWdhA10RFzbUMpu9eRywLPqoeE4ZKQTLsZLG1M1AOFiw/exec'
};

/* ================= NAV ================= */
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');

function updateNavOnScroll() {
  if (window.scrollY > 12) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
}
window.addEventListener('scroll', updateNavOnScroll, { passive: true });
updateNavOnScroll();

navToggle.addEventListener('click', () => {
  const open = navMobile.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

navMobile.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navMobile.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* ================= STATUS BANNER (CardCom return) ================= */
const STATUS_COPY = {
  success: {
    icon: '✓',
    title: 'התשלום בוצע. ההרשמה אושרה.',
    msg: 'קבלה רשמית נשלחה לאימייל. ניצור איתך קשר תוך 24 שעות עם פרטי המחזור הקרוב.',
    cls: 'status-success'
  },
  failed: {
    icon: '!',
    title: 'התשלום לא הצליח.',
    msg: 'אפשר לנסות שוב או לחייג 053-775-7323. ההרשמה לא נשמרה.',
    cls: 'status-failed'
  },
  cancel: {
    icon: 'i',
    title: 'התשלום בוטל.',
    msg: 'אפשר לחזור ולמלא את הטופס שוב. אם יש שאלה, חייג 053-775-7323.',
    cls: 'status-cancel'
  }
};

function showStatusBanner(status) {
  const copy = Object.prototype.hasOwnProperty.call(STATUS_COPY, status) ? STATUS_COPY[status] : null;
  if (!copy) return;
  const el = document.getElementById('statusBanner');
  el.className = 'status-banner ' + copy.cls;
  el.hidden = false;
  el.innerHTML = `<span class="status-icon" aria-hidden="true">${copy.icon}</span><div><h2>${copy.title}</h2><p>${copy.msg}</p></div>`;
  if (status === 'success') {
    // Hide the form on success
    document.getElementById('registerForm').style.display = 'none';
    document.querySelector('.price-card').style.display = 'none';
  }
}

(() => {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  if (status && Object.prototype.hasOwnProperty.call(STATUS_COPY, status)) {
    showStatusBanner(status);
    window.scrollTo({ top: document.getElementById('register').offsetTop - 100, behavior: 'instant' });
  }
})();

/* ================= FORM ================= */
const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const feedback = document.getElementById('formFeedback');

const FIELDS = ['fullName', 'birthDate', 'email', 'idNumber', 'phone', 'examDate'];
// Category is fixed for this LP - only "רכבים" is offered, so we hardcode the value
// (server-side whitelist in Apps Script still validates it).
const FIXED_CATEGORY = 'רכבים';

function setErr(name, msg) {
  const input = form.querySelector(`[name="${name}"]`);
  const err = form.querySelector(`.field-error[data-for="${name}"]`);
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (err) err.textContent = msg || '';
}

function clearAllErrors() {
  FIELDS.forEach(f => setErr(f, ''));
}

function validate(values) {
  let ok = true;
  const errs = {};

  if (!values.fullName || values.fullName.trim().length < 2) {
    errs.fullName = 'שם מלא חובה (מינימום 2 תווים)';
    ok = false;
  }

  if (!values.birthDate) {
    errs.birthDate = 'תאריך לידה חובה';
    ok = false;
  } else {
    const d = new Date(values.birthDate);
    const now = new Date();
    if (isNaN(d.getTime())) {
      errs.birthDate = 'תאריך לידה לא תקין';
      ok = false;
    } else {
      // Calendar-based age: someone whose 14th birthday is today must pass.
      let age = now.getFullYear() - d.getFullYear();
      const beforeBirthday = now.getMonth() < d.getMonth() ||
        (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
      if (beforeBirthday) age--;
      if (age < 14) {
        errs.birthDate = 'הקורס מחייב גיל 14 ומעלה';
        ok = false;
      } else if (age > 100) {
        errs.birthDate = 'תאריך לידה לא תקין';
        ok = false;
      }
    }
  }

  if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    errs.email = 'אימייל לא תקין';
    ok = false;
  }

  if (!values.idNumber || !/^\d{9}$/.test(values.idNumber)) {
    errs.idNumber = 'תעודת זהות חייבת להיות 9 ספרות';
    ok = false;
  } else if (!isValidIsraeliId(values.idNumber)) {
    errs.idNumber = 'תעודת זהות לא תקינה (ספרת ביקורת)';
    ok = false;
  }

  if (!values.phone || !/^05\d{8}$/.test(values.phone)) {
    errs.phone = 'מספר טלפון חייב להיות 10 ספרות שמתחילות ב-05';
    ok = false;
  }

  if (!values.examDate) {
    errs.examDate = 'בחר תאריך מבחן';
    ok = false;
  }

  return { ok, errs };
}

function isValidIsraeliId(id) {
  if (!/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(id[i], 10);
    const factor = (i % 2) + 1;
    let product = digit * factor;
    if (product > 9) product -= 9;
    sum += product;
  }
  return sum % 10 === 0;
}

function setFeedback(type, message) {
  feedback.className = 'form-feedback';
  feedback.classList.add('show', type);
  feedback.textContent = message;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  feedback.classList.remove('show');
  clearAllErrors();

  const fd = new FormData(form);
  const values = {
    fullName: (fd.get('fullName') || '').toString().trim(),
    birthDate: (fd.get('birthDate') || '').toString().trim(),
    email: (fd.get('email') || '').toString().trim(),
    idNumber: (fd.get('idNumber') || '').toString().trim(),
    phone: (fd.get('phone') || '').toString().trim(),
    examDate: (fd.get('examDate') || '').toString().trim()
  };

  const v = validate(values);
  if (!v.ok) {
    Object.entries(v.errs).forEach(([k, msg]) => setErr(k, msg));
    const firstErrField = Object.keys(v.errs)[0];
    const firstEl = form.querySelector(`[name="${firstErrField}"]`);
    if (firstEl) firstEl.focus();
    return;
  }

  const [year, month, day] = values.birthDate.split('-').map(s => parseInt(s, 10));

  const payload = {
    formType: 'licenseCourse',
    fullName: values.fullName,
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    email: values.email,
    idNumber: values.idNumber,
    phone: values.phone,
    category: FIXED_CATEGORY,
    examDate: values.examDate,
    website: (fd.get('website') || '').toString() // honeypot - empty for humans
  };

  submitBtn.disabled = true;
  submitBtn.dataset.state = 'loading';

  try {
    const res = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const data = await res.json();

    if (data.ok && data.paymentReady && data.lpUrl) {
      setFeedback('success', 'מעבירים אותך לדף התשלום המאובטח...');
      // Brief delay so the user sees the success message before the redirect
      setTimeout(() => { window.location.href = data.lpUrl; }, 600);
    } else if (data.ok && data.saved) {
      // Form saved but payment link couldn't be created - fallback
      setFeedback('success',
        (data.message || 'ההרשמה נקלטה. ניצור איתך קשר תוך 24 שעות.') + ' לפרטים: 053-775-7323.'
      );
      submitBtn.disabled = false;
      submitBtn.dataset.state = '';
    } else {
      setFeedback('error',
        (data.error || 'משהו השתבש') + ' - נסה שוב או חייג 053-775-7323.'
      );
      submitBtn.disabled = false;
      submitBtn.dataset.state = '';
    }
  } catch (err) {
    setFeedback('error', 'בעיית רשת. נסה שוב או חייג 053-775-7323.');
    submitBtn.disabled = false;
    submitBtn.dataset.state = '';
  }
});

// Clear error on input
FIELDS.forEach(name => {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) {
    const evt = (el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(evt, () => setErr(name, ''));
  }
});

/* ================= REVEAL ================= */
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '-10% 0px -10% 0px' });

  document.querySelectorAll('.unlock-card, .step, .who-item, .visual-card').forEach(el => {
    el.classList.add('reveal');
    io.observe(el);
  });
}

/* ================= EXAM DATE GUARD ================= */
// Drop exam-date options whose DD.MM.YYYY value is already in the past,
// so a stale HTML deploy can never sell a past date.
(() => {
  const sel = document.getElementById('examDate');
  if (!sel) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  Array.from(sel.options).forEach(opt => {
    const m = opt.value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (d < today) opt.remove();
  });
})();

/* ================= HYPERSPEED LAZY LOAD ================= */
// The 637KB decorative footer band loads only when the footer approaches
// the viewport, and never under prefers-reduced-motion (CSS hides it there).
(() => {
  const band = document.querySelector('.footer-hyperspeed');
  if (!band) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const load = () => import('./hyperspeed.bundle.js');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        load();
      }
    }, { rootMargin: '600px 0px' });
    io.observe(band);
  } else {
    load();
  }
})();

/* ================= BIRTH DATE MAX ================= */
const birthDateEl = document.getElementById('birthDate');
if (birthDateEl) {
  // Local-date formatting: toISOString() is UTC and shifts the day for UTC+ audiences.
  const fmtLocal = dt => dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
  const today = new Date();
  birthDateEl.max = fmtLocal(new Date(today.getFullYear() - 14, today.getMonth(), today.getDate()));
  birthDateEl.min = fmtLocal(new Date(today.getFullYear() - 100, today.getMonth(), today.getDate()));
}
