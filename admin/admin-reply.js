/* ============================================================
   admin-reply.js
   AI Reply Feature — Gemini Nano (window.ai) + Gemini API fallback
   UX FLOW: Open → Generate (explicit) → Review & Edit → Confirm → Send
   Portfolio Admin Panel — sriramkannan.netlify.app
   ============================================================ */

// ─── CONFIG ────────────────────────────────────────────────
// API key loaded from admin/env.js (gitignored — never committed)
const GEMINI_API_KEY = window.ENV?.GEMINI_API_KEY || '';
const GEMINI_API_URL = GEMINI_API_KEY
  ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY
  : '';

if (!GEMINI_API_KEY) {
  console.warn('AI Reply: No Gemini API key found. Create admin/env.js with window.ENV = { GEMINI_API_KEY: "..." }');
}

// Your name (appears in AI-drafted replies)
const YOUR_NAME = 'Sriram Kannan';
const YOUR_EMAIL = 'sriramkannan01062005@gmail.com';

// ─── STATE ─────────────────────────────────────────────────
let currentContact = null;
let aiSession = null;
let draftReady = false;      // tracks if a draft has been generated
let isGenerating = false;    // prevents double-clicks on Generate

// ─── OPEN MODAL ────────────────────────────────────────────
// Called when admin clicks Reply on a message card.
// Modal opens with EMPTY textarea — NO auto-generation.
// Admin must explicitly click "Generate Draft".
function openReplyModal({ id, name, email, subject, message, timestamp }) {
  currentContact = { id, name, email, subject, message, timestamp };
  draftReady = false;

  // Populate header + original message
  const replyToName = document.getElementById('replyToName');
  const replyToEmail = document.getElementById('replyToEmail');
  const replyOriginalMsg = document.getElementById('replyOriginalMsg');
  if (replyToName) replyToName.textContent = 'Reply to ' + (name || 'Visitor');
  if (replyToEmail) replyToEmail.textContent = email || '';
  if (replyOriginalMsg) replyOriginalMsg.textContent = message || '';

  // Reset textarea — EMPTY, not generated yet
  const draft = document.getElementById('replyDraft');
  if (draft) {
    draft.value = '';
    draft.placeholder = "Click 'Generate Draft' to create an AI reply...";
  }

  // Reset AI badge
  const badge = document.getElementById('aiEngineBadge');
  if (badge) {
    badge.textContent = 'Not started';
    badge.style.background = '';
    badge.style.color = '';
  }
  const statusDot = document.getElementById('aiStatusDot');
  if (statusDot) statusDot.textContent = '';

  // Reset buttons to initial state
  setGenerateBtn('idle');
  setSendBtn(false);
  const regenBtn = document.getElementById('regenBtn');
  if (regenBtn) regenBtn.style.display = 'none';
  const helperText = document.getElementById('replyHelperText');
  if (helperText) helperText.textContent = 'Generate a draft first, then review and send.';

  // Load previous replies from Firebase
  loadPreviousReplies(id);

  // Show modal
  const overlay = document.getElementById('replyOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

// ─── PREVIOUS REPLIES ─────────────────────────────────────
function loadPreviousReplies(messageId) {
  const section = document.getElementById('previousRepliesSection');
  const list = document.getElementById('previousRepliesList');
  const label = document.getElementById('prevRepliesLabel');
  const toggleIcon = document.getElementById('prevRepliesToggleIcon');

  if (!section || !list) return;

  // Reset
  list.innerHTML = '';
  list.style.display = 'none';
  if (toggleIcon) toggleIcon.textContent = '▶';

  const replies = (window._repliesMap && window._repliesMap[messageId]) || [];

  if (replies.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Populate
  if (label) label.textContent = `Previous Replies (${replies.length})`;
  replies.forEach(reply => {
    const card = document.createElement('div');
    card.className = 'prev-reply-card';
    const date = reply.sentAt ? new Date(reply.sentAt).toLocaleString() : 'Unknown date';
    card.innerHTML = `
      <div class="prev-reply-date">Sent on ${date}</div>
      <div class="prev-reply-text">${escapeHTMLReply(reply.replyContent || '')}</div>
    `;
    list.appendChild(card);
  });

  section.style.display = 'block';
}

function togglePreviousReplies() {
  const list = document.getElementById('previousRepliesList');
  const icon = document.getElementById('prevRepliesToggleIcon');
  if (!list) return;
  const isHidden = list.style.display === 'none';
  list.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.textContent = isHidden ? '▼' : '▶';
}

function escapeHTMLReply(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── CLOSE MODAL ───────────────────────────────────────────
function closeReplyModal() {
  const overlay = document.getElementById('replyOverlay');
  if (overlay) overlay.style.display = 'none';
  // Destroy Gemini Nano session to free memory
  if (aiSession) {
    try { aiSession.destroy(); } catch (e) { /* ignore */ }
    aiSession = null;
  }
  currentContact = null;
  draftReady = false;
  isGenerating = false;
}

// Close on overlay background click + Escape key
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('replyOverlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeReplyModal();
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('replyOverlay');
    if (overlay && overlay.style.display === 'flex') {
      closeReplyModal();
    }
  }
});

// ─── GENERATE DRAFT (explicit — admin clicks button) ───────
async function generateDraft() {
  if (!currentContact || isGenerating) return;
  isGenerating = true;
  draftReady = false;

  const draft = document.getElementById('replyDraft');
  const badge = document.getElementById('aiEngineBadge');
  const status = document.getElementById('aiStatusDot');
  const regenBtn = document.getElementById('regenBtn');
  const helperText = document.getElementById('replyHelperText');

  // Lock UI during generation
  if (draft) {
    draft.value = '';
    draft.placeholder = 'Generating...';
  }
  setGenerateBtn('loading');
  setSendBtn(false);    // Keep Send DISABLED while generating
  if (regenBtn) regenBtn.style.display = 'none';
  if (helperText) helperText.textContent = 'AI is writing your reply...';
  if (status) status.textContent = 'Thinking...';

  const prompt = buildPrompt(currentContact);

  // Try Gemini Nano first, fall back to Gemini API
  const nanoAvailable = await checkNanoAvailable();

  if (nanoAvailable) {
    if (badge) {
      badge.textContent = 'Gemini Nano';
      badge.style.background = '#e8f5e9';
      badge.style.color = '#2e7d32';
    }
    await generateWithNano(prompt, draft, status);
  } else {
    if (badge) {
      badge.textContent = 'Gemini 2.0 Flash';
      badge.style.background = '#e8f0fe';
      badge.style.color = '#3c3399';
    }
    await generateWithGeminiAPI(prompt, draft, status);
  }

  // ── Generation complete ──
  isGenerating = false;
  draftReady = true;

  // Unlock textarea for editing
  if (draft) {
    draft.placeholder = 'Review and edit your reply before sending...';
  }

  // Enable Send button — admin can now send
  setSendBtn(true);

  // Show Regenerate button
  if (regenBtn) regenBtn.style.display = 'inline-flex';

  // Reset Generate button label
  setGenerateBtn('done');

  if (helperText) helperText.textContent =
    'Review the draft above. Edit freely, then click Send when ready.';
}

// ─── REGENERATE ────────────────────────────────────────────
// Admin explicitly asks for a fresh draft — resets Send until new draft is done
async function regenerateDraft() {
  draftReady = false;
  setSendBtn(false);
  const regenBtn = document.getElementById('regenBtn');
  if (regenBtn) regenBtn.style.display = 'none';
  const helperText = document.getElementById('replyHelperText');
  if (helperText) helperText.textContent = 'Generating a new draft...';
  await generateDraft();
}

// ─── CHECK GEMINI NANO AVAILABILITY ────────────────────────
async function checkNanoAvailable() {
  try {
    // Check for Chrome built-in AI (LanguageModel API)
    if (typeof LanguageModel !== 'undefined') {
      const availability = await LanguageModel.availability({
        expectedInputLanguages: ['en'],
        expectedOutputLanguages: ['en']
      });
      return availability === 'available' || availability === 'downloadable';
    }
    // Legacy window.ai check
    if (window.ai && window.ai.languageModel) {
      const capabilities = await window.ai.languageModel.capabilities();
      return capabilities.available === 'readily';
    }
    return false;
  } catch {
    return false;
  }
}

// ─── GEMINI NANO (LanguageModel / window.ai) ───────────────
async function generateWithNano(prompt, draftEl, statusEl) {
  try {
    statusEl.textContent = 'Running on-device...';

    if (!aiSession) {
      if (statusEl) statusEl.textContent = 'Loading model...';
      // Try new LanguageModel API first, then legacy window.ai
      if (typeof LanguageModel !== 'undefined') {
        aiSession = await LanguageModel.create({
          systemPrompt: buildSystemPrompt(),
          expectedInputLanguages: ['en'],
          expectedOutputLanguages: ['en']
        });
      } else {
        aiSession = await window.ai.languageModel.create({
          systemPrompt: buildSystemPrompt()
        });
      }
    }

    if (statusEl) statusEl.textContent = 'Generating on-device...';

    // Stream the response into the textarea
    const stream = aiSession.promptStreaming(prompt);
    let fullText = '';

    for await (const chunk of stream) {
      // Handle both cumulative (newer API) and incremental chunk formats
      if (typeof chunk === 'string') {
        // Check if cumulative (chunk gets longer) or incremental
        fullText = chunk.length > fullText.length ? chunk : fullText + chunk;
      } else if (chunk?.text) {
        fullText += chunk.text;
      } else {
        fullText += String(chunk);
      }
      if (draftEl) draftEl.value = fullText;
    }

    // If Nano returned empty, fall back to API
    if (!fullText.trim()) {
      console.warn('Gemini Nano returned empty response, falling back to API');
      if (statusEl) statusEl.textContent = 'Nano empty — using API...';
      const badge = document.getElementById('aiEngineBadge');
      if (badge) {
        badge.textContent = 'Gemini 2.0 Flash';
        badge.style.background = '';
        badge.style.color = '';
      }
      await generateWithGeminiAPI(prompt, draftEl, statusEl);
      return;
    }

    if (statusEl) statusEl.textContent = 'Done · on-device';
  } catch (err) {
    console.warn('Gemini Nano failed, falling back to API:', err);
    if (statusEl) statusEl.textContent = 'Nano failed — using API...';
    const badge = document.getElementById('aiEngineBadge');
    if (badge) {
      badge.textContent = 'Gemini 2.0 Flash';
      badge.style.background = '';
      badge.style.color = '';
    }
    await generateWithGeminiAPI(prompt, draftEl, statusEl);
  }
}

// ─── GEMINI API FALLBACK ───────────────────────────────────
async function generateWithGeminiAPI(prompt, draftEl, statusEl) {
  try {
    statusEl.textContent = 'Calling Gemini API...';

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildSystemPrompt() }]
        },
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 400,
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Gemini API error');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Simulate typing effect for UX
    draftEl.value = '';
    for (let i = 0; i < text.length; i++) {
      draftEl.value += text[i];
      if (i % 8 === 0) await sleep(12);
    }

    statusEl.textContent = 'Done · Gemini API';
  } catch (err) {
    console.error('Gemini API error:', err);
    if (draftEl) draftEl.value = buildFallbackTemplate(currentContact);
    if (statusEl) statusEl.textContent = 'AI unavailable — template used';
    const badge = document.getElementById('aiEngineBadge');
    if (badge) {
      badge.textContent = 'Template';
      badge.style.background = '#fff3e0';
      badge.style.color = '#e65100';
    }
  }
}

