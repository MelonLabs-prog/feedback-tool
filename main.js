import html2canvas from 'html2canvas';

// === DOM Elements ===
const inputTabs = document.getElementById('inputTabs');
const tabWrite = document.getElementById('tabWrite');
const tabSpeak = document.getElementById('tabSpeak');
const writeSection = document.getElementById('writeSection');
const speakSection = document.getElementById('speakSection');
const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const writeSubmitBtn = document.getElementById('writeSubmitBtn');
const recordBtn = document.getElementById('recordBtn');
const recordLabel = recordBtn.querySelector('.record-label');
const timer = document.getElementById('timer');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const playbackSection = document.getElementById('playbackSection');
const audioPlayer = document.getElementById('audioPlayer');
const audioSubmitBtn = document.getElementById('audioSubmitBtn');
const loadingSection = document.getElementById('loadingSection');
const loadingText = document.getElementById('loadingText');
const feedbackSection = document.getElementById('feedbackSection');
const errorSection = document.getElementById('errorSection');
const errorText = document.getElementById('errorText');
const openInBrowserBtn = document.getElementById('openInBrowserBtn');
const resetBtn = document.getElementById('resetBtn');
const errorResetBtn = document.getElementById('errorResetBtn');
const reRecordBtn = document.getElementById('reRecordBtn');
const mobileCta = document.getElementById('mobileCta');
const mobileUploadBtn = document.getElementById('mobileUploadBtn');
const mobileFileName = document.getElementById('mobileFileName');

// === Environment Detection ===
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isMicApiMissing = !navigator.mediaDevices?.getUserMedia;
const cameFromApp = new URLSearchParams(window.location.search).get('src') === 'app';

// === Mobile landing ===
if (isMobile && !cameFromApp) {
  mobileCta.hidden = false;
  inputTabs.style.display = 'none';
  writeSection.style.display = 'none';
  speakSection.style.display = 'none';
}

mobileUploadBtn.addEventListener('click', () => fileInput.click());

// === State ===
let currentMode = 'write'; // 'write' | 'speak'
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let isRecording = false;
let timerInterval = null;
let seconds = 0;
let lastFeedbackData = null;
let lastInputType = null; // 'text' | 'audio'
let lastCanvas = null;

const MAX_DURATION_SEC = 180;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2000;

// === Tab Switching ===
tabWrite.addEventListener('click', () => switchTab('write'));
tabSpeak.addEventListener('click', () => switchTab('speak'));

function switchTab(mode) {
  currentMode = mode;
  tabWrite.classList.toggle('active', mode === 'write');
  tabSpeak.classList.toggle('active', mode === 'speak');
  writeSection.hidden = mode !== 'write';
  writeSection.style.display = mode === 'write' ? '' : 'none';
  speakSection.hidden = mode !== 'speak';
  speakSection.style.display = mode === 'speak' ? '' : 'none';
  // Hide playback when switching tabs
  playbackSection.hidden = true;
}

// === Character Count ===
textInput.addEventListener('input', () => {
  charCount.textContent = `${textInput.value.length} / ${MAX_TEXT_LENGTH}`;
});

// === Write Mode Submit ===
writeSubmitBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  if (!text) return;
  if (text.length < 10) {
    showError('Please write at least 10 characters to get meaningful feedback.');
    return;
  }
  await submitFeedback('text', { text });
});

// === Recording ===
recordBtn.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
});

async function startRecording() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      showMicError();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      showPlayback(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;
    seconds = 0;
    recordBtn.classList.add('recording');
    recordLabel.textContent = 'Tap to Stop';
    timer.hidden = false;
    updateTimer();
    timerInterval = setInterval(() => {
      seconds++;
      updateTimer();
      if (seconds >= MAX_DURATION_SEC) stopRecording();
    }, 1000);
  } catch (err) {
    showMicError();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  clearInterval(timerInterval);
  recordBtn.classList.remove('recording');
  recordLabel.textContent = 'Tap to Record';
  timer.hidden = true;
}

function updateTimer() {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

// === File Upload ===
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    showError('File is too large. Please upload an audio file under 10MB.');
    fileInput.value = '';
    return;
  }

  fileName.textContent = file.name;
  if (isMobile) mobileFileName.textContent = file.name;
  audioBlob = file;
  showPlayback(audioBlob);
});

// === Playback ===
function showPlayback(blob) {
  const url = URL.createObjectURL(blob);
  audioPlayer.src = url;
  playbackSection.hidden = false;
  speakSection.style.display = 'none';
  if (isMobile) mobileCta.hidden = true;
}

