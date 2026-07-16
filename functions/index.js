const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Octokit } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");

admin.initializeApp();
const db = admin.firestore();

const GITHUB_TOKEN = functions.config().github.token;
const GITHUB_REPO = functions.config().github.repo;
const GITHUB_OWNER = functions.config().github.owner;
const BOOK_FILE = "livro.json";
const GITHUB_MODELS_TOKEN = functions.config().github_models.token;
const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com";

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function getFileContent() {
    try {
        const { data } = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: BOOK_FILE,
        });
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { content: JSON.parse(content), sha: data.sha };
    } catch (error) {
        if (error.status === 404) {
            return {
                content: { title: "The People's Book", chapters: [] },
                sha: null,
            };
        }
        throw error;
    }
}

async function commitFile(content, sha, message) {
    const contentStr = JSON.stringify(content, null, 2);
    const encodedContent = Buffer.from(contentStr).toString("base64");

    const params = {
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: BOOK_FILE,
        message: message,
        content: encodedContent,
    };

    if (sha) params.sha = sha;

    return octokit.repos.createOrUpdateFileContents(params);
}

// --- Submit Content ---
exports.submitContent = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(204).send("");
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { text, userId, username } = req.body;

    if (!text || !userId || !username) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (text.length > 500) {
        return res.status(400).json({ error: "Text exceeds 500 characters" });
    }

    try {
        const { content, sha } = await getFileContent();
        content.chapters.push(text);
        await commitFile(content, sha, `Add contribution by ${username}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Submit error:", error);
        return res.status(500).json({ error: "Failed to submit content" });
    }
});

// --- AI Rewrite (Scheduled every 2 weeks) ---
exports.rewriteBook = functions.pubsub.schedule("every 2 weeks").onRun(async (context) => {
    try {
        const { content, sha } = await getFileContent();

        if (!content.chapters || content.chapters.length === 0) {
            console.log("No chapters to rewrite");
            return null;
        }

        const allText = content.chapters.join("\n\n");

        const prompt = `You are a creative writer and editor. You have been given raw contributions from multiple people who are writing a book together. Your task is to:

1. Read all the raw contributions
2. Filter out irrelevant, repetitive, or low-quality content
3. Weave everything into a cohesive, engaging story IN ENGLISH
4. You have FULL creative control over:
   - The title (rename if needed)
   - The overall narrative structure
   - Character development
   - Plot direction
   - Writing style and tone
5. Leave room for future chapters and contributions
6. Make the story detailed and immersive
7. Maintain thematic consistency

Raw contributions:
---
${allText}
---

Write the complete rewritten book as a JSON object with this structure:
{
  "title": "Your Creative Title",
  "chapters": ["chapter1 text", "chapter2 text", ...]
}

Each chapter should be a substantial paragraph (200-400 words). Return ONLY valid JSON, no other text.`;

        const response = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GITHUB_MODELS_TOKEN}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8,
                max_tokens: 4000,
            }),
        });

        if (!response.ok) {
            throw new Error(`AI API error: ${response.status}`);
        }

        const aiResult = await response.json();
        const aiText = aiResult.choices[0].message.content;

        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No valid JSON found in AI response");
        }

        const rewrittenBook = JSON.parse(jsonMatch[0]);

        await commitFile(rewrittenBook, sha, "AI rewrite: biweekly story consolidation");

        const nextRewrite = new Date();
        nextRewrite.setDate(nextRewrite.getDate() + 14);

        await db.doc("config/global").set({
            lastRewriteDate: admin.firestore.FieldValue.serverTimestamp(),
            nextRewriteDate: nextRewrite,
            currentTitle: rewrittenBook.title,
        }, { merge: true });

        console.log("Book rewritten successfully:", rewrittenBook.title);
        return null;
    } catch (error) {
        console.error("Rewrite error:", error);
        return null;
    }
});

// --- Initialize Global Config ---
exports.initConfig = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    const configRef = db.doc("config/global");
    const configSnap = await configRef.get();

    if (!configSnap.exists) {
        const nextRewrite = new Date();
        nextRewrite.setDate(nextRewrite.getDate() + 14);

        await configRef.set({
            lastRewriteDate: null,
            nextRewriteDate: nextRewrite,
            currentTitle: "The People's Book",
        });
    }

    return res.status(200).json({ success: true });
});