// ─── SEND REPLY ────────────────────────────────────────────
async function sendReply() {
  if (!currentContact || !draftReady) return;

  const draftEl = document.getElementById('replyDraft');
  const draft = draftEl?.value.trim();
  if (!draft) {
    alert('The reply is empty. Please generate or type a reply first.');
    return;
  }

  // ── Confirmation step — custom modal ──
  const confirmed = await showConfirm(
    'Send this reply?',
    `Your reply will be sent to <strong>${currentContact.name || 'this visitor'}</strong> at <strong>${currentContact.email}</strong>`
  );
  if (!confirmed) return;

  const sendBtn = document.getElementById('sendBtn');
  const subject = 'Re: ' + (currentContact.subject || 'Your message');
  const SEND_URL = window.ENV?.SEND_EMAIL_URL;

  // ── Direct send via Google Apps Script ──
  if (SEND_URL) {
    // Show sending state
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
      sendBtn.style.cursor = 'wait';
    }

    try {
      const response = await fetch(SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          to: currentContact.email,
          subject: subject,
          body: draft,
          senderName: YOUR_NAME
        })
      });

      const result = await response.json();

      if (result.success) {
        // ✅ Email sent successfully — mark as replied
        markAsReplied();
        if (sendBtn) {
          sendBtn.textContent = '✓ Sent!';
          sendBtn.style.background = '#10b981';
        }
        setTimeout(() => closeReplyModal(), 1200);
      } else {
        throw new Error(result.error || 'Failed to send');
      }
    } catch (err) {
      console.error('Email send error:', err);
      alert('Failed to send email: ' + err.message + '\n\nOpening Gmail compose as fallback...');
      // Fall back to Gmail compose
      openGmailCompose(currentContact.email, subject, draft);
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send via Gmail ↗';
        sendBtn.style.cursor = 'pointer';
      }
    }
  } else {
    // No API URL configured — fall back to Gmail compose
    openGmailCompose(currentContact.email, subject, draft);
    closeReplyModal();
  }
}

