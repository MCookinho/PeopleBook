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

    try {
        const configRef = db.doc("config/global");
        const configSnap = await configRef.get();

        if (!configSnap.exists) {
            const nextRewrite = new Date();
            nextRewrite.setDate(nextRewrite.getDate() + 14);

            await configRef.set({
                lastRewriteDate: null,
                nextRewriteDate: nextRewrite.toISOString(),
                currentTitle: "The People's Book",
            });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Init config error:", error);
        return res.status(500).json({ error: "Failed to init config" });
    }
}
