/* =====================================================
   DKS Sport Driving License Course — Landing Page Logic
   - Validation
   - Submit to Google Apps Script Web App (proxy to Google Form)
   - Nav scroll behavior + mobile toggle
   - Reveal animations
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

/* ================= FORM ================= */
const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const feedback = document.getElementById('formFeedback');

const FIELDS = ['fullName', 'birthDate', 'email', 'idNumber', 'phone'];

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
      const age = (now - d) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 18) {
        errs.birthDate = 'הקורס מחייב גיל 18 ומעלה';
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
    errs.phone = 'טלפון חייב להיות 10 ספרות שמתחילים ב-05';
    ok = false;
  }

  return { ok, errs };
}

function isValidIsraeliId(id) {
  // Standard Israeli ID checksum (Luhn-like, base 10)
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
    phone: (fd.get('phone') || '').toString().trim()
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
    phone: values.phone
  };

  submitBtn.disabled = true;
  submitBtn.dataset.state = 'loading';

  try {
    const res = await fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      // Apps Script Web App accepts text/plain to avoid CORS preflight issues
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const data = await res.json();

    if (data.ok) {
      form.style.display = 'none';
      setFeedback('success',
        'תודה! ההרשמה נקלטה. ניצור איתך קשר תוך 24 שעות עם פרטי המחזור הקרוב. אם זה דחוף — 053-775-7323.'
      );
      window.scrollTo({ top: feedback.offsetTop - 120, behavior: 'smooth' });
    } else {
      setFeedback('error',
        (data.error || 'משהו השתבש') + ' — נסה שוב או חייג 053-775-7323.'
      );
      submitBtn.disabled = false;
      submitBtn.dataset.state = '';
    }
  } catch (err) {
    setFeedback('error',
      'בעיית רשת. נסה שוב או חייג 053-775-7323.'
    );
    submitBtn.disabled = false;
    submitBtn.dataset.state = '';
  }
});

// Clear error on input
FIELDS.forEach(name => {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.addEventListener('input', () => setErr(name, ''));
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

/* ================= BIRTH DATE MAX ================= */
// Set max attribute to today minus 18 years on date input
const birthDateEl = document.getElementById('birthDate');
if (birthDateEl) {
  const today = new Date();
  const max = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  birthDateEl.max = max.toISOString().split('T')[0];
  const min = new Date(today.getFullYear() - 80, today.getMonth(), today.getDate());
  birthDateEl.min = min.toISOString().split('T')[0];
}