// ─── GMAIL COMPOSE FALLBACK ───────────────────────────────
function openGmailCompose(to, subject, body) {
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(gmailUrl, '_blank', 'noopener,noreferrer');
}

// ─── BUTTON STATE HELPERS ──────────────────────────────────
// Controls the Generate Draft button appearance
function setGenerateBtn(state) {
  const btn = document.getElementById('generateBtn');
  const icon = document.getElementById('generateBtnIcon');
  const label = document.getElementById('generateBtnLabel');
  if (!btn || !icon || !label) return;

  if (state === 'idle') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    icon.textContent = '✦';
    label.textContent = 'Generate Draft';
  } else if (state === 'loading') {
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
    icon.textContent = '⏳';
    label.textContent = 'Generating...';
  } else if (state === 'done') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    icon.textContent = '✦';
    label.textContent = 'Generate Again';
  }
}

// Controls the Send button — DISABLED until draft is ready
function setSendBtn(enabled) {
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.background = enabled ? '#1a73e8' : '#ccc';
  btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  btn.title = enabled ? 'Send via Gmail' : 'Generate a draft first';
}

// ─── PROMPT BUILDER ───────────────────────────────────────
function buildSystemPrompt() {
  return `You are ${YOUR_NAME}, a Machine Learning developer and AI/Data Science student.
You are replying to a contact form message from your personal portfolio website.
Write professional, warm, concise email replies in first person.
Keep replies under 120 words. Do not include a subject line.
Do not use placeholder text like [your name] — sign off as ${YOUR_NAME}.
Always end with a professional sign-off followed by "${YOUR_NAME}".
Match the tone to the message: friendly for general queries, formal for job/internship inquiries.`;
}

