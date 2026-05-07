/* ============================================================
   admin-reply.js
   AI Reply Feature — Gemini Nano (window.ai) + Gemini API fallback
   UX FLOW: Open → Generate (explicit) → Review & Edit → Confirm → Send
   Portfolio Admin Panel — sriramkannan.netlify.app
   ============================================================ */

// ─── CONFIG ────────────────────────────────────────────────
// Your Gemini API key (fallback only — admin panel is private)
const GEMINI_API_KEY = 'AIzaSyC4oUnPnzsMGfJyFH3ERB-K4beYQup5pbg';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

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
function openReplyModal({ name, email, subject, message }) {
  currentContact = { name, email, subject, message };
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
    draft.style.background = '';
  }

  // Reset AI badge
  const badge = document.getElementById('aiEngineBadge');
  if (badge) {
    badge.textContent = 'Not started';
    badge.style.background = '#f0f0f0';
    badge.style.color = '#777';
  }
  const statusDot = document.getElementById('aiStatusDot');
  if (statusDot) statusDot.textContent = '';

  // Reset buttons to initial state
  setGenerateBtn('idle');
  setSendBtn(false);   // Send is DISABLED until draft is ready
  const regenBtn = document.getElementById('regenBtn');
  if (regenBtn) regenBtn.style.display = 'none';
  const helperText = document.getElementById('replyHelperText');
  if (helperText) helperText.textContent = 'Generate a draft first, then review and send.';

  // Show modal
  const overlay = document.getElementById('replyOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
  } else {
    console.error('AI Reply: #replyOverlay element not found in DOM');
  }
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
    draft.style.background = '';
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
    draft.style.background = '#fff';
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
      statusEl.textContent = 'Loading model...';
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

    statusEl.textContent = 'Generating on-device...';

    // Stream the response into the textarea
    const stream = aiSession.promptStreaming(prompt);
    let fullText = '';

    for await (const chunk of stream) {
      fullText = chunk; // chunk is cumulative in the Prompt API
      draftEl.value = fullText;
    }

    statusEl.textContent = 'Done · on-device';
  } catch (err) {
    console.warn('Gemini Nano failed, falling back to API:', err);
    statusEl.textContent = 'Nano failed — using API...';
    const badge = document.getElementById('aiEngineBadge');
    badge.textContent = 'Gemini 2.0 Flash';
    badge.style.background = '#e8f0fe';
    badge.style.color = '#3c3399';
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
    draftEl.value = buildFallbackTemplate(currentContact);
    statusEl.textContent = 'AI unavailable — template used';
    document.getElementById('aiEngineBadge').textContent = 'Template';
    document.getElementById('aiEngineBadge').style.background = '#fff3e0';
    document.getElementById('aiEngineBadge').style.color = '#e65100';
  }
}

// ─── SEND REPLY VIA GMAIL ──────────────────────────────────
function sendReply() {
  if (!currentContact || !draftReady) return;

  const draft = document.getElementById('replyDraft').value.trim();
  if (!draft) {
    alert('The reply is empty. Please generate or type a reply first.');
    return;
  }

  // ── Confirmation step — admin must confirm before anything is sent ──
  const confirmed = confirm(
    `Send this reply to ${currentContact.name || 'this visitor'} at ${currentContact.email}?\n\nClick OK to open Gmail with your reply pre-filled.`
  );
  if (!confirmed) return;

  const subject = encodeURIComponent('Re: ' + (currentContact.subject || 'Your message'));
  const body = encodeURIComponent(draft);
  const to = encodeURIComponent(currentContact.email || '');

  // Open Gmail compose with everything pre-filled
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
  window.open(gmailUrl, '_blank', 'noopener,noreferrer');

  closeReplyModal();
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
function buildFallbackTemplate({ name, subject }) {
  const firstName = (name || 'there').split(' ')[0];
  return `Hi ${firstName},

Thank you for reaching out through my portfolio! I appreciate your message regarding "${subject || 'your query'}".

I'll review it carefully and get back to you as soon as possible. Feel free to connect with me on LinkedIn in the meantime.

Best regards,
${YOUR_NAME}`;
}

// ─── UTILITY ──────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── EXPOSE FUNCTIONS GLOBALLY ────────────────────────────
window.openReplyModal = openReplyModal;
window.closeReplyModal = closeReplyModal;
window.generateDraft = generateDraft;
window.regenerateDraft = regenerateDraft;
window.sendReply = sendReply;
