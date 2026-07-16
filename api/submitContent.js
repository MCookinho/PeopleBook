export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(204).end();
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

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
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

        let sha = null;
        let chapters = [];

        if (getFileRes.ok) {
            const fileData = await getFileRes.json();
            sha = fileData.sha;
            const content = JSON.parse(
                Buffer.from(fileData.content, "base64").toString("utf-8")
            );
            chapters = content.chapters || [];
        }

        chapters.push(text);

        const bookData = {
            title: "The People's Book",
            chapters: chapters,
        };

        const encodedContent = Buffer.from(
            JSON.stringify(bookData, null, 2)
        ).toString("base64");

        const body = {
            message: `Add contribution by ${username}`,
            content: encodedContent,
        };

        if (sha) body.sha = sha;

        const commitRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${BOOK_FILE}`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            }
        );

        if (!commitRes.ok) {
            const err = await commitRes.json();
            throw new Error(err.message || "GitHub commit failed");
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Submit error:", error);
        return res.status(500).json({ error: "Failed to submit content" });
    }
}
