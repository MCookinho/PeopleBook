import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    });
}

const db = getFirestore();

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const AUTH_HEADER = req.headers.authorization;
    if (AUTH_HEADER !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const configSnap = await db.doc("config/global").get();
    const config = configSnap.exists ? configSnap.data() : null;

    if (config && config.nextRewriteDate) {
        const nextRewrite = new Date(config.nextRewriteDate);
        if (new Date() < nextRewrite) {
            return res.status(200).json({ message: "Not time yet", nextRewrite: config.nextRewriteDate });
        }
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const GITHUB_MODELS_TOKEN = process.env.GITHUB_MODELS_TOKEN;
    const BOOK_FILE = "livro.json";

    try {
        const getFileRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${BOOK_FILE}`,
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3+json",
                },
            }
        );

        if (!getFileRes.ok) throw new Error("Failed to fetch book");

        const fileData = await getFileRes.json();
        const sha = fileData.sha;
        const bookData = JSON.parse(
            Buffer.from(fileData.content, "base64").toString("utf-8")
        );

        if (!bookData.chapters || bookData.chapters.length === 0) {
            return res.status(200).json({ message: "No chapters to rewrite" });
        }

        const allText = bookData.chapters.join("\n\n");

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

        const aiRes = await fetch(
            "https://models.inference.ai.azure.com/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${GITHUB_MODELS_TOKEN}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.8,
                    max_tokens: 4000,
                }),
            }
        );

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            throw new Error(`AI API error: ${aiRes.status} - ${errText}`);
        }

        const aiResult = await aiRes.json();
        const aiText = aiResult.choices[0].message.content;

        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No valid JSON in AI response");

        const rewrittenBook = JSON.parse(jsonMatch[0]);

        const encodedContent = Buffer.from(
            JSON.stringify(rewrittenBook, null, 2)
        ).toString("base64");

        await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${BOOK_FILE}`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: "AI rewrite: biweekly story consolidation",
                    content: encodedContent,
                    sha: sha,
                }),
            }
        );

        const nextRewrite = new Date();
        nextRewrite.setDate(nextRewrite.getDate() + 14);

        await db.doc("config/global").set(
            {
                lastRewriteDate: new Date().toISOString(),
                nextRewriteDate: nextRewrite.toISOString(),
                currentTitle: rewrittenBook.title,
            },
            { merge: true }
        );

        return res.status(200).json({
            success: true,
            title: rewrittenBook.title,
        });
    } catch (error) {
        console.error("Rewrite error:", error);
        return res.status(500).json({ error: "Rewrite failed" });
    }
}
