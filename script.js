const firebaseConfig = {
    apiKey: "AIzaSyBU8NQWncMLinjlLnAPdYGMAtXTBbYGgtE",
    authDomain: "peoplebook-796a3.firebaseapp.com",
    projectId: "peoplebook-796a3",
    storageBucket: "peoplebook-796a3.firebasestorage.app",
    messagingSenderId: "1084822654112",
    appId: "1:1084822654112:web:ea84b34b469259d8090dc5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GithubAuthProvider();

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

elements.panelToggle.addEventListener("click", function() {
    elements.bottomPanel.classList.toggle("collapsed");
});

elements.btnLogin.addEventListener("click", function() {
    auth.signInWithPopup(provider).catch(function(error) {
        console.error("Login failed:", error);
        alert("Login failed: " + error.message);
    });
});

elements.btnLogout.addEventListener("click", function() {
    auth.signOut();
});

auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (user) {
        elements.userSection.classList.add("hidden");
        elements.userInfo.classList.remove("hidden");
        elements.actionsSection.classList.remove("hidden");
        elements.usernameDisplay.textContent = user.displayName || user.email;
        loadUserData(user.uid);
    } else {
        elements.userSection.classList.remove("hidden");
        elements.userInfo.classList.add("hidden");
        elements.actionsSection.classList.add("hidden");
    }
});

function loadUserData(uid) {
    db.collection("users").doc(uid).get().then(function(doc) {
        if (doc.exists) {
            var data = doc.data();
            if (data.cooldownEnd) {
                userCooldownEnd = data.cooldownEnd.toDate();
                startCooldownTimer();
            }
        } else {
            db.collection("users").doc(uid).set({
                githubUsername: currentUser.displayName,
                lastSubmission: null,
                cooldownEnd: null
            });
        }
    });
}

elements.btnAddContent.addEventListener("click", function() {
    if (userCooldownEnd && new Date() < userCooldownEnd) {
        alert("You must wait before contributing again!");
        return;
    }
    elements.modalOverlay.classList.remove("hidden");
    elements.textInput.value = "";
    elements.charCount.textContent = "0";
    elements.btnSubmit.disabled = true;
});

elements.btnCloseModal.addEventListener("click", function() {
    elements.modalOverlay.classList.add("hidden");
});

elements.modalOverlay.addEventListener("click", function(e) {
    if (e.target === elements.modalOverlay) {
        elements.modalOverlay.classList.add("hidden");
    }
});

elements.textInput.addEventListener("input", function() {
    var len = elements.textInput.value.length;
    elements.charCount.textContent = len;
    elements.btnSubmit.disabled = len === 0;
});

elements.btnSubmit.addEventListener("click", function() {
    var text = elements.textInput.value.trim();
    if (!text || !currentUser) return;

    elements.btnSubmit.disabled = true;
    elements.btnSubmit.textContent = "Submitting...";

    fetch(API_URL + "/api/submitContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            text: text,
            userId: currentUser.uid,
            username: currentUser.displayName || currentUser.email
        })
    }).then(function(response) {
        if (!response.ok) throw new Error("Failed to submit");
        return response.json();
    }).then(function() {
        var cooldownEnd = new Date(Date.now() + 60 * 60 * 1000);
        userCooldownEnd = cooldownEnd;

        return db.collection("users").doc(currentUser.uid).set({
            lastSubmission: firebase.firestore.FieldValue.serverTimestamp(),
            cooldownEnd: cooldownEnd
        }, { merge: true });
    }).then(function() {
        startCooldownTimer();
        elements.modalOverlay.classList.add("hidden");
        alert("Your contribution has been added!");
    }).catch(function(error) {
        console.error("Submit failed:", error);
        alert("Failed to submit. Please try again.");
    }).finally(function() {
        elements.btnSubmit.textContent = "Submit";
        elements.btnSubmit.disabled = false;
    });
});

function startCooldownTimer() {
    if (cooldownInterval) clearInterval(cooldownInterval);
    elements.cooldownTimer.classList.remove("hidden");

    cooldownInterval = setInterval(function() {
        var now = new Date();
        if (userCooldownEnd && now < userCooldownEnd) {
            var diff = userCooldownEnd - now;
            elements.cooldownTime.textContent = formatDuration(diff);
        } else {
            elements.cooldownTimer.classList.add("hidden");
            clearInterval(cooldownInterval);
            userCooldownEnd = null;
        }
    }, 1000);
}

function startRewriteTimer(rewriteDate) {
    var rewriteInterval = setInterval(function() {
        var now = new Date();
        var diff = rewriteDate - now;
        if (diff > 0) {
            elements.rewriteTime.textContent = formatDaysDuration(diff);
        } else {
            elements.rewriteTime.textContent = "Rewriting now...";
            clearInterval(rewriteInterval);
        }
    }, 1000);
}

function formatDuration(ms) {
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function formatDaysDuration(ms) {
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return d + "d " + h + "h " + m + "m";
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function listenRewriteTimer() {
    fetch(API_URL + "/api/getConfig").then(function(response) {
        return response.json();
    }).then(function(data) {
        if (data.nextRewriteDate) {
            startRewriteTimer(new Date(data.nextRewriteDate));
        }
    }).catch(function(error) {
        console.error("Failed to load config:", error);
    });
}

function loadBook() {
    fetch(API_URL + "/api/getBook").then(function(response) {
        if (!response.ok) throw new Error("Book not found");
        return response.json();
    }).then(function(data) {
        renderBook(data);
    }).catch(function(error) {
        console.error("Failed to load book:", error);
        elements.bookText.innerHTML = '<p class="loading-text">The story has not begun yet. Be the first to contribute!</p>';
    });
}

function renderBook(data) {
    elements.bookTitle.textContent = data.title || "The People's Book";

    var html = "";
    if (data.chapters && data.chapters.length > 0) {
        data.chapters.forEach(function(chapter) {
            html += "<p>" + escapeHtml(chapter) + "</p>";
        });
    } else {
        html = '<p class="loading-text">The story has not begun yet. Be the first to contribute!</p>';
    }
    elements.bookText.innerHTML = html;
}

function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

elements.btnExportPdf.addEventListener("click", function() {
    var element = document.getElementById("book-content");
    var title = elements.bookTitle.textContent;

    var opt = {
        margin: [15, 15, 15, 15],
        filename: title.replace(/\s+/g, "_") + ".pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
    };

    html2pdf().set(opt).from(element).save();
});

loadBook();
listenRewriteTimer();
elements.bottomPanel.classList.add("collapsed");