function buildPrompt({ name, subject, message }) {
  return `Someone named "${name || 'a visitor'}" sent this message via my portfolio contact form.
Subject: "${subject || 'No subject'}"
Message: "${message || ''}"

Write a professional reply email body (no subject line needed).
Address them by their first name. Be warm and specific to their message.
End with: Best regards,\n${YOUR_NAME}`;
}

// ─── TEMPLATE FALLBACK (when all AI fails) ────────────────
function buildFallbackTemplate(contact) {
  const name = contact?.name || 'there';
  const subject = contact?.subject || 'your query';
  const firstName = name.split(' ')[0];
  return `Hi ${firstName},

Thank you for reaching out through my portfolio! I appreciate your message regarding "${subject}".

I'll review it carefully and get back to you as soon as possible. Feel free to connect with me on LinkedIn in the meantime.

Best regards,
${YOUR_NAME}`;
}

// ─── UTILITY ──────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── REPLY STATUS TRACKING (Firebase + localStorage fallback) ──
async function markAsReplied() {
  if (!currentContact) return;

  const draft = document.getElementById('replyDraft');
  const replyContent = draft?.value?.trim() || '';
  const messageId = currentContact.id || '';
  const replyData = {
    messageId: messageId,
    to: currentContact.email || '',
    toName: currentContact.name || '',
    subject: 'Re: ' + (currentContact.subject || 'Your message'),
    replyContent: replyContent,
    sentAt: new Date().toISOString(),
    sentBy: YOUR_NAME
  };

  // Save to Firebase
  try {
    if (window.firebaseDb && window.firebaseModules) {
      const { collection, addDoc, Timestamp } = window.firebaseModules;
      replyData.sentAtTimestamp = Timestamp.now();
      await addDoc(collection(window.firebaseDb, 'replies'), replyData);
      console.log('✅ Reply saved to Firebase');
    }
  } catch (err) {
    console.warn('Failed to save reply to Firebase:', err);
  }

  // Also save to localStorage as fallback
  const key = 'replied_' + (messageId || currentContact.email + '_' + currentContact.timestamp);
  localStorage.setItem(key, new Date().toISOString());

  // Update the message card UI in real-time
  updateMessageCardBadge(messageId);
}

