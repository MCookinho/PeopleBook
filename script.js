import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, signOut, onAuthStateChanged, GitHubAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBU8NQWncMLinjlLnAPdYGMAtXTBbYGgtE",
    authDomain: "peoplebook-796a3.firebaseapp.com",
    projectId: "peoplebook-796a3",
    storageBucket: "peoplebook-796a3.firebasestorage.app",
    messagingSenderId: "1084822654112",
    appId: "1:1084822654112:web:ea84b34b469259d8090dc5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GitHubAuthProvider();

const API_URL = "https://peoplebook-lyart.vercel.app";

let currentUser = null;
let userCooldownEnd = null;
let cooldownInterval = null;

const elements = {
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    btnAddContent: document.getElementById("btn-add-content"),
    btnExportPdf: document.getElementById("btn-export-pdf"),
    btnCloseModal: document.getElementById("btn-close-modal"),
    btnSubmit: document.getElementById("btn-submit"),
    userInfo: document.getElementById("user-info"),
    userSection: document.getElementById("user-section"),
    actionsSection: document.getElementById("actions-section"),
    usernameDisplay: document.getElementById("username-display"),
    bottomPanel: document.getElementById("bottom-panel"),
    panelToggle: document.getElementById("panel-toggle"),
    modalOverlay: document.getElementById("modal-overlay"),
    textInput: document.getElementById("text-input"),
    charCount: document.getElementById("current-chars"),
    bookTitle: document.getElementById("book-title"),
    bookText: document.getElementById("book-text"),
    cooldownTimer: document.getElementById("cooldown-timer"),
    cooldownTime: document.getElementById("cooldown-time"),
    rewriteTime: document.getElementById("rewrite-time")
};

elements.panelToggle.addEventListener("click", () => {
    elements.bottomPanel.classList.toggle("collapsed");
});

elements.btnLogin.addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login failed:", error);
    }
});

elements.btnLogout.addEventListener("click", async () => {
    await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        elements.userSection.classList.add("hidden");
        elements.userInfo.classList.remove("hidden");
        elements.actionsSection.classList.remove("hidden");
        elements.usernameDisplay.textContent = user.displayName || user.email;
        await loadUserData(user.uid);
    } else {
        elements.userSection.classList.remove("hidden");
        elements.userInfo.classList.add("hidden");
        elements.actionsSection.classList.add("hidden");
    }
});

async function loadUserData(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.cooldownEnd) {
            userCooldownEnd = data.cooldownEnd.toDate();
            startCooldownTimer();
        }
    } else {
        await setDoc(userRef, {
            githubUsername: currentUser.displayName,
            lastSubmission: null,
            cooldownEnd: null
        });
    }
}

elements.btnAddContent.addEventListener("click", () => {
    if (userCooldownEnd && new Date() < userCooldownEnd) {
        alert("You must wait before contributing again!");
        return;
    }
    elements.modalOverlay.classList.remove("hidden");
    elements.textInput.value = "";
    elements.charCount.textContent = "0";
    elements.btnSubmit.disabled = true;
});

elements.btnCloseModal.addEventListener("click", () => {
    elements.modalOverlay.classList.add("hidden");
});

elements.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elements.modalOverlay) {
        elements.modalOverlay.classList.add("hidden");
    }
});

elements.textInput.addEventListener("input", () => {
    const len = elements.textInput.value.length;
    elements.charCount.textContent = len;
    elements.btnSubmit.disabled = len === 0;
});

elements.btnSubmit.addEventListener("click", async () => {
    const text = elements.textInput.value.trim();
    if (!text || !currentUser) return;

    elements.btnSubmit.disabled = true;
    elements.btnSubmit.textContent = "Submitting...";

    try {
        const response = await fetch(`${API_URL}/api/submitContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                userId: currentUser.uid,
                username: currentUser.displayName || currentUser.email
            })
        });

        if (!response.ok) throw new Error("Failed to submit");

        const cooldownEnd = new Date(Date.now() + 60 * 60 * 1000);
        userCooldownEnd = cooldownEnd;

        await setDoc(doc(db, "users", currentUser.uid), {
            lastSubmission: serverTimestamp(),
            cooldownEnd: cooldownEnd
        }, { merge: true });

        startCooldownTimer();
        elements.modalOverlay.classList.add("hidden");
        alert("Your contribution has been added!");
    } catch (error) {
        console.error("Submit failed:", error);
        alert("Failed to submit. Please try again.");
    } finally {
        elements.btnSubmit.textContent = "Submit";
        elements.btnSubmit.disabled = false;
    }
});

function startCooldownTimer() {
    if (cooldownInterval) clearInterval(cooldownInterval);
    elements.cooldownTimer.classList.remove("hidden");

    cooldownInterval = setInterval(() => {
        const now = new Date();
        if (userCooldownEnd && now < userCooldownEnd) {
            const diff = userCooldownEnd - now;
            elements.cooldownTime.textContent = formatDuration(diff);
        } else {
            elements.cooldownTimer.classList.add("hidden");
            clearInterval(cooldownInterval);
            userCooldownEnd = null;
        }
    }, 1000);
}

function startRewriteTimer(rewriteDate) {
    const rewriteInterval = setInterval(() => {
        const now = new Date();
        const diff = rewriteDate - now;
        if (diff > 0) {
            elements.rewriteTime.textContent = formatDaysDuration(diff);
        } else {
            elements.rewriteTime.textContent = "Rewriting now...";
            clearInterval(rewriteInterval);
        }
    }, 1000);
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatDaysDuration(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${d}d ${h}h ${m}m`;
}

function pad(n) {
    return String(n).padStart(2, "0");
}

async function listenRewriteTimer() {
    try {
        const response = await fetch(`${API_URL}/api/getConfig`);
        const data = await response.json();
        if (data.nextRewriteDate) {
            startRewriteTimer(new Date(data.nextRewriteDate));
        }
    } catch (error) {
        console.error("Failed to load config:", error);
    }
}

async function loadBook() {
    try {
        const response = await fetch(`${API_URL}/api/getBook`);
        if (!response.ok) throw new Error("Book not found");
        const data = await response.json();
        renderBook(data);
    } catch (error) {
        console.error("Failed to load book:", error);
        elements.bookText.innerHTML = '<p class="loading-text">The story has not begun yet. Be the first to contribute!</p>';
    }
}

function renderBook(data) {
    elements.bookTitle.textContent = data.title || "The People's Book";

    let html = "";
    if (data.chapters && data.chapters.length > 0) {
        data.chapters.forEach(chapter => {
            html += `<p>${escapeHtml(chapter)}</p>`;
        });
    } else {
        html = '<p class="loading-text">The story has not begun yet. Be the first to contribute!</p>';
    }
    elements.bookText.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

elements.btnExportPdf.addEventListener("click", () => {
    const element = document.getElementById("book-content");
    const title = elements.bookTitle.textContent;

    const opt = {
        margin: [15, 15, 15, 15],
        filename: `${title.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(element).save();
});

loadBook();
listenRewriteTimer();
elements.bottomPanel.classList.add("collapsed");