// === Audio Submit ===
audioSubmitBtn.addEventListener('click', async () => {
  if (!audioBlob) return;

  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const rawType = audioBlob.type
    || (audioBlob.name?.endsWith('.mp3') ? 'audio/mpeg'
      : audioBlob.name?.endsWith('.wav') ? 'audio/wav'
      : audioBlob.name?.endsWith('.m4a') ? 'audio/mp4'
      : audioBlob.name?.endsWith('.ogg') ? 'audio/ogg'
      : audioBlob.name?.endsWith('.flac') ? 'audio/flac'
      : 'audio/webm');
  const MIME_MAP = {
    'audio/x-m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/mp3': 'audio/mpeg',
  };
  const mimeType = MIME_MAP[rawType] || rawType;

  await submitFeedback('audio', { audio: base64, mimeType });
});

// === Unified Submit ===
async function submitFeedback(type, payload) {
  lastInputType = type;

  writeSubmitBtn.disabled = true;
  audioSubmitBtn.disabled = true;
  playbackSection.hidden = true;
  writeSection.style.display = 'none';
  inputTabs.style.display = 'none';
  feedbackSection.hidden = true;
  errorSection.hidden = true;
  loadingSection.hidden = false;
  loadingText.textContent = type === 'text'
    ? 'Reading your writing and preparing feedback...'
    : 'Listening to your audio and preparing feedback...';

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server error (${res.status})`);
    }

    const data = await res.json();
    lastFeedbackData = data;
    renderFeedback(data, type);
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    writeSubmitBtn.disabled = false;
    audioSubmitBtn.disabled = false;
    loadingSection.hidden = true;
  }
}

// === Score Dimensions ===
const AUDIO_SCORES = [
  { key: 'grammar', label: 'Grammar' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'pronunciation', label: 'Pronunciation' },
  { key: 'fluency', label: 'Fluency' },
];

const TEXT_SCORES = [
  { key: 'grammar', label: 'Grammar' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'style', label: 'Style' },
];

function getScoreTier(score) {
  if (score >= 85) return 'score-great';
  if (score >= 70) return 'score-high';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

// === Inline Diff Highlighting ===
function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightDiff(original, fixed) {
  const origWords = original.split(/\s+/);
  const fixWords = fixed.split(/\s+/);
  const m = origWords.length, n = fixWords.length;

  // LCS dp
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origWords[i - 1].toLowerCase() === fixWords[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const origInLCS = new Set();
  const fixInLCS = new Set();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (origWords[i - 1].toLowerCase() === fixWords[j - 1].toLowerCase()) {
      origInLCS.add(i - 1);
      fixInLCS.add(j - 1);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const origHTML = origWords.map((w, idx) =>
    origInLCS.has(idx) ? escapeHTML(w) : `<span class="fix-hl">${escapeHTML(w)}</span>`
  ).join(' ');

  const fixHTML = fixWords.map((w, idx) =>
    fixInLCS.has(idx) ? escapeHTML(w) : `<span class="fix-hl">${escapeHTML(w)}</span>`
  ).join(' ');

  return { origHTML, fixHTML };
}

// === Render Feedback ===
function renderFeedback(data, type) {
  const scores = data.scores || {};
  const overall = typeof scores.overall === 'number' ? scores.overall : null;
  const scoreFields = type === 'audio' ? AUDIO_SCORES : TEXT_SCORES;

  // Well done
  document.getElementById('wellDoneText').textContent = data.wellDone || 'Great job practicing today!';

  // Score circle
  const scoreCircle = document.getElementById('scoreCircle');
  const scoreNumber = document.getElementById('scoreNumber');
  const scoreLabelEl = document.getElementById('scoreLabel');
  if (overall !== null) {
    scoreNumber.textContent = overall;
    scoreLabelEl.textContent = data.scoreLabel || '';
    scoreCircle.className = 'score-circle ' + getScoreTier(overall);
  }

  // Sub-scores
  scoreFields.forEach((field, i) => {
    const idx = i + 1;
    const val = typeof scores[field.key] === 'number' ? scores[field.key] : null;
    document.getElementById(`sub${idx}Name`).textContent = field.label;
    const barEl = document.getElementById(`sub${idx}Bar`);
    const valEl = document.getElementById(`sub${idx}Value`);
    if (val !== null) {
      barEl.style.width = `${val}%`;
      barEl.className = `sub-score-bar ${getScoreTier(val)}`;
      valEl.textContent = val;
    }
  });

  // Word count
  const wordCount = data.wordCount || (data.transcript ? data.transcript.trim().split(/\s+/).length : 0);
  document.getElementById('feedbackWordCount').textContent = wordCount;

  // Transcript / original text
  const transcriptLabel = document.getElementById('transcriptLabel');
  transcriptLabel.textContent = type === 'text' ? '📝 What you wrote' : '📝 What we heard';
  document.getElementById('transcriptText').textContent = data.transcript || 'No content available.';

  // Fixes (stacked before/after with diff highlighting)
  const fix1 = data.fixes?.[0];
  if (fix1) {
    document.getElementById('fix1Title').textContent = fix1.title;
    const diff1 = highlightDiff(fix1.original || '', fix1.fix);
    document.getElementById('fix1Original').innerHTML = diff1.origHTML;
    document.getElementById('fix1Fix').innerHTML = diff1.fixHTML;
    document.getElementById('fix1Note').textContent = fix1.note;
    document.getElementById('fix1Card').hidden = false;
  } else {
    document.getElementById('fix1Card').hidden = true;
  }

  const fix2 = data.fixes?.[1];
  if (fix2) {
    document.getElementById('fix2Title').textContent = fix2.title;
    const diff2 = highlightDiff(fix2.original || '', fix2.fix);
    document.getElementById('fix2Original').innerHTML = diff2.origHTML;
    document.getElementById('fix2Fix').innerHTML = diff2.fixHTML;
    document.getElementById('fix2Note').textContent = fix2.note;
    document.getElementById('fix2Card').hidden = false;
  } else {
    document.getElementById('fix2Card').hidden = true;
  }

  // Upgrade (stacked before/after with diff highlighting)
  const upgrade = data.upgrade;
  if (upgrade) {
    document.getElementById('upgradeTitle').textContent = upgrade.title;
    const diffUp = highlightDiff(upgrade.original || '', upgrade.fix);
    document.getElementById('upgradeOriginal').innerHTML = diffUp.origHTML;
    document.getElementById('upgradeFix').innerHTML = diffUp.fixHTML;
    document.getElementById('upgradeNote').textContent = upgrade.note;
  }

  // Bonus card (pronunciation or clarity/style)
  const bonus = data.bonus;
  const bonusCard = document.getElementById('bonusCard');
  if (bonus) {
    document.getElementById('bonusTitle').textContent = bonus.title;
    const diffBonus = highlightDiff(bonus.original || '', bonus.fix);
    document.getElementById('bonusOriginal').innerHTML = diffBonus.origHTML;
    document.getElementById('bonusFix').innerHTML = diffBonus.fixHTML;
    document.getElementById('bonusNote').textContent = bonus.note;

    if (type === 'audio') {
      bonusCard.className = 'card bonus-card bonus-audio';
      document.getElementById('bonusBadge').className = 'card-badge badge-pron';
      document.getElementById('bonusBadge').textContent = 'Pronunciation 🗣️';
      document.getElementById('bonusFixLabel').textContent = 'Say it like this:';
    } else {
      bonusCard.className = 'card bonus-card bonus-text';
      document.getElementById('bonusBadge').className = 'card-badge badge-clarity';
      document.getElementById('bonusBadge').textContent = 'Clarity & Style ✏️';
      document.getElementById('bonusFixLabel').textContent = 'Try this instead:';
    }
    bonusCard.hidden = false;
  } else {
    bonusCard.hidden = true;
  }

  // Full corrected versions (Alternative Rephraser)
  const fc = data.fullCorrected;
  if (fc) {
    window._fcData = fc;
    window._fcActive = 'clean';
    document.getElementById('fcContent').textContent = fc.clean || '';
    document.getElementById('fcDesc').textContent = 'Only grammar & spelling fixed — your words, your voice.';
    document.querySelectorAll('.fc-tab').forEach(t => t.classList.toggle('active', t.dataset.fc === 'clean'));
    document.getElementById('fullCorrectedCard').hidden = false;
  } else {
    document.getElementById('fullCorrectedCard').hidden = true;
  }

  feedbackSection.hidden = false;
}

// === Full Corrected Version Tabs ===
const fcDescs = {
  clean: 'Only grammar & spelling fixed — your words, your voice.',
  polished: 'Smoother flow with minimal tweaks — still your style.',
  native: 'How a native speaker might say the same ideas.',
};
document.querySelectorAll('.fc-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.fc;
    if (!window._fcData) return;
    document.querySelectorAll('.fc-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('fcContent').textContent = window._fcData[key] || '';
    document.getElementById('fcDesc').textContent = fcDescs[key] || '';
    window._fcActive = key;
  });
});

document.getElementById('fcCopyBtn').addEventListener('click', async () => {
  const text = document.getElementById('fcContent').textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('fcCopyBtn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  } catch { /* ignore */ }
});

// === Error ===
function showMicError() {
  if ((isMobile || isMicApiMissing) && !cameFromApp) {
    errorText.textContent = 'Microphone access is not available here. Open in your browser for the full recording experience.';
    openInBrowserBtn.hidden = false;
  } else {
    errorText.textContent = 'Microphone access is required. Please allow microphone access and try again.';
    openInBrowserBtn.hidden = true;
  }
  errorSection.hidden = false;
  loadingSection.hidden = true;
  feedbackSection.hidden = true;
}

function showError(message) {
  errorText.textContent = message;
  openInBrowserBtn.hidden = true;
  errorSection.hidden = false;
  loadingSection.hidden = true;
  feedbackSection.hidden = true;
}

// === Reset ===
function resetAll() {
  audioBlob = null;
  audioChunks = [];
  audioPlayer.src = '';
  fileName.textContent = '';
  fileInput.value = '';
  textInput.value = '';
  charCount.textContent = '0 / 2000';
  playbackSection.hidden = true;
  feedbackSection.hidden = true;
  errorSection.hidden = true;
  loadingSection.hidden = true;
  openInBrowserBtn.hidden = true;

  if (isMobile && !cameFromApp) {
    mobileCta.hidden = false;
    mobileFileName.textContent = '';
    inputTabs.style.display = 'none';
    writeSection.style.display = 'none';
    speakSection.style.display = 'none';
  } else {
    inputTabs.style.display = '';
    switchTab(currentMode);
  }
}

resetBtn.addEventListener('click', resetAll);
errorResetBtn.addEventListener('click', resetAll);
reRecordBtn.addEventListener('click', resetAll);

// === Share Modal ===
const shareBtn = document.getElementById('shareBtn');
const shareModal = document.getElementById('shareModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const copyImgBtn = document.getElementById('copyImgBtn');
const downloadImgBtn = document.getElementById('downloadImgBtn');
const sharePreviewImg = document.getElementById('sharePreviewImg');
const sharePreviewSpinner = document.getElementById('sharePreviewSpinner');
const shareConfirm = document.getElementById('shareConfirm');

shareBtn.addEventListener('click', async () => {
  if (!lastFeedbackData) return;
  shareConfirm.hidden = true;
  sharePreviewImg.hidden = true;
  sharePreviewSpinner.hidden = false;
  sharePreviewSpinner.textContent = '⏳ Generating preview...';
  shareModal.hidden = false;

  // Show/hide audio download based on input type
  downloadAudioBtn.hidden = lastInputType !== 'audio';

  try {
    populateShareCard(lastFeedbackData, lastInputType);
    lastCanvas = await generateShareImage();
    sharePreviewImg.src = lastCanvas.toDataURL('image/png');
    sharePreviewImg.hidden = false;
    sharePreviewSpinner.hidden = true;
  } catch {
    sharePreviewSpinner.textContent = '❌ Could not generate preview.';
  }
});

modalCloseBtn.addEventListener('click', () => { shareModal.hidden = true; });
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) shareModal.hidden = true;
});

// === Image action buttons ===
copyImgBtn.addEventListener('click', async () => {
  if (!lastCanvas) return;
  copyImgBtn.disabled = true;
  try {
    await new Promise((resolve, reject) => {
      lastCanvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          resolve();
        } catch (e) { reject(e); }
      }, 'image/png');
    });
    shareConfirm.textContent = '✅ Image copied! Paste it in the comments 🎉';
  } catch {
    shareConfirm.textContent = '❌ Copy not supported on this device. Use Download instead.';
  } finally {
    copyImgBtn.disabled = false;
    shareConfirm.hidden = false;
    setTimeout(() => { shareConfirm.hidden = true; }, 4000);
  }
});

downloadImgBtn.addEventListener('click', () => {
  if (!lastCanvas) return;
  const url = lastCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'smart-english-coach-progress.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  shareConfirm.textContent = '📥 Image saved!';
  shareConfirm.hidden = false;
  setTimeout(() => { shareConfirm.hidden = true; }, 3000);
});

// === Share card population ===
function populateShareCard(data, type) {
  const scores = data.scores || {};
  const overall = typeof scores.overall === 'number' ? scores.overall : null;
  const scoreFields = type === 'audio' ? AUDIO_SCORES : TEXT_SCORES;

  const scCircle = document.getElementById('scScoreCircle');
  document.getElementById('scScoreNumber').textContent = overall !== null ? overall : '--';
  document.getElementById('scScoreLabel').textContent = data.scoreLabel || '';
  if (overall !== null) scCircle.className = 'sc-score-circle ' + getScoreTier(overall);

  // Sub-scores
  scoreFields.forEach((field, i) => {
    const idx = i + 1;
    const val = typeof scores[field.key] === 'number' ? scores[field.key] : null;
    document.getElementById(`scSub${idx}Name`).textContent = field.label;
    const barEl = document.getElementById(`scSub${idx}Bar`);
    const valEl = document.getElementById(`scSub${idx}Value`);
    if (val !== null) {
      barEl.style.width = `${val}%`;
      barEl.className = `sc-sub-bar ${getScoreTier(val)}`;
      valEl.textContent = val;
    }
  });

  // Summary items
  document.getElementById('scFix1Title').textContent = data.fixes?.[0]?.title || '';
  document.getElementById('scFix1Fix').textContent = data.fixes?.[0]?.fix || '';
  document.getElementById('scFix2Title').textContent = data.fixes?.[1]?.title || '';
  document.getElementById('scFix2Fix').textContent = data.fixes?.[1]?.fix || '';
  document.getElementById('scUpgradeTitle').textContent = data.upgrade?.title || '';
  document.getElementById('scUpgradeFix').textContent = data.upgrade?.fix || '';

  const bonusRow = document.getElementById('scBonusRow');
  const scBonusBadge = document.getElementById('scBonusBadge');
  const scBonusFix = document.getElementById('scBonusFix');
  if (data.bonus) {
    document.getElementById('scBonusTitle').textContent = data.bonus.title || '';
    scBonusFix.textContent = data.bonus.fix || '';
    if (type === 'audio') {
      scBonusBadge.className = 'sc-item-badge sc-badge-pron';
      scBonusBadge.textContent = 'Pronunciation 🗣️';
      scBonusFix.className = 'sc-item-fix sc-item-fix--pron';
    } else {
      scBonusBadge.className = 'sc-item-badge sc-badge-clarity';
      scBonusBadge.textContent = 'Clarity ✏️';
      scBonusFix.className = 'sc-item-fix sc-item-fix--clarity';
    }
    bonusRow.style.display = '';
  } else {
    bonusRow.style.display = 'none';
  }
}

async function generateShareImage() {
  const shareCard = document.getElementById('shareCard');
  shareCard.style.position = 'fixed';
  shareCard.style.left = '-9999px';
  shareCard.style.top = '0';
  shareCard.style.display = 'block';

  try {
    const canvas = await html2canvas(shareCard, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas;
  } finally {
    shareCard.style.display = 'none';
    shareCard.style.position = '';
    shareCard.style.left = '';
    shareCard.style.top = '';
  }
}

// === Audio Download ===
downloadAudioBtn.addEventListener('click', async () => {
  if (!audioBlob) return;
  downloadAudioBtn.disabled = true;
  downloadAudioBtn.textContent = '⏳ Converting to MP3...';

  try {
    const mp3Blob = await convertToMp3(audioBlob);
    const url = URL.createObjectURL(mp3Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart-english-coach-recording.mp3';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('MP3 conversion failed:', err);
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart-english-coach-recording.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    downloadAudioBtn.disabled = false;
    downloadAudioBtn.textContent = '🎵 Download Audio';
  }
});

async function convertToMp3(blob) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const kbps = 128;

  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const blockSize = 1152;
  const mp3Data = [];

  if (numChannels === 1) {
    const samples = convertFloat32ToInt16(audioBuffer.getChannelData(0));
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const mp3buf = mp3Encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
  } else {
    const left = convertFloat32ToInt16(audioBuffer.getChannelData(0));
    const right = convertFloat32ToInt16(audioBuffer.getChannelData(1));
    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = left.subarray(i, i + blockSize);
      const rightChunk = right.subarray(i, i + blockSize);
      const mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
  }

  const end = mp3Encoder.flush();
  if (end.length > 0) mp3Data.push(end);
  audioCtx.close();

  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

function convertFloat32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}