function updateMessageCardBadge(messageId) {
  const btns = document.querySelectorAll('.ai-reply-btn');
  btns.forEach(btn => {
    const btnId = btn.getAttribute('data-id');
    if (btnId === messageId) {
      // Update button text
      btn.innerHTML = btn.innerHTML.replace('AI Reply', 'Reply Again');
      // Add replied badge to the card header
      const card = btn.closest('.message-card');
      if (card) {
        const h4 = card.querySelector('h4');
        if (h4 && !h4.querySelector('.replied-badge')) {
          const badge = document.createElement('span');
          badge.className = 'replied-badge';
          badge.textContent = '✓ Replied';
          h4.appendChild(badge);
        }
      }
    }
  });
}

// ─── CUSTOM CONFIRM MODAL ─────────────────────────────────
let _confirmResolver = null;

function showConfirm(title, message) {
  return new Promise((resolve) => {
    _confirmResolver = resolve;
    const overlay = document.getElementById('confirmOverlay');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (overlay) overlay.style.display = 'flex';
  });
}

function resolveConfirm(value) {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) overlay.style.display = 'none';
  if (_confirmResolver) {
    _confirmResolver(value);
    _confirmResolver = null;
  }
}

// Close confirm on overlay click or Escape
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) resolveConfirm(false);
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _confirmResolver) {
    resolveConfirm(false);
  }
});

// ─── EXPOSE FUNCTIONS GLOBALLY ────────────────────────────
window.openReplyModal = openReplyModal;
window.closeReplyModal = closeReplyModal;
window.generateDraft = generateDraft;
window.regenerateDraft = regenerateDraft;
window.sendReply = sendReply;
window.resolveConfirm = resolveConfirm;
window.showConfirm = showConfirm;
window.togglePreviousReplies = togglePreviousReplies;
